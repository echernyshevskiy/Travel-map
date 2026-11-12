// Векторная подложка «Подробная» (D1): OpenFreeMap (бесплатно, без ключей и
// регистрации; данные — OpenStreetMap, схема OpenMapTiles), рисует MapLibre GL.
// Здесь — чистые функции без карты и сети: стиль с русскими подписями, ключ
// плитки в кэше, план скачивания района. unit/vector-map.test.js.

export const OFM_ORIGIN = 'https://tiles.openfreemap.org';
// светлая тема — «Liberty» (похожа на привычную карту OSM), тёмная — «Dark»
export const vectorStyleUrl = theme => `${OFM_ORIGIN}/styles/${theme === 'dark' ? 'dark' : 'liberty'}`;

// Подпись: по-русски, если в OpenStreetMap есть русское название; иначе —
// латиницей (транслитерация читается легче иероглифов и грузинского письма);
// иначе — как записано на месте.
export const RU_LABEL = ['coalesce', ['get', 'name:ru'], ['get', 'name:latin'], ['get', 'name']];

// Подпись слоя — про названия (а не номер дороги ref, высоту и т. п.)?
const isNameLabel = tf => {
  const s = JSON.stringify(tf);
  return /"name(:latin|:nonlatin|_en|_int)?"/.test(s) || /\{name(:latin|:nonlatin|_en|_int)?\}/.test(s);
};

// Копия стиля, в которой все подписи с названиями — по-русски
export function russifyStyle(style) {
  const out = JSON.parse(JSON.stringify(style));
  for (const layer of out.layers || []) {
    const tf = layer.layout && layer.layout['text-field'];
    if (tf && isNameLabel(tf)) layer.layout['text-field'] = RU_LABEL;
  }
  return out;
}

// Плитки OpenFreeMap лежат по адресу с номером сборки карты
// (…/planet/20261105_001001_pt/5/18/9.pbf), а номер меняется раз в неделю.
// В кэше храним без номера — иначе после обновления карты скачанный заранее
// район перестал бы находиться без сети. Та же функция — в sw.js.
const TILE_RE = /^(https:\/\/tiles\.openfreemap\.org\/planet\/)[^/]+(\/\d+\/\d+\/\d+\.pbf)(?:[?#].*)?$/;
export const vectorTileKey = url => {
  const m = String(url).match(TILE_RE);
  return m ? m[1] + '_' + m[2] : url;
};

// ---- плитки района ----
const lng2x = (lng, n) => Math.floor(((lng + 180) / 360) * n);
const lat2y = (lat, n) => {
  const r = (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
};
// диапазон плиток уровня z, покрывающих рамку { south, west, north, east }
export function tileRange(b, z) {
  const n = 2 ** z,
    clamp = v => Math.max(0, Math.min(n - 1, v));
  return { z, x0: clamp(lng2x(b.west, n)), x1: clamp(lng2x(b.east, n)), y0: clamp(lat2y(b.north, n)), y1: clamp(lat2y(b.south, n)) };
}
export const rangeSize = r => (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1);

// Что скачать для района без сети: все уровни от общего вида до самого
// подробного (14 — дальше MapLibre сам дорисовывает из 14-го), но не больше
// maxTiles плиток (у OpenFreeMap — 3000 за одно скачивание). Если подробные
// уровни не влезают, останавливаемся на том, что влезло.
export function planDownload(bounds, { minZoom = 0, maxZoom = 14, maxTiles = 3000 } = {}) {
  const ranges = [];
  let total = 0;
  for (let z = minZoom; z <= maxZoom; z++) {
    const r = tileRange(bounds, z),
      n = rangeSize(r);
    if (total + n > maxTiles) break;
    ranges.push(r);
    total += n;
  }
  return { ranges, total, maxZoom: ranges.length ? ranges[ranges.length - 1].z : null };
}
export function* tilesOf(ranges) {
  for (const r of ranges) for (let x = r.x0; x <= r.x1; x++) for (let y = r.y0; y <= r.y1; y++) yield [r.z, x, y];
}
