// ---------- облёт поездки на шаре ----------
// Шар сам летит по поездке: линия прорисовывается от начала к концу, остановки
// загораются по мере прохождения, внизу — название, месяц и текущая остановка.
// Порядок — как на странице поездки (tripOrder), маршруты — по своим трекам,
// между частями поездки — дугой по шару. Камера идёт за «головой» линии с
// небольшим запаздыванием, в конце отлетает так, чтобы видно было всю поездку.
// Любой жест на шаре ставит облёт на паузу; ▶ — продолжить, ✕ — закончить.
const globeTour = { active: false, paused: false, raf: 0, t: 0, last: 0, dur: 0, path: null, stops: [], cum: [], total: 0,
  title: '', cam: null, scale: 0, name: '', bar: null, color: '#A6592E' };

function globeTourEntries(target){
  // одна запись (маршрут без поездки) или вся поездка
  const list = target.trip ? allEntries.filter(e => e.trip === target.trip) : [target];
  const ord = e => [(e.tripOrder || 0), (e.year || 0) * 10000 + (e.month || 0) * 100 + (e.day || 0)];
  return list.filter(e => e.type !== 'country' && e.status !== 'wishlist')
    .sort((a, b) => { const x = ord(a), y = ord(b); return x[0] - y[0] || x[1] - y[1]; });
}
function globeTourBuild(target){
  const entries = globeTourEntries(target);
  const pts = [], stops = [];
  const push = ll => {
    const prev = pts[pts.length - 1];
    if(prev && globeAngle(prev, ll) > 1.2 * GLOBE_RAD) globeDensify([prev, ll]).slice(1, -1).forEach(p => pts.push(p));
    if(!prev || prev[0] !== ll[0] || prev[1] !== ll[1]) pts.push(ll);
  };
  const stopAt = (name, ll, e) => { if(name) stops.push({ name, ll, idx: pts.length - 1, entry: e }); };
  entries.forEach(e => {
    if(e.type === 'city' && isFinite(e.lat) && isFinite(e.lng)){ push([e.lng, e.lat]); stopAt(e.name, [e.lng, e.lat], e); }
    else if(e.type === 'route'){
      const segs = entrySegments(e).filter(s => s.length >= 2);
      if(!segs.length) return;
      const total = segs.reduce((n, s) => n + s.length, 0);
      const names = Array.isArray(e.waypointNames) ? e.waypointNames : [];
      const at = Array.isArray(e.waypointCoords) ? routeStopCoords(e) : [];
      // остановки маршрута ставим на ближайшую точку его трека
      const flat = [];
      segs.forEach(s => downsample(s, Math.max(2, Math.round(500 * s.length / total))).forEach(c => flat.push([c[1], c[0]])));
      const base = pts.length;
      flat.forEach(push);
      names.forEach((n, i) => {
        const c = at[i]; if(!n || !c) return;
        let best = base, bd = Infinity;
        for(let j = base; j < pts.length; j++){ const d = globeAngle(pts[j], [c[1], c[0]]); if(d < bd){ bd = d; best = j; } }
        stops.push({ name: n.trim(), ll: [c[1], c[0]], idx: best, entry: e });
      });
    }
  });
  if(!pts.length) return null;
  // поездка из одного города — облёт превращается в подлёт к нему
  if(pts.length === 1) pts.push([pts[0][0] + 1e-4, pts[0][1]]);
  const cum = [0];
  for(let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + globeAngle(pts[i - 1], pts[i]));
  const total = cum[cum.length - 1];
  // одна и та же остановка дважды подряд (город и начало маршрута) — одна
  const seen = new Set();
  const uniq = stops.sort((a, b) => a.idx - b.idx).filter(s => { const k = s.name.toLowerCase(); if(seen.has(k)) return false; seen.add(k); return true; });
  // «описанная окружность» поездки — по ней выбираем приближение
  const c = geoCentroid({ type: 'MultiPoint', coordinates: pts });
  let r = 0; pts.forEach(p => { const d = globeAngle(c, p); if(d > r) r = d; });
  const first = entries[0], last = entries[entries.length - 1];
  const when = e => e ? [monthLabel(e.month), e.year].filter(Boolean).join(' ') : '';
  const span = dateSpan(entries);
  const period = span ? formatDateRange(span.from, span.to) : when(first) === when(last) ? when(first) : `${when(first)} — ${when(last)}`;
  const km = total * 6371;
  return { pts, cum, total, stops: uniq, center: c, radius: r, title: target.trip || target.name, period,
    color: (entries.find(e => e.type === 'route') || first).color || DEFAULT_COLOR.route,
    // 8–24 секунды: короткая прогулка не пролетает за миг, кругосветка не тянется
    dur: km < 1 ? 2500 : Math.max(8000, Math.min(24000, 8000 + km * 2)) };
}
function globeTourScale(radius, near){
  const box = Math.min(globe.w, globe.h - globeInsets().top - globeInsets().bottom);
  const want = 0.42 * box / Math.max(0.004, Math.sin(Math.min(Math.PI / 2, radius)));
  return Math.max(globeFitScale(), Math.min(globeMaxScale() * 0.9, want * (near ? 1.5 : 1)));
}
function globeTourStart(target){
  const tour = globeTourBuild(target);
  if(!tour){ toast('У этой поездки нет точек для облёта'); return; }
  if(!globe.active) globeEnter({ noFlyOut: true });
  globeHideTip();
  Object.assign(globeTour, tour, { active: true, paused: false, t: 0, last: 0, cam: tour.pts[0].slice() });
  globeTour.scale = globeTourScale(tour.radius, tour.radius > 0.02);
  globeTourUi();
  // сначала подлетаем к началу, затем — облёт
  globeFlyTo(tour.pts[0], globeTour.scale, 900, () => { if(globeTour.active){ globeTour.last = performance.now(); globeTour.raf = requestAnimationFrame(globeTourStep); } });
}
function globeTourStep(now){
  if(!globeTour.active || globeTour.paused || !globe.active) return;
  const dt = Math.min(64, now - (globeTour.last || now)); globeTour.last = now;
  globeTour.t = Math.min(1, globeTour.t + dt / globeTour.dur);
  const head = globeTourHead();
  // камера догоняет «голову» линии плавно, без рывков на изломах
  const k = 1 - Math.pow(0.9, dt / 16);
  const cam = globeTour.cam;
  let dl = head[0] - cam[0]; dl = ((dl + 540) % 360) - 180;
  cam[0] += dl * k; cam[1] += (head[1] - cam[1]) * k;
  globe.proj.rotate([-cam[0], -cam[1], 0]);
  // Приближение — по участку вокруг «головы»: на дороге вдоль побережья камера
  // опускается ниже, на перелёте между частями поездки — поднимается
  const want = globeTourWindowScale(), cur = globe.proj.scale();
  globe.proj.scale(cur * Math.pow(want / cur, 1 - Math.pow(0.94, dt / 16)));
  globeMoved();
  globeTourUiUpdate();
  if(globeTour.t < 1) globeTour.raf = requestAnimationFrame(globeTourStep);
  else globeTourFinish();
}
function globeTourWindowScale(){
  const T = globeTour, d = T.t * T.total;
  const from = d - T.total * 0.04, to = d + Math.max(T.total * 0.12, 0.004);
  const head = T.head || T.pts[0];
  let r = 0.002;
  for(let i = 0; i < T.pts.length; i++){
    const c = T.cum[i];
    if(c < from) continue;
    if(c > to) break;
    const a = globeAngle(head, T.pts[i]); if(a > r) r = a;
  }
  return globeTourScale(r, false);
}
// текущая точка линии и индекс последней пройденной вершины
function globeTourHead(){
  const T = globeTour, d = T.t * T.total;
  let lo = 0, hi = T.cum.length - 1;
  while(lo < hi){ const m = (lo + hi + 1) >> 1; if(T.cum[m] <= d) lo = m; else hi = m - 1; }
  T.headIdx = lo;
  if(lo >= T.pts.length - 1) return T.head = T.pts[T.pts.length - 1];
  const seg = T.cum[lo + 1] - T.cum[lo], f = seg ? (d - T.cum[lo]) / seg : 0;
  return T.head = geoInterpolate(T.pts[lo], T.pts[lo + 1])(f);
}
function globeTourFinish(){
  globeTour.t = 1; globeTour.paused = true;
  globeTourUiUpdate();
  globeFlyTo(globeTour.center, globeTourScale(globeTour.radius, false), 1100);
}
function globeTourPause(){
  if(!globeTour.active || globeTour.paused) return;
  globeTour.paused = true; cancelAnimationFrame(globeTour.raf);
  globeTourUiUpdate();
}
function globeTourResume(){
  if(!globeTour.active) return;
  if(globeTour.t >= 1){ globeTour.t = 0; }
  globeTour.paused = false;
  globeTour.cam = globeCenter ? [globeCenter().lng, globeCenter().lat] : globeTour.cam;
  globeTour.scale = globeTourScale(globeTour.radius, globeTour.radius > 0.02);
  globeTour.last = performance.now();
  globeTour.raf = requestAnimationFrame(globeTourStep);
  globeTourUiUpdate();
}
function globeTourStop(){
  if(!globeTour.active) return;
  globeTour.active = false; cancelAnimationFrame(globeTour.raf);
  if(globeTour.bar) globeTour.bar.style.display = 'none';
  globeRedraw();
}

