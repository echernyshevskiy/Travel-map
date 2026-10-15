import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { gtlParseLL, gtlParseTime, gtlExtract } from '../src/lib/timeline-parse.js';

const fixture = name => JSON.parse(readFileSync(new URL(`../tests/fixtures/timeline-${name}.json`, import.meta.url), 'utf8'));

describe('gtlParseLL — все виды координат Google', () => {
  it.each([
    ['55.75°, 37.62°', [55.75, 37.62]],
    ['geo:55.75,37.62', [55.75, 37.62]],
    ['-33.8688°, 151.2093°', [-33.8688, 151.2093]],
    [{ latitudeE7: 557500000, longitudeE7: 376200000 }, [55.75, 37.62]],
    [{ latE7: -338688000, lngE7: 1512093000 }, [-33.8688, 151.2093]],
    [{ latLng: '1°, 2°' }, [1, 2]],
    [{ LatLng: 'geo:1,2' }, [1, 2]],
  ])('%j', (v, want) => {
    const ll = gtlParseLL(v);
    expect(ll[0]).toBeCloseTo(want[0], 6);
    expect(ll[1]).toBeCloseTo(want[1], 6);
  });
  it('мусор и координаты вне диапазона — null', () => {
    for(const v of [null, undefined, '', 'Москва', '95°, 10°', '10, 200', {}]) expect(gtlParseLL(v)).toBeNull();
  });
});

describe('gtlParseTime', () => {
  it('ISO со смещением, миллисекунды строкой и числом, секунды числом', () => {
    expect(gtlParseTime('2024-05-01T08:00:00+03:00')).toBe(Date.UTC(2024, 4, 1, 5));
    expect(gtlParseTime('1714539600000')).toBe(1714539600000);
    expect(gtlParseTime(1714539600000)).toBe(1714539600000);
    expect(gtlParseTime(1714539600)).toBe(1714539600000);
    expect(gtlParseTime('вчера')).toBeNull();
    expect(gtlParseTime(null)).toBeNull();
  });
});

describe('gtlExtract — три формата выгрузки дают одинаковые визиты', () => {
  const sets = Object.fromEntries(['android', 'ios', 'takeout'].map(n => [n, gtlExtract(fixture(n))]));
  it.each(Object.keys(sets))('%s: 7 визитов, Москва первой', n => {
    const pts = sets[n];
    expect(pts).toHaveLength(7);
    expect(pts.every(p => p.visit && p.end >= p.t)).toBe(true);
    expect(pts[0]).toMatchObject({ lat: 55.75, lng: 37.62 });
  });
  it('Android и iPhone совпадают точь-в-точь', () => {
    expect(sets.ios).toEqual(sets.android);
  });
  it('координаты во всех трёх совпадают', () => {
    // E7-координаты Takeout делятся на 1e7 — сравниваем с точностью до сантиметров
    const ll = p => p.map(x => [+x.lat.toFixed(6), +x.lng.toFixed(6)]);
    expect(ll(sets.takeout)).toEqual(ll(sets.android));
  });
});

describe('gtlExtract — перемещения, путь и Records.json', () => {
  it('activity даёт начало и конец, timelinePath — точки со смещением в минутах', () => {
    const pts = gtlExtract({ semanticSegments: [
      { startTime: '2024-01-01T10:00:00Z', endTime: '2024-01-01T12:00:00Z',
        activity: { start: { latLng: '55.0°, 37.0°' }, end: { latLng: '56.0°, 38.0°' } } },
      { startTime: '2024-01-01T10:00:00Z', endTime: '2024-01-01T12:00:00Z',
        timelinePath: [{ point: '55.5°, 37.5°', durationMinutesOffsetFromStartTime: '30' }, { point: '55.6°, 37.6°', time: '2024-01-01T11:00:00Z' }] },
    ] });
    expect(pts).toHaveLength(4);
    expect(pts.some(p => p.visit)).toBe(false);
    expect(pts[1]).toMatchObject({ lat: 56, lng: 38, t: Date.UTC(2024, 0, 1, 12) });
    expect(pts[2].t).toBe(Date.UTC(2024, 0, 1, 10, 30));
    expect(pts[3].t).toBe(Date.UTC(2024, 0, 1, 11));
  });
  it('rawSignals — только если сегменты ничего не дали', () => {
    const pts = gtlExtract({ semanticSegments: [], rawSignals: [{ position: { LatLng: '41.7°, 44.8°', timestamp: '2024-02-02T00:00:00Z' } }] });
    expect(pts).toEqual([{ lat: 41.7, lng: 44.8, t: Date.UTC(2024, 1, 2), end: Date.UTC(2024, 1, 2), visit: false }]);
  });
  it('Records.json с timestampMs и E7', () => {
    const pts = gtlExtract({ locations: [{ latitudeE7: 417000000, longitudeE7: 448000000, timestampMs: '1700000000000' }, { latitudeE7: 1 }] });
    expect(pts).toHaveLength(1);
    expect(pts[0]).toMatchObject({ lat: 41.7, lng: 44.8, t: 1700000000000 });
  });
  it('незнакомый файл — пустой список, а не ошибка', () => {
    expect(gtlExtract({})).toEqual([]);
    expect(gtlExtract(null)).toEqual([]);
    expect(gtlExtract('строка')).toEqual([]);
  });
});
