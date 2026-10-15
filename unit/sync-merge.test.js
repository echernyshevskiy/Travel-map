import { describe, it, expect } from 'vitest';
import { itemJson, mergeFields, mergeKind, parseTokenExpiry } from '../src/lib/sync-merge.js';

describe('mergeFields — слияние записи по полям', () => {
  it('одинаковые данные — берётся более свежая отметка, без fieldTimes', () => {
    const l = { id: 1, name: 'A', updatedAt: 5 }, r = { id: 1, name: 'A', updatedAt: 3 };
    expect(mergeFields(l, r)).toBe(l);
  });
  it('правки разных полей на двух устройствах сохраняются обе', () => {
    // базовая версия от t=100; телефон в t=200 правит заметку, компьютер в t=300 — цвет
    const phone = { id: 1, name: 'Тбилиси', note: 'хинкали', color: '#111', updatedAt: 200, fieldTimes: { note: 200 }, ftBase: 100 };
    const pc = { id: 1, name: 'Тбилиси', note: '', color: '#e33', updatedAt: 300, fieldTimes: { color: 300 }, ftBase: 100 };
    const m = mergeFields(phone, pc);
    expect(m).toMatchObject({ note: 'хинкали', color: '#e33', name: 'Тбилиси', updatedAt: 300 });
    expect(m.fieldTimes).toEqual({ note: 200, color: 300 });
    expect(m.ftBase).toBe(100);
    expect(mergeFields(pc, phone)).toEqual(m);   // порядок не важен
  });
  it('заметка с телефона и год с ноутбука не затирают друг друга', () => {
    const base = { id: 'x', type: 'city', name: 'Казань', year: 2019, updatedAt: 100 };
    const phone = { ...base, notes: 'с телефона', updatedAt: 200, fieldTimes: { notes: 200 }, ftBase: 100 };
    const laptop = { ...base, year: 2021, updatedAt: 300, fieldTimes: { year: 300 }, ftBase: 100 };
    for(const m of [mergeFields(phone, laptop), mergeFields(laptop, phone)]){
      expect(m).toMatchObject({ notes: 'с телефона', year: 2021, name: 'Казань', updatedAt: 300 });
    }
  });
  it('одно поле на обоих устройствах — побеждает более поздняя правка', () => {
    const a = { id: 1, note: 'раньше', updatedAt: 200, fieldTimes: { note: 200 }, ftBase: 100 };
    const b = { id: 1, note: 'позже', updatedAt: 250, fieldTimes: { note: 250 }, ftBase: 100 };
    expect(mergeFields(a, b).note).toBe('позже');
    expect(mergeFields(b, a).note).toBe('позже');
  });
  it('старые записи без fieldTimes — целиком по updatedAt, при равенстве — версия с GitHub (правая)', () => {
    expect(mergeFields({ x: 1, updatedAt: 10 }, { x: 2, updatedAt: 5 }).x).toBe(1);
    expect(mergeFields({ x: 1, updatedAt: 5 }, { x: 2, updatedAt: 5 }).x).toBe(2);
    expect(mergeFields({ x: 1 }, { x: 2 }).x).toBe(2);
  });
  it('удалённое поле остаётся удалённым, если удаление новее', () => {
    const l = { id: 1, album: 'https://x', updatedAt: 100 };
    const r = { id: 1, updatedAt: 200, fieldTimes: { album: 200 }, ftBase: 100 };
    expect('album' in mergeFields(l, r)).toBe(false);
  });
  it('не-объекты (метаданные поездки строкой) — по времени', () => {
    expect(mergeFields('a', 'b')).toBe('b');
  });
  it('itemJson не учитывает служебные поля', () => {
    expect(itemJson({ a: 1, updatedAt: 5, fieldTimes: { a: 5 }, ftBase: 1 })).toBe('{"a":1}');
  });
});

describe('mergeKind — слияние списков с удалениями', () => {
  const pairs = arr => arr.map(x => [x.id, x]);
  it('объединяет записи, локальный порядок первым', () => {
    const { pairs: out, tomb } = mergeKind(pairs([{ id: 'a', updatedAt: 1 }, { id: 'b', updatedAt: 1 }]), pairs([{ id: 'c', updatedAt: 1 }, { id: 'a', updatedAt: 1 }]), {}, {});
    expect(out.map(p => p[0])).toEqual(['a', 'b', 'c']);
    expect(tomb).toEqual({});
  });
  it('удаление на другом устройстве убирает запись, если оно позже правки', () => {
    const { pairs: out, tomb } = mergeKind(pairs([{ id: 'a', updatedAt: 10 }]), [], {}, { a: 20 });
    expect(out).toEqual([]);
    expect(tomb).toEqual({ a: 20 });
  });
  it('правка новее удаления — запись возвращается, отметка удаления снимается', () => {
    const { pairs: out, tomb } = mergeKind(pairs([{ id: 'a', updatedAt: 30 }]), [], {}, { a: 20 });
    expect(out.map(p => p[0])).toEqual(['a']);
    expect(tomb).toEqual({});
  });
  it('из двух отметок удаления берётся более поздняя; входные объекты не меняются', () => {
    const lt = { a: 5, b: 50 }, rt = { a: 40 };
    const { tomb } = mergeKind([], [], lt, rt);
    expect(tomb).toEqual({ a: 40, b: 50 });
    expect(rt).toEqual({ a: 40 });
  });
});

describe('parseTokenExpiry', () => {
  const iso = s => new Date(s).getTime();
  it('форматы заголовка GitHub', () => {
    expect(parseTokenExpiry('2026-11-01 00:00:00 UTC')).toBe(iso('2026-11-01T00:00:00Z'));
    expect(parseTokenExpiry('2026-11-01 00:00:00 -0700')).toBe(iso('2026-11-01T07:00:00Z'));
    expect(parseTokenExpiry('2026-11-01 10:00:00 +03:00')).toBe(iso('2026-11-01T07:00:00Z'));
  });
  it('введено вручную — локальное время', () => {
    expect(parseTokenExpiry('2026-11-01T23:59')).toBe(new Date(2026, 10, 1, 23, 59).getTime());
  });
  it('пусто или мусор — NaN', () => {
    expect(parseTokenExpiry('')).toBeNaN();
    expect(parseTokenExpiry(null)).toBeNaN();
    expect(parseTokenExpiry('скоро')).toBeNaN();
  });
});
