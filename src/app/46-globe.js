// ---------- глобус ----------
// Отдельный режим просмотра: Земля шаром, которую можно крутить и приближать.
// Рисуется на холсте в ортографической проекции (d3-geo) из того же, что уже
// встроено в файл: контуры стран, отметки, маршруты. Ни тайлов, ни сети — режим
// работает офлайн, как «Контуры». Это витрина, а не вторая карта: добавление
// точек, тепловая карта, квиз остаются на плоской карте, а при сильном
// приближении глобус сам передаёт управление ей в той же точке.
//
// Перерисовка — только по требованию (requestAnimationFrame, когда что-то
// изменилось). Во время вращения рисуем облегчённо: контуры суши и треки
// прорежены; через мгновение после остановки — полная точность.
const GLOBE_HANDOFF_ZOOM = 5;   // этот масштаб Leaflet и ближе — уже плоская карта
const GLOBE_ROUTE_PTS_MOVING = 120, GLOBE_ROUTE_PTS_IDLE = 700;
const globe = {
  active: false, wrap: null, canvas: null, ctx: null, tip: null,
  proj: null, path: null, w: 0, h: 0, dpr: 1,
  raf: 0, moving: false, idleTimer: null, inertia: null,
  data: null, dataDirty: true, colors: null, tipFor: null,
  pointers: new Map(), gesture: null, resizing: 0, flight: null,
  stats: { countryLabels: 0, cityLabels: 0, stops: 0 },
};

// масштаб проекции (радиус шара в пикселях) ↔ масштаб Leaflet: у Leaflet на
// экваторе 256·2^z пикселей на 360°, у шара — scale пикселей на радиан
const globeScaleForZoom = z => 256 * Math.pow(2, z) / (2 * Math.PI);
const globeZoomForScale = s => Math.log2(s * 2 * Math.PI / 256);
// снизу карту закрывают сводка и ползунок лет, сверху — кнопки: шар ставим в свободную середину
function globeInsets(){ const phone = globe.w <= 768; return { top: phone ? 56 : 60, bottom: phone ? 170 : 110 }; }
function globeFitScale(){ const i = globeInsets(); return Math.max(60, 0.46 * Math.min(globe.w, globe.h - i.top - i.bottom)); }
function globeMaxScale(){ return Math.max(globeScaleForZoom(GLOBE_HANDOFF_ZOOM), globeFitScale() * 2.5); }

// Угловое расстояние между точками [lng, lat] в радианах. geoDistance из d3
// считает то же через точный сумматор — на сотнях вызовов за кадр это заметно.
const GLOBE_RAD = Math.PI / 180;
function globeAngle(a, b){
  const p1 = a[1] * GLOBE_RAD, p2 = b[1] * GLOBE_RAD, dl = (b[0] - a[0]) * GLOBE_RAD;
  const c = Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dl);
  return Math.acos(c > 1 ? 1 : c < -1 ? -1 : c);
}

// Подготовка геометрии для шара (один раз на контур, с кэшем):
// - d3-geo считает многоугольники на сфере, и для неё важен обход колец: внешнее —
//   по часовой стрелке. В GeoJSON (RFC 7946) наоборот, и без разворота d3 залил бы
//   «всё, кроме страны» — весь шар;
// - облегчённая копия для кадров во время вращения (контуры суши — 11 тыс. точек,
//   на телефоне их пересчёт съедал почти весь кадр);
// - центр и угловой радиус — чтобы не считать то, что на обратной стороне шара
//   или за краем экрана.
// WeakMap: подготовка маршрутов пересчитывается при каждом движении ползунка лет,
// и обычный Map копил бы старые копии треков, пока открыта страница
const globePrepCache = new WeakMap();
const globeLabelAt = new Map(); // страна → точка подписи (считается один раз)
function globePrep(geom){
  if(!geom) return null;
  if(globePrepCache.has(geom)) return globePrepCache.get(geom);
  let fine = geom, coarse = geom;
  if(geom.type === 'Polygon' || geom.type === 'MultiPolygon'){
    const fix = poly => geoArea({ type: 'Polygon', coordinates: poly }) > 2 * Math.PI ? poly.map(r => r.slice().reverse()) : poly;
    const polys = (geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates).map(fix);
    fine = { type: 'MultiPolygon', coordinates: polys };
    // в облегчённой копии нет и мелких островов: на далёком шаре это пара пикселей
    const big = r => { let x0 = 180, x1 = -180, y0 = 90, y1 = -90; r.forEach(c => { if(c[0] < x0) x0 = c[0]; if(c[0] > x1) x1 = c[0]; if(c[1] < y0) y0 = c[1]; if(c[1] > y1) y1 = c[1]; }); return x1 - x0 + y1 - y0 > 0.8; };
    const cp = polys.map(poly => poly.map(r => simplifyLine(r, 0.45)).filter(r => r.length >= 4 && big(r))).filter(poly => poly.length);
    coarse = cp.length ? { type: 'MultiPolygon', coordinates: cp } : fine;
  } else if(geom.type === 'MultiLineString' && geom.coarse){
    fine = geom; coarse = geom.coarse;
  }
  const c = geoCentroid(fine);
  let r = 0;
  const visit = g => { g.forEach(x => { if(typeof x[0] === 'number'){ const d = globeAngle(c, x); if(d > r) r = d; } else visit(x); }); };
  visit(fine.coordinates);
  const prep = { fine, coarse, c, r };
  globePrepCache.set(geom, prep);
  return prep;
}
let globeLand = null;
function globeLandPreps(){
  if(!globeLand) globeLand = COUNTRIES_GEOJSON.features.map(f => globePrep(f.geometry));
  return globeLand;
}
// видимая часть шара: полусфера, а при сильном приближении — ещё меньше (край экрана)
function globeViewAngle(){
  const [tx, ty] = globe.proj.translate(), s = globe.proj.scale();
  const reach = Math.hypot(Math.max(tx, globe.w - tx), Math.max(ty, globe.h - ty));
  return reach >= s ? Math.PI / 2 : Math.asin(reach / s);
}
const globeSees = (prep, center, view) => prep && globeAngle(prep.c, center) - prep.r < view;

function globeEnsureDom(){
  if(globe.wrap) return;
  const wrap = globe.wrap = document.createElement('div');
  wrap.id = 'globeWrap';
  wrap.className = 'globe-wrap';
  wrap.innerHTML = '<canvas id="globeCanvas" aria-label="Глобус: тяните, чтобы вращать; щипок или колесо — приблизить"></canvas>' +
    '<div class="globe-tip" id="globeTip" style="display:none;"></div>' +
    '<div class="globe-hint" id="globeHint">тяните — вращать · ближе — откроется карта</div>';
  document.getElementById('map').after(wrap);
  globe.canvas = wrap.querySelector('canvas');
  globe.ctx = globe.canvas.getContext('2d');
  globe.tip = wrap.querySelector('.globe-tip');
  globe.proj = geoOrthographic().clipAngle(90).precision(0.6);
  globe.path = geoPath(globe.proj, globe.ctx);
  // Отсечение по краю шара в d3 дорогое: для каждого многоугольника оно проверяет,
  // не накрывает ли он центр обзора (точная сумма углов по всем точкам). Контурам,
  // которые целиком на видимой стороне, оно не нужно — их рисуем без отсечения.
  globe.projFull = geoOrthographic().clipAngle(null).precision(0);
  globeBindInput();
  globe.tip.addEventListener('click', e => {
    globe.lastTap = null; // нажатие в карточке разрывает «двойное касание» по шару
    if(e.target.closest('[data-globe-open]')) return globeOpenOnMap();
    if(e.target.closest('[data-globe-close]')) return globeHideTip();
    const t = e.target.closest('[data-globe-trip]');
    if(t) openTripPage(t.dataset.globeTrip);
  });
  // прокрутка и касания внутри карточки не должны вращать шар
  ['pointerdown', 'wheel'].forEach(ev => globe.tip.addEventListener(ev, e => e.stopPropagation(), { passive: true }));
}

