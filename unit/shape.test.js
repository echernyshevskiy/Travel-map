import { describe, it, expect } from 'vitest';
import { isUsableEntry, normalizeEntryShape } from '../src/lib/format.js';

describe('isUsableEntry', () => {
  it('только объекты трёх типов', () => {
    expect(isUsableEntry({ type: 'city' })).toBe(true);
    expect(isUsableEntry({ type: 'route' })).toBe(true);
    [null, undefined, 42, 'city', [], { type: 'planet' }, {}].forEach(x => expect(isUsableEntry(x)).toBe(false));
  });
});

describe('normalizeEntryShape', () => {
  it('нормальная запись не меняется', () => {
    const e = { id: 'a', type: 'city', name: 'Казань', lat: 55.79, lng: 49.12, photos: ['https://x/y.jpg'], trip: 'Т', favorite: true };
    const before = JSON.stringify(e);
    expect(normalizeEntryShape(e)).toBe(false);
    expect(JSON.stringify(e)).toBe(before);
  });
  it('координаты: строки — в числа, мусор и выход за пределы — в null', () => {
    const a = { type: 'city', name: 'x', lat: '55.5', lng: '37.5' };
    normalizeEntryShape(a); expect([a.lat, a.lng]).toEqual([55.5, 37.5]);
    const b = { type: 'city', name: 'x', lat: 200, lng: 30 };
    normalizeEntryShape(b); expect([b.lat, b.lng]).toEqual([null, null]);
    const c = { type: 'city', name: 'x', lat: 'abc', lng: NaN };
    expect(normalizeEntryShape(c)).toBe(true); expect([c.lat, c.lng]).toEqual([null, null]);
  });
  it('текстовые поля: число — в строку, объект — убирается', () => {
    const e = { type: 'city', name: 12345, trip: 7, notes: { a: 1 }, company: ['x'] };
    normalizeEntryShape(e);
    expect(e.name).toBe('12345'); expect(e.trip).toBe('7'); expect('notes' in e).toBe(false); expect('company' in e).toBe(false);
  });
  it('фото, избранное, порядок в поездке', () => {
    const e = { type: 'city', name: 'x', photos: 'https://a/b.jpg', favorite: 'да', tripOrder: 'первый' };
    normalizeEntryShape(e);
    expect(e.photos).toEqual(['https://a/b.jpg']); expect(e.favorite).toBe(false); expect('tripOrder' in e).toBe(false);
    const f = { type: 'city', name: 'x', photos: ['a', 5, null], tripOrder: '3' };
    normalizeEntryShape(f); expect(f.photos).toEqual(['a']); expect(f.tripOrder).toBe(3);
  });
  it('массивы точек маршрута выравниваются по названиям', () => {
    const e = { type: 'route', name: 'r', waypointNames: ['A', null, 'C'], waypointCoords: [[55, 37], null, ['x', 'y'], [1, 1]], waypointCountryKeys: 'Russia' };
    normalizeEntryShape(e);
    expect(e.waypointNames).toEqual(['A', '', 'C']);
    expect(e.waypointCoords).toEqual([[55, 37], null, null]);
    expect(e.waypointCountryKeys).toEqual([null, null, null]);
  });
  it('профиль высот и время — только осмысленные', () => {
    const e = { type: 'route', name: 'r', profile: 'высоко', durationMin: -5, elevationGain: '500' };
    normalizeEntryShape(e);
    expect('profile' in e).toBe(false); expect(e.durationMin).toBe(null); expect(e.elevationGain).toBe(500);
    const g = { type: 'route', name: 'r', profile: [[0, 100], [1, 120]] };
    expect(normalizeEntryShape(g)).toBe(false);
  });
});
