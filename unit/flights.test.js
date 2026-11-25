import { describe, it, expect } from 'vitest';
import { greatCircle, haversine } from '../src/lib/geo.js';
import { isFlight, normalizeEntryShape } from '../src/lib/format.js';

describe('перелёты', () => {
  it('дуга большого круга: концы на месте, длина как по прямой на шаре', () => {
    const svo = [55.977, 37.387],
      led = [59.8, 30.263];
    const arc = greatCircle(svo, led, 32);
    expect(arc.length).toBe(33);
    expect(arc[0]).toEqual([55.977, 37.387]);
    expect(arc[32][0]).toBeCloseTo(59.8, 4);
    expect(arc[32][1]).toBeCloseTo(30.263, 4);
    let len = 0;
    for (let i = 1; i < arc.length; i++) len += haversine(arc[i - 1], arc[i]);
    expect(len).toBeCloseTo(haversine(svo, led), 0);
    // дуга на север выгнута: середина севернее середины по прямой
    const jfk = [40.639, -73.779];
    const mid = greatCircle(svo, jfk, 64)[32];
    expect(mid[0]).toBeGreaterThan((svo[0] + jfk[0]) / 2 + 10);
  });
  it('через линию перемены дат — без скачка через весь мир', () => {
    const nrt = [35.769, 140.389],
      sfo = [37.619, -122.375];
    const arc = greatCircle(nrt, sfo, 64);
    for (let i = 1; i < arc.length; i++) expect(Math.abs(arc[i][1] - arc[i - 1][1])).toBeLessThan(10);
    // конец — та же точка, только долгота продолжена за 180
    expect(arc[64][1]).toBeCloseTo(-122.375 + 360, 3);
  });
  it('совпадающие точки — две точки', () => {
    expect(greatCircle([1, 2], [1, 2])).toEqual([
      [1, 2],
      [1, 2]
    ]);
  });
  it('перелёт — маршрут с занятием «перелёт»', () => {
    expect(isFlight({ type: 'route', activity: 'flight' })).toBe(true);
    expect(isFlight({ type: 'route', activity: 'hiking' })).toBe(false);
    expect(isFlight({ type: 'city', activity: 'flight' })).toBe(false);
    expect(isFlight(null)).toBe(false);
  });
  it('коды аэропортов и номер рейса приводятся к порядку', () => {
    const e = { type: 'route', name: 'x', airports: ['svo', 'LED'], flightNo: '  SU 30 ' };
    expect(normalizeEntryShape(e)).toBe(true);
    expect(e.airports).toEqual(['SVO', 'LED']);
    expect(e.flightNo).toBe('SU 30');
    const bad = { type: 'route', name: 'x', airports: ['SVO', 'Пулково'], flightNo: 42 };
    normalizeEntryShape(bad);
    expect('airports' in bad).toBe(false);
    expect('flightNo' in bad).toBe(false);
  });
});