function globeResize(){
  if(!globe.canvas) return;
  const r = globe.wrap.getBoundingClientRect();
  const prevFit = globe.w ? globeFitScale() : 0;
  globe.w = Math.max(1, Math.round(r.width));
  globe.h = Math.max(1, Math.round(r.height));
  globe.dpr = Math.min(window.devicePixelRatio || 1, 2);
  globe.canvas.width = Math.round(globe.w * globe.dpr);
  globe.canvas.height = Math.round(globe.h * globe.dpr);
  globe.canvas.style.width = globe.w + 'px';
  globe.canvas.style.height = globe.h + 'px';
  const ins = globeInsets();
  globe.proj.translate([globe.w / 2, ins.top + (globe.h - ins.top - ins.bottom) / 2]);
  // шар во весь экран при повороте телефона пересчитываем пропорционально
  if(prevFit) globe.proj.scale(globe.proj.scale() * globeFitScale() / prevFit);
  globeRedraw();
}

// ---------- данные: что показывать ----------
function globeIncluded(e){
  if(!passesFilter(e)) return false;
  const y = timelineYears[timelineIndex];
  if(y === undefined) return true;
  return timelineMode === 'cumulative' ? e.year <= y : e.year === y;
}
function globeColors(){
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  return dark
    ? { sea: '#18201E', land: '#2A2B20', border: '#4A4936', grat: 'rgba(232,224,200,0.07)', rim: '#3A3B2C', text: '#E8E0C8', seaText: '#86A6B8', halo: 'rgba(20,21,15,0.85)', dot: 'rgba(232,224,200,0.7)', shade: 0.55, glow: 'rgba(217,148,79,0.10)' }
    : { sea: '#CFE0DC', land: '#EFE7D2', border: '#B8A98A', grat: 'rgba(43,59,46,0.08)', rim: '#9C8F6C', text: '#2B3B2E', seaText: '#3F6378', halo: 'rgba(243,236,216,0.9)', dot: '#2B3B2E', shade: 0.28, glow: 'rgba(166,89,46,0.08)' };
}
function globeBuildData(){
  const countries = new Map();   // ключ → { geom, color, alpha, wishlist, label }
  const routes = [], cities = [], stops = [];
  // остановки маршрутов — как на плоской карте: на линии трека, без дублей
  // городов, у которых есть своя отметка
  const ownCities = new Set(allEntries.filter(e => e.type === 'city' && globeIncluded(e)).map(e => (e.name || '').trim().toLowerCase()));
  const seenStops = new Set();
  allEntries.forEach(e => {
    if(!globeIncluded(e)) return;
    if(e.type === 'country' && e.countryKey){
      const geom = getCountryGeometry(e.countryKey);
      if(!geom) return;
      const wish = e.status === 'wishlist';
      const prev = countries.get(e.countryKey);
      if(prev && !prev.wishlist && wish) return; // посещённая важнее мечты
      countries.set(e.countryKey, { key: e.countryKey, geom, prep: globePrep(geom), color: e.color || DEFAULT_COLOR.country, alpha: countryFillOpacity(e.countryKey), wishlist: wish, entry: e });
    } else if(e.type === 'route'){
      const segs = entrySegments(e).filter(s => s.length >= 2);
      if(!segs.length) return;
      const total = segs.reduce((n, s) => n + s.length, 0);
      const pick = max => ({ type: 'MultiLineString', coordinates: segs.map(s => globeDensify(downsample(s, Math.max(2, Math.round(max * s.length / total))).map(c => [c[1], c[0]]))) });
      const fine = pick(GLOBE_ROUTE_PTS_IDLE); fine.coarse = pick(GLOBE_ROUTE_PTS_MOVING);
      routes.push({ entry: e, color: e.color || DEFAULT_COLOR.route, dashed: !!e.isEstimated, coarse: fine.coarse, fine, prep: globePrep(fine) });
      if(Array.isArray(e.waypointCoords) && Array.isArray(e.waypointNames)){
        const at = routeStopCoords(e);
        e.waypointNames.forEach((n, i) => {
          const name = (n || '').trim(), c = at[i];
          if(!name || !c || !isFinite(c[0]) || !isFinite(c[1]) || ownCities.has(name.toLowerCase())) return;
          const key = name.toLowerCase() + '|' + c[0].toFixed(2) + ',' + c[1].toFixed(2);
          if(seenStops.has(key)) return;
          seenStops.add(key);
          stops.push({ entry: e, name: cleanPlaceName(name), ll: [c[1], c[0]], color: e.color || DEFAULT_COLOR.route });
        });
      }
    } else if(e.type === 'city' && isFinite(e.lat) && isFinite(e.lng)){
      cities.push({ entry: e, ll: [e.lng, e.lat], color: e.color || DEFAULT_COLOR.city, favorite: !!e.favorite, wishlist: e.status === 'wishlist' });
    }
  });
  // подписи посещённых стран: точка внутри самого большого контура, крупные — первыми
  const labels = [...countries.values()].filter(c => !c.wishlist).map(c => {
    globeLabelPoint(c.key, c.geom);
    const l = globeLabelAt.get(c.key);
    return { text: MAP_LABEL_SHORT[c.key] || COUNTRY_RU[c.key] || c.key, at: l.at, area: l.area };
  }).sort((a, b) => b.area - a.area);
  globe.data = { countries: [...countries.values()], routes, cities, stops, labels, home: globePrep(getCountryGeometry(HOME_COUNTRY_KEY)) };
  globe.dataDirty = false;
}

// Длинный прямой отрезок (маршрут «по прямой», перелёт) на шаре — дуга большого
// круга; вставляем промежуточные точки через ~1°, чтобы линия изгибалась по шару
function globeDensify(line){
  const out = [];
  for(let i = 0; i < line.length; i++){
    if(i){
      const a = line[i - 1], b = line[i], deg = globeAngle(a, b) * 180 / Math.PI;
      if(deg > 1.2){ const f = geoInterpolate(a, b), n = Math.ceil(deg); for(let j = 1; j < n; j++) out.push(f(j / n)); }
    }
    out.push(line[i]);
  }
  return out;
}

