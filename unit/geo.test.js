import { describe, it, expect } from 'vitest';
import {
  haversine, pointInRing, pointInGeometry, trackDistanceKm, encodePolyline, decodePolyline,
  getEntryCoords, decodedCoordsCache, downsample, downsampleSegments, gpxDistanceKm,
  geomAreaKm2, polyLabelPoint, mainRing,
} from '../src/lib/geo.js';

// квадрат 1°×1° у экватора, координаты GeoJSON — [lng, lat]
const square = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]];
const squareWithHole = [square, [[0.4, 0.4], [0.6, 0.4], [0.6, 0.6], [0.4, 0.6], [0.4, 0.4]]];

describe('haversine', () => {
  it('Москва — Санкт-Петербург ≈ 634 км', () => {
    expect(haversine([55.7558, 37.6173], [59.9343, 30.3351])).toBeCloseTo(634, -1);
  });
  it('один градус меридиана ≈ 111 км, ноль для одной точки', () => {
    expect(haversine([0, 0], [1, 0])).toBeCloseTo(111.19, 1);
    expect(haversine([10, 20], [10, 20])).toBe(0);
  });
  it('trackDistanceKm — сумма отрезков', () => {
    expect(trackDistanceKm([[0, 0], [1, 0], [2, 0]])).toBeCloseTo(2 * 111.19, 1);
    expect(trackDistanceKm([[0, 0]])).toBe(0);
  });
});

describe('точка в многоугольнике', () => {
  it('pointInRing: внутри и снаружи (pt — [lat, lng])', () => {
    expect(pointInRing([0.5, 0.5], square)).toBe(true);
    expect(pointInRing([1.5, 0.5], square)).toBe(false);
  });
  it('дырка в полигоне не считается его частью', () => {
    const g = { type: 'Polygon', coordinates: squareWithHole };
    expect(pointInGeometry([0.2, 0.2], g)).toBe(true);
    expect(pointInGeometry([0.5, 0.5], g)).toBe(false);
  });
  it('MultiPolygon: любая из частей', () => {
    const g = { type: 'MultiPolygon', coordinates: [[square], [square.map(([x, y]) => [x + 10, y])]] };
    expect(pointInGeometry([0.5, 10.5], g)).toBe(true);
    expect(pointInGeometry([0.5, 5], g)).toBe(false);
    expect(pointInGeometry([0, 0], { type: 'Point', coordinates: [0, 0] })).toBe(false);
  });
});

describe('encoded polyline', () => {
  it('пример из документации Google', () => {
    const pts = [[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]];
    expect(encodePolyline(pts)).toBe('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual(pts);
  });
  it('туда и обратно с точностью 1e-5, включая отрицательные и ноль', () => {
    const pts = [[0, 0], [-33.86882, 151.20929], [64.1466, -21.9426], [-0.00001, 0.00001], [89.99999, -179.99999]];
    const back = decodePolyline(encodePolyline(pts));
    expect(back).toHaveLength(pts.length);
    back.forEach((p, i) => { expect(p[0]).toBeCloseTo(pts[i][0], 5); expect(p[1]).toBeCloseTo(pts[i][1], 5); });
  });
  it('пустой трек', () => {
    expect(encodePolyline([])).toBe('');
    expect(decodePolyline('')).toEqual([]);
  });
  it('getEntryCoords: кэш видит смену трека у той же записи', () => {
    decodedCoordsCache.clear();
    const a = [[55.75, 37.62], [55.76, 37.63]], b = [[59.93, 30.33], [59.94, 30.34]];
    const e = { id: 'r1', coordsEncoded: encodePolyline(a) };
    expect(getEntryCoords(e)).toEqual(a);
    e.coordsEncoded = encodePolyline(b);
    expect(getEntryCoords(e)).toEqual(b);
    expect(getEntryCoords({ id: 'old', coords: a })).toBe(a);   // старые записи без сжатия
    expect(getEntryCoords({ id: 'none' })).toEqual([]);
  });
});

describe('прореживание', () => {
  const line = n => Array.from({ length: n }, (_, i) => [i, i]);
  it('короткий трек не трогает, длинный — до max+1 точки с сохранением конца', () => {
    const short = line(10);
    expect(downsample(short, 800)).toBe(short);
    const d = downsample(line(5000), 100);
    expect(d).toHaveLength(101);
    expect(d[0]).toEqual([0, 0]);
    expect(d[d.length - 1]).toEqual([4999, 4999]);
  });
  it('downsampleSegments делит точки пропорционально длине и отмечает разрывы', () => {
    const { coords, breaks } = downsampleSegments([line(3000), line(1000)], 400);
    expect(breaks).toHaveLength(1);
    expect(breaks[0]).toBeGreaterThan(250);           // первый кусок втрое длиннее — ~300 точек
    expect(coords.length - breaks[0]).toBeGreaterThan(90);
    expect(coords.length).toBeLessThan(420);
  });
  it('каждый кусок получает минимум две точки', () => {
    const { coords, breaks } = downsampleSegments([line(10000), line(3)], 50);
    expect(coords.length - breaks[0]).toBeGreaterThanOrEqual(2);
  });
  it('gpxDistanceKm не считает прыжок между сегментами', () => {
    const parsed = { segments: [{ coords: [[0, 0], [1, 0]] }, { coords: [[50, 50], [51, 50]] }] };
    expect(gpxDistanceKm(parsed)).toBeCloseTo(2 * 111.19, 0);
  });
});

describe('площадь и точка подписи', () => {
  it('geomAreaKm2: квадрат 1°×1° у экватора ≈ 12 300 км²', () => {
    const a = geomAreaKm2({ type: 'Polygon', coordinates: [square] });
    expect(a).toBeGreaterThan(11500);
    expect(a).toBeLessThan(13000);
  });
  it('mainRing выбирает самый большой контур', () => {
    const big = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
    expect(mainRing({ type: 'MultiPolygon', coordinates: [[square], [big]] })).toBe(big);
    expect(mainRing({ type: 'Polygon', coordinates: [big] })).toBe(big);
  });
  it('polyLabelPoint у «буквы Г» ставит точку внутрь, а не в пустой угол', () => {
    // Г-образная фигура: центр рамки (5,5) лежит вне её
    const L = [[0, 0], [10, 0], [10, 2], [2, 2], [2, 10], [0, 10], [0, 0]];
    const pt = polyLabelPoint(L);   // → [lat, lng]
    expect(pointInRing(pt, L)).toBe(true);
  });
});