// рисование поверх шара — вызывается из globeDraw
function globeTourDraw(ctx, proj, center, view, k, C){
  const T = globeTour;
  if(!T.active) return;
  const d = T.t * T.total;
  const idx = T.headIdx || 0;
  const done = T.pts.slice(0, idx + 1);
  if(T.head && T.t < 1) done.push(T.head);
  const line = { type: 'LineString', coordinates: done.length > 1 ? done : T.pts.slice(0, 2) };
  // вся поездка — бледным пунктиром, пройденное — ярко, с подложкой
  ctx.setLineDash([3 * k, 4 * k]); ctx.lineWidth = 1.4 * k; ctx.strokeStyle = T.color; ctx.globalAlpha = 0.35;
  ctx.beginPath(); globe.path({ type: 'LineString', coordinates: T.pts }); ctx.stroke();
  ctx.setLineDash([]); ctx.globalAlpha = 1;
  ctx.beginPath(); globe.path(line); ctx.lineWidth = 5.5 * k; ctx.strokeStyle = C.halo; ctx.stroke();
  ctx.beginPath(); globe.path(line); ctx.lineWidth = 2.8 * k; ctx.strokeStyle = T.color; ctx.stroke();
  // остановки: пройденные — с подписью
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const cs = Math.round(Math.min(14, 10 + 1.2 * k));
  ctx.font = `600 ${cs}px 'EB Garamond', serif`;
  const boxes = [];
  // точки — все; подписи — пройденным, начиная с последней, без наложений
  T.stops.forEach(s => {
    if(globeAngle(s.ll, center) > Math.min(view, Math.PI / 2 - 0.02)) return;
    const passed = T.cum[s.idx] <= d + 1e-9;
    const p = proj(s.ll);
    ctx.beginPath(); ctx.arc(p[0], p[1], passed ? 4.2 : 3, 0, 2 * Math.PI);
    ctx.fillStyle = passed ? T.color : C.land; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = C.dot; ctx.stroke();
  });
  T.stops.filter(s => T.cum[s.idx] <= d + 1e-9).reverse().forEach(s => {
    if(globeAngle(s.ll, center) > Math.min(view, Math.PI / 2 - 0.02)) return;
    const p = proj(s.ll), name = globeShortName(s.name), tw = ctx.measureText(name).width;
    const b = [p[0] + 5, p[1] - cs / 2 - 1, p[0] + 9 + tw, p[1] + cs / 2 + 1];
    if(boxes.some(o => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1])) return;
    boxes.push(b);
    ctx.lineWidth = 3; ctx.strokeStyle = C.halo; ctx.strokeText(name, p[0] + 7, p[1]); ctx.fillStyle = C.text; ctx.fillText(name, p[0] + 7, p[1]);
  });
  // «голова» — пульсирующая точка
  if(T.head && T.t < 1 && globeAngle(T.head, center) < Math.PI / 2){
    const p = proj(T.head), pulse = 6 + 3 * Math.sin(performance.now() / 160);
    ctx.beginPath(); ctx.arc(p[0], p[1], pulse, 0, 2 * Math.PI); ctx.fillStyle = T.color; ctx.globalAlpha = 0.25; ctx.fill(); ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(p[0], p[1], 4.5, 0, 2 * Math.PI); ctx.fillStyle = T.color; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
  }
}

