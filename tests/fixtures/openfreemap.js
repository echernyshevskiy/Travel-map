// Поддельный OpenFreeMap для тестов «Подробной» карты: настоящий сервис из
// тестов недоступен (сеть перехвачена). Стиль похож на настоящий (источник
// openmaptiles, подписи с name:latin/name:nonlatin, шрифты, значки), плитки —
// настоящие векторные (MVT), собранные из пары выдуманных многоугольников.
const vtpbf = require('vt-pbf');
const gvMod = require('geojson-vt');
const GeoJSONVT = gvMod.default || gvMod.GeoJSONVT || gvMod;

const ORIGIN = 'https://tiles.openfreemap.org';
const VERSION = '20261105_001001_pt';
// номер недельной сборки, который отдаёт описание источника (тест может «обновить карту»)
let currentVersion = VERSION;
const setVersion = v => (currentVersion = v);

const land = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { class: 'grass' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [20, 40],
            [60, 40],
            [60, 70],
            [20, 70],
            [20, 40]
          ]
        ]
      }
    },
    {
      type: 'Feature',
      properties: { class: 'city', name: 'Москва', 'name:ru': 'Москва', 'name:latin': 'Moskva' },
      geometry: { type: 'Point', coordinates: [37.62, 55.75] }
    },
    {
      type: 'Feature',
      properties: { class: 'city', name: 'თბილისი', 'name:latin': 'Tbilisi', 'name:nonlatin': 'თბილისი' },
      geometry: { type: 'Point', coordinates: [44.8, 41.7] }
    }
  ]
};
let index = null;
const tile = (z, x, y) => {
  if (!index) index = new GeoJSONVT(land, { maxZoom: 14, indexMaxZoom: 4 });
  const t = index.getTile(z, x, y);
  return Buffer.from(vtpbf.fromGeojsonVt({ landcover: t || { features: [] }, place: t || { features: [] } }, { version: 2 }));
};

const style = theme => ({
  version: 8,
  name: theme,
  sources: { openmaptiles: { type: 'vector', url: ORIGIN + '/planet' } },
  glyphs: ORIGIN + '/fonts/{fontstack}/{range}.pbf',
  sprite: ORIGIN + '/sprites/ofm_f384/ofm',
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': theme === 'dark' ? '#202020' : '#f8f4f0' } },
    {
      id: 'landcover',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'landcover',
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'fill-color': '#cde6b8' }
    },
    {
      id: 'label_city',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'place',
      filter: ['==', ['geometry-type'], 'Point'],
      layout: {
        'text-field': [
          'case',
          ['has', 'name:nonlatin'],
          ['concat', ['get', 'name:latin'], '\n', ['get', 'name:nonlatin']],
          ['coalesce', ['get', 'name_en'], ['get', 'name']]
        ],
        'text-font': ['Noto Sans Regular']
      }
    }
  ]
});

// 1×1 прозрачный PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

// счётчик запросов — тесты проверяют, что ходили именно сюда
const requests = [];
// handler(url) → объект для route.fulfill
// настоящий сервис отдаёт CORS-заголовок; без него запрос из сервис-воркера не пройдёт
function openFreeMapMock(url) {
  const r = answer(url);
  r.headers = { 'Access-Control-Allow-Origin': '*', ...(r.headers || {}) };
  return r;
}
function answer(url) {
  requests.push(url);
  const u = new URL(url);
  const p = u.pathname;
  if (p.startsWith('/styles/')) return { status: 200, contentType: 'application/json', body: JSON.stringify(style(p.split('/')[2])) };
  if (p === '/planet')
    return {
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ tilejson: '3.0.0', tiles: [`${ORIGIN}/planet/${currentVersion}/{z}/{x}/{y}.pbf`], minzoom: 0, maxzoom: 14 })
    };
  const m = p.match(/^\/planet\/[^/]+\/(\d+)\/(\d+)\/(\d+)\.pbf$/);
  if (m) return { status: 200, contentType: 'application/x-protobuf', body: tile(+m[1], +m[2], +m[3]) };
  if (p.startsWith('/fonts/')) return { status: 200, contentType: 'application/x-protobuf', body: Buffer.alloc(0) };
  if (p.endsWith('.json')) return { status: 200, contentType: 'application/json', body: '{}' };
  if (p.endsWith('.png')) return { status: 200, contentType: 'image/png', body: PNG };
  return { status: 404, body: '' };
}

module.exports = { openFreeMapMock, requests, ORIGIN, VERSION, setVersion };
