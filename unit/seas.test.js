// Справочник подписей морей (src/data/seas.json, собирается scripts/build-seas.mjs)
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import SEAS from '../src/data/seas.json';
import { parseSeaShapes, seaNear, seaUnits, seaBasin } from '../src/lib/seas.js';

const shapes = parseSeaShapes(fs.readFileSync(new URL('../src/data/sea_shapes.txt', import.meta.url), 'utf8'));
const at = (lat, lng, km = 20) => { const r = seaNear(shapes, lat, lng, km); return r ? seaUnits(SEAS, r.i) : []; };

describe('seas.json', () => {
  it('строки правильной формы: название, вид, масштаб, центр и концы двух хорд', () => {
    expect(SEAS.length).toBeGreaterThan(200);
    for(const r of SEAS){
      const [name, kind, z, ...nums] = r;
      expect(typeof name).toBe('string');
      expect(name, name).toMatch(/^[А-ЯЁа-яё0-9 .,'«»()IVX-]+$/);
      expect(['ocean', 'sea', 'gulf']).toContain(kind);
      expect(z).toBeGreaterThanOrEqual(2); expect(z).toBeLessThanOrEqual(7);
      expect(nums).toHaveLength(12);
      const [parent, basin] = nums.slice(10);
      expect(parent === -1 || SEAS[parent], name).toBeTruthy();
      expect(basin === -1 || SEAS[basin][1] === 'ocean', name).toBeTruthy();
      for(let i = 0; i < 10; i += 2){ expect(Math.abs(nums[i]), name).toBeLessThanOrEqual(90); expect(Math.abs(nums[i + 1]), name).toBeLessThanOrEqual(360); }
    }
  });
  it('без ударений и без «голых» имён у важных морей', () => {
    const names = new Set(SEAS.map(r => r[0]));
    for(const n of ['Чёрное море', 'Балтийское море', 'Азовское море', 'Средиземное море', 'Красное море', 'Финский залив', 'Тихий океан', 'Северный Ледовитый океан']) expect(names.has(n), n).toBe(true);
    expect(SEAS.some(r => /́/.test(r[0]))).toBe(false);
  });
  it('океаны появляются раньше морей, моря — раньше заливов', () => {
    const minOf = k => Math.min(...SEAS.filter(r => r[1] === k).map(r => r[2]));
    expect(minOf('ocean')).toBeLessThan(minOf('sea'));
    expect(minOf('sea')).toBeLessThanOrEqual(minOf('gulf'));
  });
});

describe('на каком море город', () => {
  it('приморские города — своё море, залив засчитывается морю', () => {
    expect(at(59.939, 30.316)).toEqual(['Балтийское море']);        // Петербург, Финский залив
    expect(at(43.585, 39.723)).toEqual(['Чёрное море']);            // Сочи
    expect(at(47.21, 38.94)).toEqual(['Азовское море']);            // Таганрог
    expect(at(42.98, 47.5)).toEqual(['Каспийское море']);           // Махачкала
    expect(at(43.12, 131.89)).toEqual(['Японское море']);           // Владивосток
    expect(at(27.26, 33.81)).toEqual(['Красное море']);             // Хургада, Суэцкий залив
    expect(at(38.72, -9.14)).toEqual(['Атлантический океан']);      // Лиссабон
    expect(at(55.68, 12.57)).toEqual(['Балтийское море']);          // Копенгаген, Эресунн
  });
  it('часть Средиземного моря — и она сама, и Средиземное; остров — тоже берег', () => {
    expect(at(43.51, 16.44)).toEqual(['Адриатическое море', 'Средиземное море']); // Сплит
    expect(at(39.57, 2.65)).toEqual(['Балеарское море', 'Средиземное море']);     // Пальма-де-Майорка
    expect(at(37.94, 23.64)).toEqual(['Критское море', 'Эгейское море', 'Средиземное море']); // Пирей
    expect(at(40.64, 22.94)).toEqual(['Эгейское море', 'Средиземное море']);     // Салоники
  });
  it('города вдали от моря — ни к какому', () => {
    for(const [lat, lng] of [[55.756, 37.617], [41.72, 44.78], [45.69, 9.67], [54.9, 26.7], [42.21, 75.75], [41.89, 12.49]]) expect(at(lat, lng), `${lat},${lng}`).toEqual([]);
  });
  it('океан моря: Каспий — внутреннее, Чёрное — Атлантика, Баренцево — Северный Ледовитый', () => {
    const idx = n => SEAS.findIndex(r => r[0] === n);
    expect(seaBasin(SEAS, idx('Каспийское море'))).toBe(null);
    expect(seaBasin(SEAS, idx('Чёрное море'))).toBe('Атлантический океан');
    expect(seaBasin(SEAS, idx('Баренцево море'))).toBe('Северный Ледовитый океан');
    expect(seaBasin(SEAS, idx('Японское море'))).toBe('Тихий океан');
  });
  it('неправильные координаты — без ошибок', () => {
    expect(seaNear(shapes, NaN, 10)).toBe(null);
    expect(seaNear(shapes, null, undefined)).toBe(null);
    expect(at(43.585, 39.723 + 360)).toEqual(['Чёрное море']);
  });
});