// ---------- панель облёта ----------
function globeTourUi(){
  if(!globeTour.bar){
    const b = globeTour.bar = document.createElement('div');
    b.className = 'globe-tour';
    b.innerHTML = '<button type="button" class="gtour-play" data-gtour="play" aria-label="Пауза">⏸</button>' +
      '<div class="gtour-text"><b class="gtour-title"></b><span class="gtour-sub"></span><i class="gtour-bar"><i></i></i></div>' +
      '<button type="button" class="gtour-x" data-gtour="stop" aria-label="Закончить облёт">✕</button>';
    globe.wrap.appendChild(b);
    b.addEventListener('click', e => {
      const a = e.target.closest('[data-gtour]'); if(!a) return;
      if(a.dataset.gtour === 'stop') globeTourStop();
      else if(globeTour.paused) globeTourResume(); else globeTourPause();
    });
    b.addEventListener('pointerdown', e => e.stopPropagation());
  }
  globeTour.bar.style.display = '';
  globeTourUiUpdate();
}
function globeTourUiUpdate(){
  const b = globeTour.bar; if(!b) return;
  const T = globeTour;
  b.querySelector('.gtour-title').textContent = T.title;
  const d = T.t * T.total;
  const passed = T.stops.filter(s => T.cum[s.idx] <= d + 1e-9);
  const cur = passed[passed.length - 1];
  b.querySelector('.gtour-sub').textContent = [T.period, cur ? globeShortName(cur.name) : null, Math.round(d * 6371) + ' км'].filter(Boolean).join(' · ');
  b.querySelector('.gtour-bar > i').style.width = (T.t * 100).toFixed(1) + '%';
  const play = b.querySelector('.gtour-play');
  play.textContent = T.paused ? (T.t >= 1 ? '↻' : '▶') : '⏸';
  play.setAttribute('aria-label', T.paused ? (T.t >= 1 ? 'Повторить' : 'Продолжить') : 'Пауза');
}

