// ---------- подробные границы при приближении ----------
// Для обзора мира хватает лёгких контуров, встроенных в файл (1:110m). При
// приближении с 5-го масштаба для стран и регионов в кадре подгружаются точные
// границы и подменяют контур у всех слоёв: подложки «Контуры», заливки стран,
// дома и регионов России. Вся логика (клики, регионы, квиз) по-прежнему
// считает по лёгким контурам — подробные нужны только глазу. Загруженное
// сервис-воркер сохраняет, так что без сети остаются страны, которые уже открывали.
const BORDER_DETAIL_ZOOM = 5;
// два уровня: m — упрощение до 2 км (масштабы 5–7), f — до 150 м (8 и ближе).
// На средних масштабах полной точности глаз не видит, а точек вчетверо меньше
const borderTier = z => z < BORDER_DETAIL_ZOOM ? null : z < 8 ? 'm' : 'f';
const borderDetail = new Map();   // 'm:c:Страна' / 'f:r:Регион' → latlngs
const borderBBoxes = new Map();
const borderQueue = [];
const borderBundles = new Map();  // 'f/03' → 'loading' | 'done' | 'failed'
let borderInflight = 0, borderTimer = null;
// границы лежат пачками соседних стран и регионов: borders/<уровень>/<пачка>.json
function borderBundleOf(tier, dk){ return BORDERS_INDEX && BORDERS_INDEX[tier] ? BORDERS_INDEX[tier][dk] || null : null; }
function borderUrl(tier, bundle){
  // версия для друзей лежит в /friends/, файлы границ — общие, в корне
  return new URL((READ_ONLY ? '../' : '') + `borders/${tier}/${bundle}.json?v=${BORDERS_INDEX.v}`, location.href).href;
}
function borderBBox(dk){
  if(borderBBoxes.has(dk)) return borderBBoxes.get(dk);
  let b = null;
  if(dk[0] === 'r'){
    const r = RU_REGIONS.find(x => x.name === dk.slice(2));
    if(r) b = L.latLngBounds([r.bbox[0], r.bbox[1]], [r.bbox[2], r.bbox[3]]);
  } else {
    const g = getCountryGeometry(dk.slice(2));
    if(g){
      const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
      let y0 = 90, y1 = -90, x0 = 180, x1 = -180;
      polys.forEach(p => p[0].forEach(c => { if(c[1] < y0) y0 = c[1]; if(c[1] > y1) y1 = c[1]; if(c[0] < x0) x0 = c[0]; if(c[0] > x1) x1 = c[0]; }));
      b = L.latLngBounds([y0, x0], [y1, x1]);
    }
  }
  borderBBoxes.set(dk, b);
  return b;
}
function pumpBorders(){
  while(borderInflight < 3 && borderQueue.length){
    const [tier, bundle] = borderQueue.shift();
    const id = tier + '/' + bundle;
    borderInflight++;
    fetch(borderUrl(tier, bundle))
      .then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))
      .then(pack => {
        Object.entries(pack || {}).forEach(([dk, g]) => {
          if(g && Array.isArray(g.coordinates)) borderDetail.set(tier + ':' + dk, L.GeoJSON.coordsToLatLngs(g.coordinates, g.type === 'Polygon' ? 1 : 2));
        });
        borderBundles.set(id, 'done');
        scheduleBorders(40);
      })
      .catch(() => borderBundles.set(id, 'failed')) // нет файла или сети — остаются лёгкие контуры
      .finally(() => { borderInflight--; pumpBorders(); });
  }
}
// подробный контур нужного уровня; пока он грузится — другой уровень, если уже есть
function borderLatLngs(tier, dk){
  const d = borderDetail.get(tier + ':' + dk);
  if(d) return [d, tier];
  const bundle = borderBundleOf(tier, dk);
  if(bundle && !borderBundles.has(tier + '/' + bundle)){
    borderBundles.set(tier + '/' + bundle, 'loading');
    borderQueue.push([tier, bundle]);
    pumpBorders();
  }
  const other = tier === 'f' ? 'm' : 'f', od = borderDetail.get(other + ':' + dk);
  return od ? [od, other] : null;
}
// все полигоны на карте, у которых есть подробная версия
function borderTargets(){
  const out = [];
  const add = (group, keyOf) => {
    if(!group || !group._map || !group.eachLayer) return;
    group.eachLayer(l => { const k = keyOf(l); if(k && l.setLatLngs) out.push([l, k]); });
  };
  const regionKey = l => l.feature && l.feature.properties && l.feature.properties.name ? 'r:' + l.feature.properties.name : null;
  add(plainBaseLayer, l => l.feature && l.feature.properties && l.feature.properties.name ? 'c:' + l.feature.properties.name : null);
  Object.values(layers).forEach(g => { if(g && g.__countryKey) add(g, () => 'c:' + g.__countryKey); });
  add(homeRegionLayer, () => 'c:' + HOME_COUNTRY_KEY);
  add(ruRegionsLayer, regionKey);
  add(quizRegionOutline, regionKey);
  return out;
}
function applyBorderDetail(){
  if(!BORDERS_INDEX || location.protocol === 'file:') return; // с диска файлы границ браузер не отдаст
  const tier = borderTier(map.getZoom());
  // подробности держим только у того, что в кадре (с запасом): Leaflet
  // пересчитывает при зуме все точки контура, даже невидимые
  const view = tier ? map.getBounds().pad(0.5) : null;
  borderTargets().forEach(([l, dk]) => {
    let want = null;
    if(tier){ const b = borderBBox(dk); if(b && view.intersects(b)) want = borderLatLngs(tier, dk); }
    const wantTier = want ? want[1] : null;
    if(wantTier === (l.__detailTier || null)) return;
    if(!l.__coarse) l.__coarse = l.getLatLngs();
    l.setLatLngs(want ? want[0] : l.__coarse);
    l.__detailTier = wantTier;
  });
}
function scheduleBorders(ms){ clearTimeout(borderTimer); borderTimer = setTimeout(applyBorderDetail, ms == null ? 150 : ms); }
// при зуме меняем контуры сразу, до перерисовки: иначе на обзоре мира Leaflet
// успевал бы пересчитать все подробные границы, прежде чем их сбросить
map.on('zoomend', () => { clearTimeout(borderTimer); applyBorderDetail(); });
map.on('moveend layeradd', () => scheduleBorders());
window.addEventListener('online', () => { [...borderBundles].forEach(([k, v]) => { if(v === 'failed') borderBundles.delete(k); }); scheduleBorders(); });
