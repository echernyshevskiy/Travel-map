// Подписи для контурной карты: у неё нет тайлов, а значит и названий. Рисуем
// сами: страны, регионы России и города из встроенного справочника — по мере
// приближения всё мельче, без наложений (крупное важнее мелкого). Работает без сети.
map.createPane('labelPane'); map.getPane('labelPane').style.zIndex = 450; // над заливками и треками, под маркерами
const mapLabelLayer = L.layerGroup().addTo(map);
let mapLabelCands = null, mapLabelTimer = null;
function ringBounds(r){
  let y0 = 90, y1 = -90, x0 = 180, x1 = -180;
  r.forEach(c => { if(c[1] < y0) y0 = c[1]; if(c[1] > y1) y1 = c[1]; if(c[0] < x0) x0 = c[0]; if(c[0] > x1) x1 = c[0]; });
  return L.latLngBounds([y0, x0], [y1, x1]);
}
// короткие подписи для длинных названий (в карточках и списках — полные)
const MAP_LABEL_SHORT = {
  'Democratic Republic of the Congo': 'ДР Конго', 'Republic of the Congo': 'Конго', 'Central African Republic': 'ЦАР',
  'Dominican Republic': 'Доминикана', 'French Southern and Antarctic Lands': 'Фр. Южные территории',
  'West Bank': 'Западный берег', 'United Arab Emirates': 'ОАЭ', 'United States of America': 'США', 'United Kingdom': 'Великобритания'
};
function buildMapLabelCands(){
  const out = [];
  COUNTRIES_GEOJSON.features.forEach(f => {
    const k = f.properties.name, ru = MAP_LABEL_SHORT[k] || COUNTRY_RU[k];
    if(!ru || !f.geometry) return;
    const a = geomAreaKm2(f.geometry), ring = mainRing(f.geometry), at = polyLabelPoint(ring);
    out.push({ kind: 'country', big: a >= 2e6, text: ru, lat: at[0], lng: at[1], box: ringBounds(ring),
      minZoom: a >= 2e6 ? 2 : a >= 4e5 ? 3 : a >= 6e4 ? 4 : a >= 8e3 ? 5 : 6, prio: 3e9 + a });
  });
  RU_REGIONS.forEach(r => {
    const ring = mainRing(r.geometry), at = polyLabelPoint(ring), a = geomAreaKm2(r.geometry);
    out.push({ kind: 'region', text: r.name, lat: at[0], lng: at[1], box: ringBounds(ring), minZoom: a >= 1.5e5 ? 5 : a >= 3e4 ? 6 : 7, prio: 1e9 + a });
  });
  getWorldCities().forEach(c => {
    const big = c.capital || c.pop >= 1000;
    out.push({ kind: 'city', cap: c.capital, text: c.name, lat: c.lat, lng: c.lng,
      minZoom: c.capital ? 4 : c.pop >= 1000 ? 5 : c.pop >= 300 ? 6 : c.pop >= 100 ? 7 : 8,
      prio: (big ? 2e9 : 0) + c.pop + (c.capital ? 1e6 : 0) });
  });
  out.sort((a, b) => b.prio - a.prio);
  return out;
}
// ширину меряем настоящим шрифтом, а не на глаз — иначе подписи на телефоне
// выходили шире, чем казалось, и налезали на соседей
let mapLabelCtx = null;
function labelFonts(){
  const small = map.getSize().x < 600;
  map.getContainer().classList.toggle('labels-small', small);
  return {
    country: { size: small ? 10 : 11, big: small ? 11 : 12.5, weight: 600, spacing: 0.07, upper: true, italic: false },
    region:  { size: small ? 9.5 : 10.5, weight: 400, spacing: 0, upper: false, italic: true },
    city:    { size: small ? 10.5 : 11.5, weight: 400, spacing: 0, upper: false, italic: false }
  };
}
function measureLabel(text, f, size){
  if(!mapLabelCtx) mapLabelCtx = document.createElement('canvas').getContext('2d');
  mapLabelCtx.font = `${f.italic ? 'italic ' : ''}${f.weight} ${size}px "EB Garamond", Georgia, serif`;
  const t = f.upper ? text.toUpperCase() : text;
  return Math.ceil(mapLabelCtx.measureText(t).width + t.length * f.spacing * size);
}
// варианты раскладки: в одну строку или в две (по пробелу ближе к середине)
function labelLayouts(text, f, size){
  const lh = Math.round(size * 1.1);
  const out = [{ lines: [text], w: measureLabel(text, f, size), h: lh + 2 }];
  const words = text.split(' ');
  if(words.length > 1 && text.length > 9){
    let bestI = 1, bestD = Infinity;
    for(let i = 1; i < words.length; i++){ const d = Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length); if(d < bestD){ bestD = d; bestI = i; } }
    const l1 = words.slice(0, bestI).join(' '), l2 = words.slice(bestI).join(' ');
    out.push({ lines: [l1, l2], w: Math.max(measureLabel(l1, f, size), measureLabel(l2, f, size)), h: lh * 2 + 2 });
  }
  return out;
}
function renderMapLabels(){
  mapLabelLayer.clearLayers();
  if(basemapMode !== 'plain' || document.body.classList.contains('quiz-map')) return;
  if(!mapLabelCands) mapLabelCands = buildMapLabelCands();
  const z = map.getZoom(), view = map.getBounds().pad(0.15), size = map.getSize();
  const fonts = labelFonts();
  const placed = [];
  const hit = (b, p) => b[0] < p[2] && b[2] > p[0] && b[1] < p[3] && b[3] > p[1];
  const free = b => !placed.some(p => hit(b, p));
  // свои отметки и кластеры — препятствия: подпись не должна уходить под них
  const mr = map.getContainer().getBoundingClientRect();
  const obstacles = [...map.getPane('markerPane').querySelectorAll('.leaflet-marker-icon')].map(el => {
    const r = el.getBoundingClientRect();
    return [r.left - mr.left - 2, r.top - mr.top - 2, r.right - mr.left + 2, r.bottom - mr.top + 2];
  }).filter(o => o[2] > o[0]);
  const clear = b => free(b) && !obstacles.some(o => hit(b, o));
  let n = 0;
  for(const c of mapLabelCands){
    if(c.minZoom > z || !view.contains([c.lat, c.lng])) continue;
    const pt = map.latLngToContainerPoint([c.lat, c.lng]);
    if(pt.x < -200 || pt.y < -40 || pt.x > size.x + 200 || pt.y > size.y + 40) continue;
    const f = fonts[c.kind], fs = c.kind === 'country' && c.big ? f.big : f.size;
    let chosen = null;
    if(c.kind === 'city'){
      const w = measureLabel(c.text, c.cap ? Object.assign({}, f, { weight: 700 }) : f, fs) + 8, h = Math.round(fs * 1.1) + 2;
      let x0 = pt.x - 4, dot = true;
      // город уже отмечен (или под кластером) — подпись справа от значка, без своего кружка
      const own = obstacles.find(o => pt.x >= o[0] - 1 && pt.x <= o[2] + 1 && pt.y >= o[1] - 1 && pt.y <= o[3] + 1);
      if(own){ x0 = own[2] + 1; dot = false; }
      const box = [x0 - 2, pt.y - h / 2 - 1, x0 + w + 2, pt.y + h / 2 + 1];
      if(!free(box) || obstacles.some(o => hit(box, o))) continue;
      chosen = { box, html: `${dot ? '<span class="ml-dot"></span>' : ''}<span>${escapeHtml(c.text)}</span>`, w, h, anchor: [pt.x - x0, h / 2] };
    } else {
      // подпись должна помещаться в саму страну/регион, иначе она «накрывает» соседей
      const sw = map.latLngToContainerPoint(c.box.getSouthWest()), ne = map.latLngToContainerPoint(c.box.getNorthEast());
      const pw = Math.abs(ne.x - sw.x), ph = Math.abs(sw.y - ne.y);
      const fits = labelLayouts(c.text, f, fs).filter(l => l.w <= pw * 1.05 + 4 && l.h <= ph * 1.3 + 4);
      if(!fits.length) continue;
      for(const lay of fits){
        // сперва по центру, потом чуть выше/ниже/в стороны — если там отметка или кластер
        const offs = [[0, 0], [0, -(lay.h + 6)], [0, lay.h + 6], [-lay.w * 0.3, 0], [lay.w * 0.3, 0], [0, -(lay.h * 2 + 10)], [0, lay.h * 2 + 10]];
        for(const [dx, dy] of offs){
          const cx = pt.x + dx, cy = pt.y + dy;
          // центр подписи не уходит за пределы контура
          if(cx < Math.min(sw.x, ne.x) || cx > Math.max(sw.x, ne.x) || cy < Math.min(sw.y, ne.y) || cy > Math.max(sw.y, ne.y)) continue;
          const box = [cx - lay.w / 2 - 2, cy - lay.h / 2 - 1, cx + lay.w / 2 + 2, cy + lay.h / 2 + 1];
          if(!clear(box)) continue;
          chosen = { box, html: lay.lines.map(escapeHtml).join('<br>'), w: lay.w, h: lay.h, anchor: [lay.w / 2 - dx, lay.h / 2 - dy] };
          break;
        }
        if(chosen) break;
      }
      if(!chosen) continue;
    }
    placed.push(chosen.box);
    const cls = 'map-label ml-' + c.kind + (c.big ? ' ml-big' : '') + (c.cap ? ' ml-cap' : '');
    L.marker([c.lat, c.lng], { pane: 'labelPane', interactive: false, keyboard: false,
      icon: L.divIcon({ className: cls, html: chosen.html, iconSize: [chosen.w, chosen.h], iconAnchor: chosen.anchor }) }).addTo(mapLabelLayer);
    if(++n >= 220) break;
  }
}
// после зума кластеры перестраиваются с анимацией — ждём, пока встанут на место
function scheduleMapLabels(){ clearTimeout(mapLabelTimer); mapLabelTimer = setTimeout(renderMapLabels, 320); }
map.on('moveend zoomend', scheduleMapLabels);
scheduleMapLabels();