// ---------- рисование ----------
function globeRedraw(){
  if(!globe.active || globe.raf) return;
  globe.raf = requestAnimationFrame(() => { globe.raf = 0; globeDraw(); });
}
function globeDraw(){
  if(!globe.active) return;
  if(globe.dataDirty || !globe.data) globeBuildData();
  const { ctx, path, proj, w, h, dpr } = globe;
  const C = globe.colors || (globe.colors = globeColors());
  const moving = globe.moving;
  const s = proj.scale(), [cx, cy] = proj.translate();
  const k = Math.max(1, Math.min(2.4, s / globeFitScale())); // толщина линий растёт с приближением
  // без адаптивного досчёта дуг: контуры и так плотные, а длинные отрезки маршрутов
  // уплотнены заранее (globeDensify) — досчёт съедал половину кадра
  proj.precision(0);
  const center = proj.invert([cx, cy]), view = globeViewAngle();
  // облегчённые контуры — только пока шар далеко: вблизи видна малая часть
  // суши (остальное отсекается), и полную точность можно себе позволить
  const light = moving && s < globeFitScale() * 4;
  const G = p => light ? p.coarse : p.fine;
  globe.projFull.rotate(proj.rotate()).scale(s).translate(proj.translate());
  // Целиком на видимой стороне — проецируем точки сами, прямыми lineTo: у d3 даже
  // без отсечения каждый многоугольник проходит проверку «содержит ли он точку»
  // с точной суммой углов — это была половина кадра. Иначе — путь d3 с отсечением.
  const P = globe.projFull;
  const raw = geom => {
    const closed = geom.type === 'MultiPolygon';
    const parts = closed ? geom.coordinates : [geom.coordinates];
    for(const part of parts) for(const line of part){
      let q = P(line[0]); ctx.moveTo(q[0], q[1]);
      for(let i = 1; i < line.length; i++){ q = P(line[i]); ctx.lineTo(q[0], q[1]); }
      if(closed) ctx.closePath();
    }
  };
  const draw = (p, geom) => { if(globeAngle(p.c, center) + p.r < Math.PI / 2 - 0.02) raw(geom); else path(geom); };
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  // ореол вокруг шара — лёгкое «свечение» атмосферы
  const glow = ctx.createRadialGradient(cx, cy, s * 0.98, cx, cy, s * 1.12);
  glow.addColorStop(0, C.glow); glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(cx, cy, s * 1.12, 0, 2 * Math.PI); ctx.fill();

  // море
  ctx.beginPath(); path({ type: 'Sphere' }); ctx.fillStyle = C.sea; ctx.fill();
  ctx.beginPath(); path(geoGraticule10()); ctx.strokeStyle = C.grat; ctx.lineWidth = 0.6; ctx.stroke();

  // суша одним контуром — так в разы быстрее, чем по стране
  ctx.beginPath();
  globeLandPreps().forEach(p => { if(globeSees(p, center, view)) draw(p, G(p)); });
  ctx.fillStyle = C.land; ctx.fill();
  ctx.strokeStyle = C.border; ctx.lineWidth = 0.5; ctx.stroke();

  const d = globe.data;
  // дом
  if(globeSees(d.home, center, view)){
    ctx.beginPath(); draw(d.home, G(d.home));
    ctx.globalAlpha = 0.12; ctx.fillStyle = HOME_COLOR; ctx.fill(); ctx.globalAlpha = 1;
    ctx.setLineDash([2, 4]); ctx.strokeStyle = HOME_COLOR; ctx.lineWidth = 1.1; ctx.stroke(); ctx.setLineDash([]);
  }
  // страны
  d.countries.forEach(c => {
    if(!globeSees(c.prep, center, view)) return;
    ctx.beginPath(); draw(c.prep, G(c.prep));
    if(!c.wishlist){ ctx.globalAlpha = c.alpha; ctx.fillStyle = c.color; ctx.fill(); ctx.globalAlpha = 1; }
    ctx.setLineDash(c.wishlist ? [4, 4] : []);
    ctx.strokeStyle = c.color; ctx.lineWidth = 1.1; ctx.stroke();
  });
  ctx.setLineDash([]);
  // регионы России — как на плоской карте (если слой включён): серо-синяя
  // заливка посещённых, штрих — проездом; границы — когда шар уже близко
  if(ruRegionsOn && RU_REGIONS.length){
    const showBorders = s >= globeFitScale() * 1.6;
    RU_REGIONS.forEach(rg => {
      const vis = ruRegionsState.visited.has(rg.name), pass = !vis && ruRegionsState.passed.has(rg.name);
      if(!vis && !pass && !showBorders) return;
      const prep = globePrep(rg.geometry);
      if(!globeSees(prep, center, view)) return;
      ctx.beginPath(); draw(prep, G(prep));
      if(vis || pass){ ctx.globalAlpha = vis ? 0.34 : 0.12; ctx.fillStyle = '#4F6A86'; ctx.fill(); ctx.globalAlpha = 1; }
      if(showBorders || pass){ ctx.setLineDash(pass ? [3, 4] : []); ctx.lineWidth = 0.6; ctx.strokeStyle = 'rgba(110,122,138,0.55)'; ctx.stroke(); ctx.setLineDash([]); }
    });
  }
  // дуги из дома к посещённым странам — приподняты над шаром, как траектории перелётов
  if(globeArcsOn) globeDrawArcs(ctx, d, center, s, cx, cy, k, C);
  // маршруты
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  d.routes.forEach(r => {
    if(!globeSees(r.prep, center, view)) return;
    ctx.beginPath(); draw(r.prep, moving ? r.coarse : r.fine);
    ctx.setLineDash(r.dashed ? [6 * k, 4 * k] : []);
    ctx.strokeStyle = r.color; ctx.globalAlpha = 0.9; ctx.lineWidth = 1.6 * k; ctx.stroke(); ctx.globalAlpha = 1;
  });
  ctx.setLineDash([]);
  // города: только на видимой стороне, одним контуром на цвет — сотни точек за пару вызовов
  const rr = 2.6 * Math.min(k, 1.8);
  const byStyle = new Map();
  d.cities.forEach(c => {
    if(globeAngle(c.ll, center) > Math.min(view, Math.PI / 2 - 0.01)) return;
    const p = proj(c.ll);
    const key = (c.wishlist ? 'w' : 'v') + c.color;
    if(!byStyle.has(key)) byStyle.set(key, { c, pts: [] });
    byStyle.get(key).pts.push([p[0], p[1], c.favorite ? rr + 1.2 : rr]);
  });
  ctx.lineWidth = 1;
  byStyle.forEach(({ c, pts }) => {
    ctx.beginPath();
    pts.forEach(([x, y, r]) => { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, 2 * Math.PI); });
    ctx.fillStyle = c.wishlist ? C.sea : c.color; ctx.fill();
    ctx.strokeStyle = c.wishlist ? c.color : C.dot; ctx.stroke();
  });

  // остановки маршрутов — мелкими точками, когда шар уже близко
  const near = s >= globeFitScale() * 1.6;
  let stopCount = 0;
  if(near){
    ctx.beginPath();
    d.stops.forEach(st => {
      if(globeAngle(st.ll, center) > Math.min(view, Math.PI / 2 - 0.01)) return;
      const p = proj(st.ll), r0 = 1.8 * Math.min(k, 1.8);
      ctx.moveTo(p[0] + r0, p[1]); ctx.arc(p[0], p[1], r0, 0, 2 * Math.PI); stopCount++;
    });
    ctx.fillStyle = C.land; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = C.dot; ctx.stroke();
  }

  // объём: светлее к верхнему левому краю, темнее к ободу
  const shade = ctx.createRadialGradient(cx - s * 0.35, cy - s * 0.4, s * 0.1, cx, cy, s);
  shade.addColorStop(0, 'rgba(255,255,255,0.10)');
  shade.addColorStop(0.65, 'rgba(0,0,0,0)');
  shade.addColorStop(1, `rgba(0,0,0,${C.shade})`);
  ctx.beginPath(); path({ type: 'Sphere' }); ctx.fillStyle = shade; ctx.fill();
  ctx.strokeStyle = C.rim; ctx.lineWidth = 1; ctx.stroke();

  // подписи посещённых стран, без наложений. Рисуются и во время вращения:
  // при замерах это доли миллисекунды на кадр даже на медленном телефоне
  globe.stats.countryLabels = 0; globe.stats.cityLabels = 0;
  if(s > globeFitScale() * 0.95){
    const size = Math.round(Math.min(15, 9.5 + 2.2 * k));
    ctx.font = `italic ${size}px 'EB Garamond', serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const boxes = [];
    d.labels.forEach(l => {
      if(globeAngle(l.at, center) > Math.PI / 2 - 0.15) return;
      const p = proj(l.at);
      // мелкую страну на далёком шаре не подписываем: подпись закрыла бы соседей
      const px = Math.sqrt(l.area) / 6371 * s;
      if(px < size * 1.6) return;
      const tw = ctx.measureText(l.text).width;
      const b = [p[0] - tw / 2 - 3, p[1] - size / 2 - 2, p[0] + tw / 2 + 3, p[1] + size / 2 + 2];
    if(boxes.some(o => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1])) return;
      boxes.push(b);
      ctx.lineWidth = 3; ctx.strokeStyle = C.halo; ctx.strokeText(l.text, p[0], p[1]);
      ctx.fillStyle = C.text; ctx.fillText(l.text, p[0], p[1]);
    });
    globe.stats.countryLabels = boxes.length;
    // вблизи — подписи городов и остановок: справа от точки, ближние к центру
    // экрана первыми, без наложений на подписи стран и друг на друга
    let cityLabels = 0;
    if(s >= globeFitScale() * 2.2){
      const cs = Math.round(Math.min(13, 9 + 1.4 * k));
      ctx.font = `${cs}px 'EB Garamond', serif`;
      ctx.textAlign = 'left';
      const cand = [];
      d.cities.forEach(c => cand.push({ ll: c.ll, text: c.entry.name, prio: c.favorite ? 0 : 1 }));
      d.stops.forEach(st => cand.push({ ll: st.ll, text: st.name, prio: 2 }));
      cand.forEach(c => { c.a = globeAngle(c.ll, center); });
      cand.filter(c => c.a < Math.min(view, Math.PI / 2 - 0.05) && c.text).sort((a, b) => a.prio - b.prio || a.a - b.a).slice(0, 160).forEach(c => {
        const p = proj(c.ll);
        if(p[0] < -40 || p[0] > w + 40 || p[1] < 0 || p[1] > h) return;
        const tw = ctx.measureText(c.text).width, x = p[0] + 6;
        const b = [x - 1, p[1] - cs / 2 - 1, x + tw + 1, p[1] + cs / 2 + 1];
    if(boxes.some(o => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1])) return;
        boxes.push(b); cityLabels++;
        ctx.lineWidth = 2.6; ctx.strokeStyle = C.halo; ctx.strokeText(c.text, x, p[1]);
        ctx.fillStyle = C.text; ctx.fillText(c.text, x, p[1]);
      });
    }
    globe.stats.cityLabels = cityLabels;
    globe.stats.seaLabels = globeDrawSeaLabels(ctx, proj, center, s, C, boxes);
  }
  globe.stats.stops = stopCount;
  globeTourDraw(ctx, proj, center, view, k, C);
  globePlaceTip();
}

// Дуга из дома: точки большого круга, поднятые над поверхностью на h·sin(πt).
// Проекция поднятой точки — та же, что у точки поверхности, растянутая от
// центра шара в (1+h) раз. Видна, если на лицевой стороне или уже вышла за край
// диска (поднялась над горизонтом) — так дуга красиво «перелетает» через край.
let globeArcsOn = (function(){ try{ return localStorage.getItem('travel-map-globe-arcs') !== '0'; }catch(e){ return true; } })();
// Океаны и моря на глобусе — как на контурной карте: курсив, разрядка, наклон
// вдоль оси водоёма; помещается ли — по длине оси в проекции. Последними, в
// свободные места: подписи стран и городов важнее. Возвращает число подписей.
function globeDrawSeaLabels(ctx, proj, center, s, C, boxes){
  const zEq = 2 + Math.log2(s / globeFitScale()); // примерно «масштаб карты»
  const small = globe.w < 600, edge = Math.PI / 2 - 0.12;
  const spacing = 'letterSpacing' in ctx;
  let count = 0;
  // плашки поверх глобуса меняются редко — пересчитываем не чаще двух раз в секунду
  const now = performance.now();
  if(!globe.uiBoxes || now - globe.uiBoxesAt > 500){ globe.uiBoxes = floatingUiBoxes(globe.canvas.getBoundingClientRect()); globe.uiBoxesAt = now; }
  const ui = globe.uiBoxes;
  for(const c of seaLabelCands()){
    if(c.minZoom > zEq + 1 || count >= 40) continue;
    const ll = q => [q[1], q[0]];
    if(globeAngle([c.lng, c.lat], center) > edge) continue;
    // у океана концы оси бывают за горизонтом — берём видимую часть оси вокруг центра
    const at = t => [c.a1[1] + (c.a2[1] - c.a1[1]) * t, c.a1[0] + (c.a2[0] - c.a1[0]) * t];
    let t0 = 0.5, t1 = 0.5;
    while(t0 > 0 && globeAngle(at(t0 - 0.05), center) < edge) t0 -= 0.05;
    while(t1 < 1 && globeAngle(at(t1 + 0.05), center) < edge) t1 += 0.05;
    const e1 = proj(at(Math.max(0, t0))), e2 = proj(at(Math.min(1, t1)));
    const vis = seaClip({ x: e1[0], y: e1[1] }, { x: e2[0], y: e2[1] }, 10, 10, globe.w - 10, globe.h - 10);
    const q1 = globeAngle(ll(c.b1), center) < edge ? proj(ll(c.b1)) : null, q2 = globeAngle(ll(c.b2), center) < edge ? proj(ll(c.b2)) : null;
    if(!vis || !q1 || !q2) continue;
    const [A1, A2] = vis, La = A1.distanceTo(A2), W = Math.hypot(q2[0] - q1[0], q2[1] - q1[1]);
    if(La < 30 || W < 8) continue;
    const lay = seaLabelLayout(c, La, W, small);
    if(!lay) continue;
    let deg = seaLabelAngle(A1, A2), cx = (A1.x + A2.x) / 2, cy = (A1.y + A2.y) / 2;
    if(c.sea === 'ocean'){
      // океан — вдоль параллели в своей точке, как в атласе
      const m = proj([c.lng, c.lat]), e = proj([c.lng + 2, c.lat]);
      if(m[0] < 0 || m[1] < 0 || m[0] > globe.w || m[1] > globe.h) continue;
      deg = seaLabelAngle({ x: m[0], y: m[1] }, { x: e[0], y: e[1] }); cx = m[0]; cy = m[1];
    }
    const poly = rotRect(cx, cy, lay.w + 4, lay.h + 2, deg);
    const b = [Math.min(...poly.map(v => v[0])), Math.min(...poly.map(v => v[1])), Math.max(...poly.map(v => v[0])), Math.max(...poly.map(v => v[1]))];
    if(b[0] < 4 || b[1] < 4 || b[2] > globe.w - 4 || b[3] > globe.h - 4 || ui.some(o => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1])) continue;
    if(boxes.some(o => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1] && polysHit(poly, boxPoly(o)))) continue;
    b.poly = poly; boxes.push(b); count++;
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(deg * Math.PI / 180);
    ctx.font = `italic ${lay.weight} ${lay.size}px 'EB Garamond', Georgia, serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if(spacing) ctx.letterSpacing = lay.sp.toFixed(1) + 'px';
    const lh = Math.round(lay.size * 1.1), y0 = -(lay.lines.length - 1) * lh / 2;
    lay.lines.forEach((line, i) => {
      const t = lay.upper ? line.toUpperCase() : line, x = spacing ? lay.sp / 2 : 0;
      ctx.lineWidth = 3; ctx.strokeStyle = C.sea; ctx.strokeText(t, x, y0 + i * lh);
      ctx.fillStyle = C.seaText; ctx.fillText(t, x, y0 + i * lh);
    });
    ctx.restore();
  }
  return count;
}
function globeLabelPoint(key, geom){
  if(!globeLabelAt.has(key)){ const p = polyLabelPoint(mainRing(geom)); globeLabelAt.set(key, { at: [p[1], p[0]], area: geomAreaKm2(geom) }); }
  return globeLabelAt.get(key).at;
}
function globeDrawArcs(ctx, d, center, s, cx, cy, k, C){
  const home = [HOME_LOCATION.lng, HOME_LOCATION.lat], P = globe.projFull;
  ctx.lineWidth = 1.3 * Math.min(k, 1.6); ctx.lineCap = 'round';
  d.countries.forEach(c => {
    if(c.wishlist || c.key === HOME_COUNTRY_KEY) return;
    const to = globeLabelPoint(c.key, c.geom), ang = globeAngle(home, to);
    if(ang < 0.02) return;
    const f = geoInterpolate(home, to), n = Math.max(16, Math.ceil(ang * 180 / 2)), hMax = 0.05 + 0.3 * ang / Math.PI;
    ctx.beginPath();
    let pen = false, end = null;
    for(let i = 0; i <= n; i++){
      const t = i / n, ll = f(t), h = hMax * Math.sin(Math.PI * t);
      const q = P(ll), sx = cx + (q[0] - cx) * (1 + h), sy = cy + (q[1] - cy) * (1 + h);
      const visible = globeAngle(ll, center) < Math.PI / 2 || Math.hypot(sx - cx, sy - cy) > s;
      if(visible){ if(pen) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy); pen = true; if(i === n) end = [sx, sy]; }
      else pen = false;
    }
    ctx.strokeStyle = c.color; ctx.globalAlpha = 0.55; ctx.stroke(); ctx.globalAlpha = 1;
    if(end){ ctx.beginPath(); ctx.arc(end[0], end[1], 2.4, 0, 2 * Math.PI); ctx.fillStyle = c.color; ctx.fill(); }
  });
  // дом — точкой-источником
  if(globeAngle(home, center) < Math.PI / 2){
    const q = globe.proj(home);
    ctx.beginPath(); ctx.arc(q[0], q[1], 3.6, 0, 2 * Math.PI); ctx.fillStyle = HOME_COLOR; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = C.halo; ctx.stroke();
  }
}
function globeSetArcs(on){
  globeArcsOn = on;
  try{ localStorage.setItem('travel-map-globe-arcs', on ? '1' : '0'); }catch(e){}
  const b = document.getElementById('globeArcsBtn');
  if(b){ b.classList.toggle('active', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }
  globeRedraw();
}

// ---------- вращение и масштаб ----------
function globeMoved(){
  globe.moving = true;
  globe.lastTap = null; // после вращения второе касание — уже не «двойное»
  clearTimeout(globe.idleTimer);
  globe.idleTimer = setTimeout(() => { globe.moving = false; globeRedraw(); }, 160);
  globeRedraw();
}
function globeRotateBy(dx, dy){
  const s = globe.proj.scale();
  const r = globe.proj.rotate();
  const deg = 180 / Math.PI / s;
  r[0] += dx * deg;
  r[1] = Math.max(-88, Math.min(88, r[1] - dy * deg));
  globe.proj.rotate(r);
  globeMoved();
}
function globeSetScale(s){
  const min = globeFitScale() * 0.7;
  globe.proj.scale(Math.max(min, s));
  globeMoved();
  if(s >= globeMaxScale()) globeHandoff();
}
function globeCenter(){
  const r = globe.proj.rotate();
  return { lat: -r[1], lng: ((-r[0] + 540) % 360) - 180 };
}
function globeStopInertia(){ if(globe.inertia){ cancelAnimationFrame(globe.inertia.raf); globe.inertia = null; } }
function globeStartInertia(vx, vy){
  globeStopInertia();
  if(Math.hypot(vx, vy) < 0.05) return;           // пикселей в мс
  const it = globe.inertia = { vx, vy, t: performance.now(), raf: 0 };
  const step = now => {
    const dt = Math.min(48, now - it.t); it.t = now;
    const decay = Math.pow(0.994, dt);            // ≈ остановка за секунду
    it.vx *= decay; it.vy *= decay;
    globeRotateBy(it.vx * dt, it.vy * dt);
    if(Math.hypot(it.vx, it.vy) < 0.01){ globe.inertia = null; return; }
    it.raf = requestAnimationFrame(step);
  };
  it.raf = requestAnimationFrame(step);
}
// Плавное приближение. Новое приближение, жест или перелёт отменяют прежнее:
// раньше два одновременных (быстрые «+»/«−», приближение сразу после включения
// шара) по очереди задавали масштаб в каждом кадре, и шар дёргался.
function globeAnimateScale(to, ms){
  globeStopInertia();
  const id = globe.scaleAnim = (globe.scaleAnim || 0) + 1;
  const from = globe.proj.scale(), t0 = performance.now();
  const step = now => {
    if(!globe.active || globe.scaleAnim !== id) return;
    const t = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - t, 3);
    globeSetScale(from + (to - from) * e);
    if(t < 1 && globe.active) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function globeBindInput(){
  const cv = globe.canvas;
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId);
    globeStopInertia(); globeStopFlight(); globeTourPause();
    globe.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...globe.pointers.values()];
    if(pts.length === 1){
      globe.gesture = { kind: 'drag', x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: 0, samples: [] };
    } else if(pts.length === 2){
      globe.gesture = { kind: 'pinch', dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), scale: globe.proj.scale(),
        mx: (pts[0].x + pts[1].x) / 2, my: (pts[0].y + pts[1].y) / 2, moved: 99 };
    }
  });
  cv.addEventListener('pointermove', e => {
    if(!globe.pointers.has(e.pointerId)) return;
    globe.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = globe.gesture;
    if(!g) return;
    if(g.kind === 'drag'){
      const dx = e.clientX - g.x, dy = e.clientY - g.y;
      g.x = e.clientX; g.y = e.clientY;
      g.moved = Math.max(g.moved, Math.hypot(e.clientX - g.x0, e.clientY - g.y0));
      if(g.moved < 4) return;
      const now = performance.now();
      g.samples.push({ t: now, dx, dy });
      while(g.samples.length && now - g.samples[0].t > 90) g.samples.shift();
      globeHideTip(); globeHoverHide();
      globeRotateBy(dx, dy);
    } else if(g.kind === 'pinch'){
      const pts = [...globe.pointers.values()];
      if(pts.length < 2) return;
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const mx = (pts[0].x + pts[1].x) / 2, my = (pts[0].y + pts[1].y) / 2;
      globeHideTip();
      globeRotateBy(mx - g.mx, my - g.my);
      g.mx = mx; g.my = my;
      if(g.dist > 0) globeSetScale(g.scale * dist / g.dist);
    }
  });
  const end = e => {
    if(!globe.pointers.has(e.pointerId)) return;
    globe.pointers.delete(e.pointerId);
    const g = globe.gesture;
    if(g && g.kind === 'drag' && globe.pointers.size === 0){
      if(g.moved < 6 && performance.now() - g.t0 < 600){
        // двойное касание (и двойной клик) — приблизить к тому, что под пальцем
        const lt = globe.lastTap, now = performance.now();
        // двойное — только по тому же виду: шар не повернули и не приблизили между касаниями
        const view = globe.proj.rotate().concat(globe.proj.scale()).map(v => v.toFixed(3)).join();
        if(lt && now - lt.t < 330 && Math.hypot(e.clientX - lt.x, e.clientY - lt.y) < 30 && lt.view === view){ globe.lastTap = null; globeDoubleTap(e.clientX, e.clientY); }
        else { globe.lastTap = { t: now, x: e.clientX, y: e.clientY, view }; globeTap(e.clientX, e.clientY); }
      }
      else {
        const s = g.samples, span = s.length ? performance.now() - s[0].t : 0;
        if(span > 0 && performance.now() - s[s.length - 1].t < 60){
          const sx = s.reduce((a, b) => a + b.dx, 0), sy = s.reduce((a, b) => a + b.dy, 0);
          globeStartInertia(sx / span, sy / span);
        }
      }
    }
    // после щипка оставшийся палец продолжает вращать с текущего места
    if(globe.pointers.size === 1){
      const p = [...globe.pointers.values()][0];
      globe.gesture = { kind: 'drag', x: p.x, y: p.y, x0: p.x, y0: p.y, t0: 0, moved: 99, samples: [] };
    } else if(globe.pointers.size === 0) globe.gesture = null;
  };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    globeStopFlight(); globeTourPause();
    globeHideTip();
    globeSetScale(globe.proj.scale() * Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0016)));
  }, { passive: false });
  cv.addEventListener('dblclick', e => e.preventDefault());   // двойной клик ловим сами (см. выше)
  // на ПК — название под курсором, без нажатия
  cv.addEventListener('pointermove', e => {
    if(e.pointerType !== 'mouse' || e.buttons || globe.pointers.size) return;
    globe.hoverAt = [e.clientX, e.clientY];
    if(globe.hoverRaf) return;
    globe.hoverRaf = requestAnimationFrame(() => { globe.hoverRaf = 0; globeHover(); });
  });
  cv.addEventListener('pointerleave', () => globeHoverHide());
}

