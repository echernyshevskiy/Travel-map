// Компактная запись контуров стран и регионов (src/lib/geo-pack.js) — без потерь
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { packGeo, unpackGeo, packGeoExact } from '../src/lib/geo-pack.js';

const read = f => JSON.parse(fs.readFileSync(new URL('../src/data/' + f, import.meta.url), 'utf8'));

describe('geo-pack', () => {
  for(const f of ['countries.min.json', 'ru_regions.json']){
    it(`${f}: распакованное совпадает с исходным, а запись вдвое меньше`, () => {
      const src = read(f), p = packGeoExact(src);
      expect(p).not.toBe(null);
      const back = unpackGeo(p.props, p.geom);
      expect(back.features.map(x => [x.properties, x.geometry])).toEqual(src.features.map(x => [x.properties, x.geometry]));
      expect(p.geom.length + JSON.stringify(p.props).length).toBeLessThan(JSON.stringify(src).length * 0.55);
    });
  }
  it('многоугольник с дырой, мультиполигон и пустая геометрия', () => {
    const fc = { type: 'FeatureCollection', features: [
      { type: 'Feature', properties: { name: 'a' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [10.5, 0], [10.5, 10.125], [0, 0]], [[1, 1], [2, 1], [2, 2], [1, 1]]] } },
      { type: 'Feature', properties: { name: 'b', n: 2 }, geometry: { type: 'MultiPolygon', coordinates: [[[[-179.999, -89.5], [179.999, -89.5], [0, 89.999], [-179.999, -89.5]]], [[[1, 1], [2, 2], [3, 1], [1, 1]]]] } },
      { type: 'Feature', properties: { name: 'c' }, geometry: null }
    ] };
    const p = packGeoExact(fc);
    expect(unpackGeo(p.props, p.geom)).toEqual(fc);
  });
  it('если тысячных не хватает — у этого контура точность выше, у остальных прежняя', () => {
    const poly = c => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[c, 1], [2, 2], [3, 1], [c, 1]]] } });
    const fc = { type: 'FeatureCollection', features: [poly(0.12345), poly(0.123)] };
    const p = packGeoExact(fc);
    expect(p.geom.split('\n').map(l => l.slice(0, 2))).toEqual(['P5', 'P3']);
    expect(unpackGeo(p.props, p.geom)).toEqual(fc);
    expect(packGeoExact({ type: 'FeatureCollection', features: [poly(0.1234567)] })).toBe(null);
  });
});
