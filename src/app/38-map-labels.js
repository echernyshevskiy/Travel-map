// Подписи для контурной карты: у неё нет тайлов, а значит и названий. Рисуем
// сами: страны, регионы России, города из встроенного справочника, океаны и моря — по мере
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
  seaLabelCands().forEach(c => out.push(c));
  out.sort((a, b) => b.prio - a.prio);
  return out;
}
// Моря и океаны: точка подписи и две хорды водоёма — вдоль (по ней наклон
// и длина, на которую можно растянуть подпись) и поперёк (высота). После
// городов-миллионников и столиц, но раньше мелких городов: подпись в воде
// мешает только прибрежным названиям.
let seaCands = null;
function seaLabelCands(){
  if(!seaCands) seaCands = SEAS.map(([text, sea, minZoom, lat, lng, ...r]) => {
    // концы хорд — по ту же сторону 180-го меридиана, что и центр
    const pt = i => [r[i], r[i + 1] - lng > 180 ? r[i + 1] - 360 : lng - r[i + 1] > 180 ? r[i + 1] + 360 : r[i + 1]];
    return { kind: 'sea', sea, text, lat, lng, minZoom, a1: pt(0), a2: pt(2), b1: pt(4), b2: pt(6), prio: 1.5e9 + (10 - minZoom) * 1e7 };
  });
  return seaCands;
}
// [размер, на телефоне, разрядка, предельная разрядка (в долях кегля), насыщенность]
const SEA_FONTS = { ocean: [15, 13, 0.14, 0.7, 500], sea: [13, 12, 0.04, 0.3, 400], gulf: [11.5, 10.5, 0.02, 0.18, 400] };
// Раскладка подписи моря на длину L и высоту W (в пикселях): в одну строку или в
// две; свободное место по длине — в разрядку, как в атласах. Не помещается — null.
const seaLayoutCache = new Map();
// шрифт EB Garamond приходит позже первых замеров — тогда меряем заново
if(document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', () => seaLayoutCache.clear());
function seaLabelLayout(c, L, W, small, Lfull){
  const [big, sm, sp0, spMax, weight] = SEA_FONTS[c.sea];
  const size = small ? sm : big;
  const f = { weight, italic: true, upper: c.sea === 'ocean', spacing: sp0 };
  // замеры текста — самое дорогое, а глобус рисует подписи каждый кадр: кэшируем
  const key = c.text + '|' + size;
  let lays = seaLayoutCache.get(key);
  if(!lays) seaLayoutCache.set(key, lays = labelLayouts(c.text, f, size));
  for(const lay of lays){
    if(lay.w > L * 0.92 || lay.h > W * 0.9) continue;
    const n = Math.max(...lay.lines.map(l => l.length));
    const extra = Math.max(0, Math.min((spMax - sp0) * size, (Math.min(L * 0.85, (Lfull || L) * 0.4) - lay.w) / n));
    return { lines: lay.lines, size, weight, upper: f.upper, sp: sp0 * size + extra, w: Math.ceil(lay.w + extra * n), h: lay.h };
  }
  return null;
}
// плашки поверх карты/глобуса (легенда, шкала времени, сводка, кнопки) —
// в координатах относительно rect, с полями
function floatingUiBoxes(rect){
  return ['.leaflet-control-zoom', '.compass-rose', '.map-controls', '#mapGlance', '#legend', '#timelineBar', '#globeHint'].map(sel => {
    const el = document.querySelector(sel);
    if(!el || !el.offsetWidth || getComputedStyle(el).visibility === 'hidden') return null;
    const r = el.getBoundingClientRect();
    return [r.left - rect.left - 4, r.top - rect.top - 4, r.right - rect.left + 4, r.bottom - rect.top + 4];
  }).filter(Boolean);
}
// отрезок p→q, обрезанный прямоугольником; null — если весь снаружи
function seaClip(p, q, x0, y0, x1, y1){
  let t0 = 0, t1 = 1;
  const dx = q.x - p.x, dy = q.y - p.y;
  for(const [pp, qq] of [[-dx, p.x - x0], [dx, x1 - p.x], [-dy, p.y - y0], [dy, y1 - p.y]]){
    if(!pp){ if(qq < 0) return null; continue; }
    const r = qq / pp;
    if(pp < 0){ if(r > t1) return null; if(r > t0) t0 = r; } else { if(r < t0) return null; if(r < t1) t1 = r; }
  }
  return [L.point(p.x + t0 * dx, p.y + t0 * dy), L.point(p.x + t1 * dx, p.y + t1 * dy)];
}
// угол хорды на экране, чтобы текст читался слева направо
function seaLabelAngle(p1, p2){
  let a = Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI;
  if(a > 90) a -= 180; else if(a <= -90) a += 180;
  return Math.abs(a) < 4 ? 0 : a;
}
// углы повёрнутого прямоугольника и проверка пересечения (теорема о разделяющей оси)
function rotRect(cx, cy, w, h, deg){
  const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), hw = w / 2, hh = h / 2;
  return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
}
const boxPoly = b => b.poly || [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]];
function polysHit(P, Q){
  for(const S of [P, Q]) for(let i = 0; i < 4; i++){
    const a = S[i], b = S[(i + 1) % 4], nx = b[1] - a[1], ny = a[0] - b[0];
    let p0 = Infinity, p1 = -Infinity, q0 = Infinity, q1 = -Infinity;
    for(const v of P){ const d = v[0] * nx + v[1] * ny; if(d < p0) p0 = d; if(d > p1) p1 = d; }
    for(const v of Q){ const d = v[0] * nx + v[1] * ny; if(d < q0) q0 = d; if(d > q1) q1 = d; }
    if(p1 <= q0 || q1 <= p0) return false;
  }
  return true;
}
function seaLabelHtml(lay, deg){
  const st = `font-size:${lay.size}px;font-weight:${lay.weight};letter-spacing:${lay.sp.toFixed(1)}px;padding-left:${lay.sp.toFixed(1)}px` + (deg ? `;transform:rotate(${deg.toFixed(1)}deg)` : '');
  return `<div class="ml-sea-in" style="${st}">${lay.lines.map(escapeHtml).join('<br>')}</div>`;
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
  const hit = (b, p) => b[0] < p[2] && b[2] > p[0] && b[1] < p[3] && b[3] > p[1] && (!b.poly && !p.poly || polysHit(boxPoly(b), boxPoly(p)));
  const free = b => !placed.some(p => hit(b, p));
  // свои отметки и кластеры — препятствия: подпись не должна уходить под них
  const mr = map.getContainer().getBoundingClientRect();
  const obstacles = [...map.getPane('markerPane').querySelectorAll('.leaflet-marker-icon')].map(el => {
    const r = el.getBoundingClientRect();
    return [r.left - mr.left - 2, r.top - mr.top - 2, r.right - mr.left + 2, r.bottom - mr.top + 2];
  }).filter(o => o[2] > o[0]);
  const clear = b => free(b) && !obstacles.some(o => hit(b, o));
  // подпись моря целиком на экране и не под плашками поверх карты (легенда,
  // шкала времени, сводка): обрезанная «…ИЙ ОКЕАН» выглядит хуже, чем никакая
  const ui = floatingUiBoxes(mr);
  const onScreen = b => b[0] >= 4 && b[1] >= 4 && b[2] <= size.x - 4 && b[3] <= size.y - 4 && !ui.some(o => hit(b, o));
  let n = 0;
  for(const c of mapLabelCands){
    if(c.minZoom > z) continue;
    // у моря центр может быть за краем экрана, а сама вода — на нём (ниже)
    if(c.kind !== 'sea' && !view.contains([c.lat, c.lng])) continue;
    const pt = map.latLngToContainerPoint([c.lat, c.lng]);
    if(c.kind !== 'sea' && (pt.x < -200 || pt.y < -40 || pt.x > size.x + 200 || pt.y > size.y + 40)) continue;
    const f = fonts[c.kind] || fonts.region, fs = c.kind === 'country' && c.big ? f.big : f.size;
    let chosen = null;
    if(c.kind === 'sea'){
      let a1 = map.latLngToContainerPoint(c.a1), a2 = map.latLngToContainerPoint(c.a2);
      const b1 = map.latLngToContainerPoint(c.b1), b2 = map.latLngToContainerPoint(c.b2);
      const La = a1.distanceTo(a2), W = b1.distanceTo(b2);
      if(La < 30 || W < 8) continue;
      const deg = seaLabelAngle(a1, a2);
      // ось обрезаем по экрану: у большого моря, видного краем, подпись встаёт
      // в видимую часть воды (Лян — Барски)
      const clip = seaClip(a1, a2, 10, 10, size.x - 10, size.y - 10);
      if(!clip) continue;
      [a1, a2] = clip;
      const Lv = a1.distanceTo(a2), lay = seaLabelLayout(c, Lv, W, size.x < 600, La);
      if(!lay) continue;
      const ux = (a2.x - a1.x) / (Lv || 1), uy = (a2.y - a1.y) / (Lv || 1);
      // по центру, потом сдвиг вдоль оси водоёма (если запас по длине есть) и поперёк
      const room = Math.max(0, (Lv * 0.92 - lay.w) / 2), across = Math.max(0, (W * 0.9 - lay.h) / 2);
      const tries = [[0, 0]];
      if(room >= 8) tries.push([-room * 0.5, 0], [room * 0.5, 0], [-room, 0], [room, 0]);
      if(across >= 8) tries.push([0, -across], [0, across], [-room * 0.5, -across], [room * 0.5, across]);
      for(const [t, q] of tries){
        const cx = (a1.x + a2.x) / 2 + ux * t - uy * q, cy = (a1.y + a2.y) / 2 + uy * t + ux * q;
        const poly = rotRect(cx, cy, lay.w + 4, lay.h + 2, deg);
        const box = [Math.min(...poly.map(v => v[0])), Math.min(...poly.map(v => v[1])), Math.max(...poly.map(v => v[0])), Math.max(...poly.map(v => v[1]))];
        if(deg) box.poly = poly;
        if(!onScreen(box) || !clear(box)) continue;
        chosen = { box, html: seaLabelHtml(lay, deg), w: lay.w, h: lay.h, anchor: [lay.w / 2 - (cx - pt.x), lay.h / 2 - (cy - pt.y)] };
        break;
      }
      if(!chosen) continue;
    } else if(c.kind === 'city'){
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
    const cls = 'map-label ml-' + c.kind + (c.big ? ' ml-big' : '') + (c.cap ? ' ml-cap' : '') + (c.sea ? ' ml-' + c.sea : '');
    L.marker([c.lat, c.lng], { pane: 'labelPane', interactive: false, keyboard: false,
      icon: L.divIcon({ className: cls, html: chosen.html, iconSize: [chosen.w, chosen.h], iconAnchor: chosen.anchor }) }).addTo(mapLabelLayer);
    if(++n >= 220) break;
  }
}
// после зума кластеры перестраиваются с анимацией — ждём, пока встанут на место
function scheduleMapLabels(){ clearTimeout(mapLabelTimer); mapLabelTimer = setTimeout(renderMapLabels, 320); }
map.on('moveend zoomend', scheduleMapLabels);
scheduleMapLabels();