function globeDoubleTap(x, y){
  globeHideTip();
  const hit = globeHit(x, y);
  if(!hit) return;
  const s = globe.proj.scale();
  if(hit.kind === 'country'){
    const g = getCountryGeometry(hit.key), prep = globePrep(g);
    const to = globeLabelPoint(hit.key, g);
    globeFlyTo(to, Math.max(s * 1.25, globeTourScale(prep.r * 0.85, false)), 700);
  } else globeFlyTo(hit.ll, Math.min(globeMaxScale() * 0.95, s * 2), 450);
}
function globeHover(){
  if(!globe.active || !globe.hoverAt || globe.moving) return globeHoverHide();
  const [x, y] = globe.hoverAt, hit = globeHit(x, y);
  let el = globe.hoverEl;
  if(!el){ el = globe.hoverEl = document.createElement('div'); el.className = 'globe-hover'; globe.wrap.appendChild(el); }
  if(!hit || hit.kind === 'sea'){ el.style.display = 'none'; globe.canvas.style.cursor = ''; return; }
  const text = hit.kind === 'country' ? `${countryFlag(hit.key)} ${COUNTRY_RU[hit.key] || hit.key}`
    : hit.stop ? `${cleanPlaceName(hit.stop)} · ${hit.entry.name}` : hit.entry.name;
  el.textContent = text;
  const r = globe.canvas.getBoundingClientRect();
  el.style.left = (x - r.left + 14) + 'px'; el.style.top = (y - r.top + 14) + 'px';
  el.style.display = '';
  globe.canvas.style.cursor = hit.kind === 'country' ? '' : 'pointer';
}
function globeHoverHide(){ if(globe.hoverEl) globe.hoverEl.style.display = 'none'; }

