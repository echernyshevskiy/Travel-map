import { describe, it, expect } from 'vitest';
import { russifyStyle, RU_LABEL, vectorTileKey, tileRange, rangeSize, planDownload, tilesOf, vectorStyleUrl } from '../src/lib/vector-map.js';

describe('russifyStyle', () => {
  const style = {
    version: 8,
    layers: [
      { id: 'water', type: 'fill' },
      {
        id: 'place_city',
        type: 'symbol',
        layout: {
          'text-field': [
            'case',
            ['has', 'name:nonlatin'],
            ['concat', ['get', 'name:latin'], '\n', ['get', 'name:nonlatin']],
            ['coalesce', ['get', 'name_en'], ['get', 'name']]
          ]
        }
      },
      { id: 'road_shield', type: 'symbol', layout: { 'text-field': ['to-string', ['get', 'ref']] } },
      { id: 'old', type: 'symbol', layout: { 'text-field': '{name:latin}' } }
    ]
  };
  it('подписи с названиями — по-русски, номера дорог — как были', () => {
    const out = russifyStyle(style);
    expect(out.layers[1].layout['text-field']).toEqual(RU_LABEL);
    expect(out.layers[3].layout['text-field']).toEqual(RU_LABEL);
    expect(out.layers[2].layout['text-field']).toEqual(['to-string', ['get', 'ref']]);
  });
  it('исходный стиль не меняется', () => {
    russifyStyle(style);
    expect(style.layers[1].layout['text-field'][0]).toBe('case');
  });
  it('стиль по теме', () => {
    expect(vectorStyleUrl('dark')).toBe('https://tiles.openfreemap.org/styles/dark');
    expect(vectorStyleUrl('light')).toBe('https://tiles.openfreemap.org/styles/liberty');
  });
});

describe('vectorTileKey', () => {
  it('номер сборки карты убирается, остальное — как есть', () => {
    expect(vectorTileKey('https://tiles.openfreemap.org/planet/20261105_001001_pt/5/18/9.pbf')).toBe('https://tiles.openfreemap.org/planet/_/5/18/9.pbf');
    expect(vectorTileKey('https://tiles.openfreemap.org/planet/20261112_001001_pt/5/18/9.pbf?x=1')).toBe('https://tiles.openfreemap.org/planet/_/5/18/9.pbf');
    expect(vectorTileKey('https://tiles.openfreemap.org/styles/liberty')).toBe('https://tiles.openfreemap.org/styles/liberty');
    expect(vectorTileKey('https://tiles.openfreemap.org/fonts/Noto%20Sans%20Regular/0-255.pbf')).toBe(
      'https://tiles.openfreemap.org/fonts/Noto%20Sans%20Regular/0-255.pbf'
    );
  });
});

describe('план скачивания района', () => {
  const moscow = { south: 55.55, west: 37.3, north: 55.95, east: 37.95 };
  it('весь мир на нулевом уровне — одна плитка', () => {
    const r = tileRange({ south: -85, west: -180, north: 85, east: 179.99 }, 0);
    expect(rangeSize(r)).toBe(1);
  });
  it('Москва на 10-м уровне — известные плитки', () => {
    // 37.6° в. д. → x = 618 на z10; 55.75° с. ш. → y = 320
    const r = tileRange(moscow, 10);
    expect(r.x0).toBeLessThanOrEqual(618);
    expect(r.x1).toBeGreaterThanOrEqual(618);
    expect(r.y0).toBeLessThanOrEqual(320);
    expect(r.y1).toBeGreaterThanOrEqual(320);
  });
  it('не больше лимита; подробные уровни, которые не влезают, отбрасываются', () => {
    const p = planDownload(moscow, { maxTiles: 3000 });
    expect(p.total).toBeLessThanOrEqual(3000);
    expect(p.maxZoom).toBeGreaterThanOrEqual(11);
    expect([...tilesOf(p.ranges)].length).toBe(p.total);
    const big = planDownload({ south: 41, west: 19, north: 70, east: 60 }, { maxTiles: 3000 });
    expect(big.total).toBeLessThanOrEqual(3000);
    expect(big.maxZoom).toBeLessThan(14);
  });
});