// кнопка «Облёт» в карточке маршрута (и на шаре, и на плоской карте) и на странице поездки
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-tour-entry],[data-tour-trip]');
  if(!b) return;
  e.preventDefault();
  let target = null;
  if(b.dataset.tourEntry) target = allEntries.find(x => x.id === b.dataset.tourEntry);
  else target = allEntries.find(x => x.trip === b.dataset.tourTrip && x.type !== 'country') || null;
  if(!target) return;
  map.closePopup();
  const tp = document.getElementById('tripPageModal'); if(tp) tp.style.display = 'none';
  mnavShow('map');
  // выход из шара по «movestart» не должен сработать от закрытия попапа
  setTimeout(() => globeTourStart(target), 0);
});

// ▶ у ползунка лет на шаре: на каждом году шар поворачивается к поездкам этого года
mapRedrawHooks.push(() => {
  if(!globe.active || !timelinePlaying || globeTour.active) return;
  const y = timelineYears[timelineIndex];
  const pts = allEntries.filter(e => e.year === y && e.status !== 'wishlist' && passesFilter(e)).map(e => {
    if(e.type === 'city') return [e.lng, e.lat];
    if(e.type === 'country'){ const g = getCountryGeometry(e.countryKey); if(!g) return null; const p = polyLabelPoint(mainRing(g)); return [p[1], p[0]]; }
    const c = getEntryCoords(e); return c.length ? [c[Math.floor(c.length / 2)][1], c[Math.floor(c.length / 2)][0]] : null;
  }).filter(p => p && isFinite(p[0]) && isFinite(p[1]));
  if(!pts.length) return;
  const c = geoCentroid({ type: 'MultiPoint', coordinates: pts });
  let r = 0; pts.forEach(p => { const d = globeAngle(c, p); if(d > r) r = d; });
  globeFlyTo(c, Math.min(globeTourScale(r, false), globeFitScale() * 2.2), 850);
});

// «Theewaterskloof Local Municipality» → «Theewaterskloof»: геокодер иногда
// отдаёт вместо города район; хвост служебного слова в подписи только мешает
function globeShortName(n){ return cleanPlaceName(n); }