// ---------- нажатие: что под пальцем ----------
function globeHit(x, y){
  const r = globe.canvas.getBoundingClientRect();
  const px = x - r.left, py = y - r.top;
  const ll = globe.proj.invert([px, py]);
  const center = globe.proj.invert(globe.proj.translate());
  if(!ll || globeAngle(ll, center) > Math.PI / 2) return null;   // мимо шара
  const d = globe.data;
  // город — ближайший в пределах пальца
  let best = null, bestD = 16;
  d.cities.forEach(c => {
    if(globeAngle(c.ll, center) > Math.PI / 2) return;
    const p = globe.proj(c.ll), dd = Math.hypot(p[0] - px, p[1] - py);
    if(dd < bestD){ bestD = dd; best = { kind: 'city', entry: c.entry, ll: c.ll }; }
  });
  if(best) return best;
  // остановка маршрута (видна вблизи) — карточка её маршрута
  if(globe.proj.scale() >= globeFitScale() * 1.6){
    bestD = 12;
    d.stops.forEach(st => {
      if(globeAngle(st.ll, center) > Math.PI / 2) return;
      const p = globe.proj(st.ll), dd = Math.hypot(p[0] - px, p[1] - py);
      if(dd < bestD){ bestD = dd; best = { kind: 'route', entry: st.entry, ll: st.ll, stop: st.name }; }
    });
    if(best) return best;
  }
  // маршрут — расстояние до отрезков прорежённой линии на видимой стороне
  bestD = 10;
  d.routes.forEach(rt => rt.coarse.coordinates.forEach(seg => {
    let prev = null;
    seg.forEach(c => {
      const vis = globeAngle(c, center) < Math.PI / 2;
      const p = vis ? globe.proj(c) : null;
      if(p && prev){
        const vx = p[0] - prev[0], vy = p[1] - prev[1], len2 = vx * vx + vy * vy;
        const t = len2 ? Math.max(0, Math.min(1, ((px - prev[0]) * vx + (py - prev[1]) * vy) / len2)) : 0;
        const dd = Math.hypot(prev[0] + t * vx - px, prev[1] + t * vy - py);
        if(dd < bestD){ bestD = dd; best = { kind: 'route', entry: rt.entry, ll }; }
      }
      prev = p;
    });
  }));
  if(best) return best;
  const f = findCountryFeature({ lat: ll[1], lng: ll[0] });
  if(f) return { kind: 'country', key: f.properties.name, ll };
  return { kind: 'sea', ll };
}
// Карточка прямо на шаре. У города и маршрута — та же, что на плоской карте
// (buildPopup: фото, даты, заметки, кнопки), у страны — сжатая: статус, города,
// последние поездки. «На карте →» перелетает к месту и открывает полную карточку.
function globeCountryCard(key){
  const own = allEntries.filter(e => e.countryKey === key);
  const visited = own.filter(e => e.type === 'country' && e.status !== 'wishlist');
  const planned = own.filter(e => e.type === 'country' && e.status === 'wishlist');
  const cities = own.filter(e => e.type === 'city').length;
  const isHome = key === HOME_COUNTRY_KEY;
  const years = [...new Set(visited.map(e => e.year).filter(Boolean))].sort((a, b) => a - b);
  const status = isHome ? 'дом' : visited.length ? 'были' + (years.length ? ': ' + years.join(', ') : '') : planned.length ? 'в планах' : 'пока не были';
  const tripLast = new Map();
  allEntries.forEach(e => {
    if(!e.trip) return;
    if(e.countryKey !== key && !(e.type === 'route' && (e.waypointCountryKeys || []).includes(key))) return;
    const t = (e.year || 0) * 12 + (e.month || 0);
    if(t > (tripLast.get(e.trip) ?? -1)) tripLast.set(e.trip, t);
  });
  const trips = [...tripLast.keys()].sort((a, b) => tripLast.get(b) - tripLast.get(a) || a.localeCompare(b, 'ru'));
  const SHOW = 4;
  return `<div class="gt-country"><div class="gt-flag">${countryFlag(key)}</div>` +
    `<div class="gt-name">${escapeHtml(COUNTRY_RU[key] || key)}</div><div class="gt-dim">${escapeHtml(status)}${cities ? ' · городов ' + cities : ''}</div>` +
    (trips.length ? `<div class="gt-trips">${trips.slice(0, SHOW).map(t => `<button type="button" class="cpop-trip" data-globe-trip="${escapeAttr(t)}">${escapeHtml(t)}</button>`).join('')}` +
      (trips.length > SHOW ? `<div class="gt-dim">и ещё ${trips.length - SHOW}</div>` : '') + '</div>' : '') + '</div>';
}
function globeTap(x, y){
  const hit = globeHit(x, y);
  if(!hit || hit.kind === 'sea'){ globeHideTip(); return; }
  globeShowCard(hit);
}
function globeShowCard(hit){
  let body = '';
  if(hit.kind === 'country') body = globeCountryCard(hit.key);
  else {
    body = buildPopup(hit.entry);
    if(hit.stop) body = `<div class="gt-dim gt-stop">остановка: ${escapeHtml(cleanPlaceName(hit.stop))}</div>` + body;
  }
  globe.tipFor = hit;
  globe.tip.innerHTML = '<button type="button" class="globe-tip-x" data-globe-close aria-label="Закрыть">×</button>' +
    `<div class="globe-tip-body">${body}</div>` +
    '<button type="button" class="globe-tip-open" data-globe-open>На карте →</button>';
  globe.tip.style.display = '';
  globePlaceTip();
}
// данные поменялись (удалили отметку кнопкой в карточке, отметили посещённой,
// пришла синхронизация) — карточка показывает свежее или закрывается
function globeRefreshCard(){
  const hit = globe.tipFor;
  if(!hit || !globe.tip || globe.tip.style.display === 'none') return;
  if(hit.entry){
    const fresh = allEntries.find(e => e.id === hit.entry.id);
    if(!fresh){ globeHideTip(); return; }
    hit.entry = fresh;
  }
  const body = globe.tip.querySelector('.globe-tip-body'), top = body ? body.scrollTop : 0;
  globeShowCard(hit);
  const nb = globe.tip.querySelector('.globe-tip-body'); if(nb) nb.scrollTop = top;
}
function globePlaceTip(){
  const hit = globe.tipFor;
  if(!hit || !globe.tip || globe.tip.style.display === 'none') return;
  const center = globe.proj.invert(globe.proj.translate());
  if(globeAngle(hit.ll, center) > Math.PI / 2){ globe.tip.style.visibility = 'hidden'; return; }
  const p = globe.proj(hit.ll);
  globe.tip.style.visibility = '';
  // не влезает над точкой — показываем под ней; по горизонтали — в пределах экрана
  const tw = globe.tip.offsetWidth || 240, th = globe.tip.offsetHeight || 120;
  const below = p[1] - th - 14 < 8;
  globe.tip.classList.toggle('below', below);
  globe.tip.style.left = Math.round(Math.max(tw / 2 + 6, Math.min(globe.w - tw / 2 - 6, p[0]))) + 'px';
  globe.tip.style.top = Math.round(p[1]) + 'px';
}
function globeHideTip(){
  if(globe.tip) globe.tip.style.display = 'none';
  globe.tipFor = null;
}
// Плавный перелёт: поворот к точке и приближение одновременно. Пока летим,
// рисуем облегчённо (как при вращении); жест пользователя перелёт прерывает.
function globeFlyTo(ll, scale, ms, done){
  globeStopFlight(); globeStopInertia();
  const r0 = globe.proj.rotate(), s0 = globe.proj.scale();
  const lon1 = -ll[0], lat1 = -ll[1];
  let dl = lon1 - r0[0]; dl = ((dl + 540) % 360) - 180;          // короткой дорогой
  const t0 = performance.now(), fl = globe.flight = { raf: 0 };
  const step = now => {
    if(globe.flight !== fl || !globe.active) return;
    const t = Math.min(1, (now - t0) / ms), e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    globe.proj.rotate([r0[0] + dl * e, r0[1] + (lat1 - r0[1]) * e, 0]);
    // масштаб — по логарифму: приближение воспринимается равномерным
    globe.proj.scale(s0 * Math.pow(scale / s0, e));
    globeMoved();
    if(t < 1) fl.raf = requestAnimationFrame(step);
    else { globe.flight = null; if(done) done(); }
  };
  fl.raf = requestAnimationFrame(step);
}
function globeStopFlight(){ clearTimeout(globe.flyOutTimer); globe.scaleAnim = (globe.scaleAnim || 0) + 1; if(globe.flight){ cancelAnimationFrame(globe.flight.raf); globe.flight = null; } }

// «На карте →» — перелёт к месту и та же карточка, что на плоской карте
function globeOpenOnMap(){
  const hit = globe.tipFor;
  if(!hit) return;
  globeHideTip();
  const land = () => {
    globeExit({ center: { lat: hit.ll[1], lng: hit.ll[0] }, zoom: GLOBE_HANDOFF_ZOOM });
    if(hit.kind === 'country') openCountryPopup(hit.key, L.latLng(hit.ll[1], hit.ll[0]));
    // кластеры городов перестраиваются после смены масштаба с анимацией: открытая
    // сразу карточка тут же закрывалась вместе с перестроенной точкой
    else if(hit.entry) setTimeout(() => focusEntry(hit.entry), 350);
  };
  globeFlyTo(hit.ll, globeScaleForZoom(GLOBE_HANDOFF_ZOOM) * 0.98, 650, land);
}

// ---------- вход и выход ----------
function globeEnter(opts){
  if(globe.active) return;
  opts = opts || {};
  globeEnsureDom();
  globe.active = true;
  document.body.classList.add('globe-mode');
  map.closePopup();
  globeResize();
  const c = map.getCenter(), z = map.getZoom();
  globe.proj.rotate([-c.lng, -Math.max(-70, Math.min(70, c.lat)), 0]);
  // Начинаем с того же масштаба, что был на карте, и «отлетаем» до шара целиком:
  // видно, откуда пришли. С обзора мира — сразу шар целиком.
  const fromMap = Math.min(globeMaxScale() * 0.95, Math.max(globeFitScale(), globeScaleForZoom(z)));
  globe.proj.scale(fromMap);
  // «отлёт» с приближенной карты — если пользователь не успел сам взяться за шар
  // (жест, колесо, клавиша отменяют его так же, как идущий перелёт)
  clearTimeout(globe.flyOutTimer);
  if(fromMap > globeFitScale() * 1.3 && !opts.noFlyOut) globe.flyOutTimer = setTimeout(() => globeFlyTo([c.lng, Math.max(-70, Math.min(70, c.lat))], globeFitScale() * 1.15, 700), 30);
  globe.dataDirty = true; globe.colors = null;
  globeUpdateButton();
  try{ localStorage.setItem('travel-map-view', 'globe'); }catch(e){}
  const hint = document.getElementById('globeHint');
  if(hint){ hint.classList.remove('gone'); clearTimeout(globe.hintTimer); globe.hintTimer = setTimeout(() => hint.classList.add('gone'), 3500); }
  globeRedraw();
}
// opts.center / opts.zoom — куда поставить плоскую карту
function globeExit(opts){
  if(!globe.active) return;
  opts = opts || {};
  globeStopInertia(); globeStopFlight(); globeHideTip(); globeTourStop();
  // пальцы, лежавшие на шаре в момент выхода (щипок довёл до плоской карты),
  // иначе остались бы «нажатыми», и следующий жест на шаре не распознавался
  globe.pointers.clear(); globe.gesture = null;
  const c = opts.center || globeCenter();
  const z = opts.zoom != null ? opts.zoom : Math.max(2, Math.min(GLOBE_HANDOFF_ZOOM, Math.round(globeZoomForScale(globe.proj.scale()))));
  globe.active = false;
  document.body.classList.remove('globe-mode');
  globeUpdateButton();
  try{ localStorage.setItem('travel-map-view', 'map'); }catch(e){}
  map.invalidateSize();
  map.setView([c.lat, c.lng], z, { animate: false });
}
// сильно приблизили — дальше плоская карта в той же точке
function globeHandoff(){ globeExit({ zoom: GLOBE_HANDOFF_ZOOM }); }
function globeUpdateButton(){
  const b = document.getElementById('globeToggleBtn');
  if(!b) return;
  b.classList.toggle('active', globe.active);
  b.textContent = globe.active ? '🗺 Карта' : '🌍 Глобус';
  b.title = globe.active ? 'Вернуться к плоской карте' : 'Показать Землю шаром';
  b.setAttribute('aria-pressed', globe.active ? 'true' : 'false');
}

document.getElementById('globeToggleBtn').addEventListener('click', () => { if(globe.active) globeExit(); else globeEnter(); });
// данные, фильтры и ползунок лет поменялись — перерисовать шар
mapRedrawHooks.push(() => { if(globe.active){ globe.dataDirty = true; globeRedraw(); globeRefreshCard(); } });
// тема
new MutationObserver(() => { globe.colors = null; globeRedraw(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
window.addEventListener('resize', () => {
  if(!globe.active) return;
  globe.resizing = Date.now();
  globeResize();
});
// Кто-то показывает место на плоской карте (поиск, список, коллекции, «на карте»
// у поездки) — значит, нужна она: глобус уступает. Свои перемещения (выход из
// глобуса) идут уже после снятия флага, а смену размера окна не считаем.
map.on('popupopen movestart', () => {
  if(globe.active && Date.now() - globe.resizing > 800) globeExit({ center: map.getCenter(), zoom: map.getZoom() });
});
// клавиатура на ПК: стрелки — вращать, + и − — приблизить и отдалить,
// пробел — пауза облёта, Esc — закрыть карточку
document.addEventListener('keydown', e => {
  if(!globe.active || e.altKey || e.ctrlKey || e.metaKey) return;
  const t = e.target;
  if(t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
  if([...document.querySelectorAll('.modal-overlay')].some(m => m.style.display === 'flex')) return;
  const step = 60;
  const act = {
    ArrowLeft: () => globeRotateBy(step, 0), ArrowRight: () => globeRotateBy(-step, 0),
    ArrowUp: () => globeRotateBy(0, step), ArrowDown: () => globeRotateBy(0, -step),
    '+': () => globeAnimateScale(globe.proj.scale() * 1.4, 220), '=': () => globeAnimateScale(globe.proj.scale() * 1.4, 220),
    '-': () => globeAnimateScale(globe.proj.scale() / 1.4, 220), '_': () => globeAnimateScale(globe.proj.scale() / 1.4, 220),
    ' ': () => { if(globeTour.active){ if(globeTour.paused) globeTourResume(); else globeTourPause(); } },
    Escape: () => { if(globe.tipFor) globeHideTip(); else if(globeTour.active) globeTourStop(); },
  }[e.key];
  if(!act) return;
  e.preventDefault();
  globeStopInertia(); globeStopFlight();
  act();
});
document.getElementById('globeArcsBtn').addEventListener('click', () => globeSetArcs(!globeArcsOn));
globeSetArcs(globeArcsOn);
// режимы, которым нужна плоская карта: «указать точку на карте» и квиз «Где это?»
['placeCityBtn', 'placeCountryBtn'].forEach(id => {
  const b = document.getElementById(id);
  if(b) b.addEventListener('click', () => { if(globe.active) globeExit(); });
});
new MutationObserver(() => { if(globe.active && document.body.classList.contains('quiz-map')) globeExit(); })
  .observe(document.body, { attributes: true, attributeFilter: ['class'] });
// режим запоминается: кто привык к шару, открывает приложение на шаре
try{ if(localStorage.getItem('travel-map-view') === 'globe') setTimeout(globeEnter, 300); }catch(e){}
