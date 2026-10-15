// ---------- импорт истории местоположений Google Maps ----------
// Поддерживаем все виды выгрузки: новая с Android (Timeline.json:
// semanticSegments), с iPhone (location-history.json: массив сегментов с
// «geo:» координатами) и старый Google Takeout (Semantic Location History с
// timelineObjects и сырой Records.json). Из точек собираем «стоянки» в городах,
// стоянки вне дома — в поездки, а дальше как при импорте из фото: проверка,
// что уже отмечено, и добавление отмеченного.
const GTL_HOME_KM = 40;          // дом и окрестности не считаем поездкой
const GTL_CITY_KM = 25;          // точка относится к городу из справочника, если до него не дальше
const GTL_TRIP_GAP_H = 48;       // разрыв больше двух суток — новая поездка
let gtlTrips = [];
let gtlShown = 30;
// город из справочника для точки — по сетке 1°, без перебора всех 4,7 тыс. городов
let gtlGrid = null;
function gtlNearestCity(lat, lng, maxKm){
  if(!gtlGrid){
    gtlGrid = new Map();
    getWorldCities().forEach(c => { const k = Math.floor(c.lat) + ':' + Math.floor(c.lng); if(!gtlGrid.has(k)) gtlGrid.set(k, []); gtlGrid.get(k).push(c); });
  }
  let best = null, bestD = maxKm;
  const la = Math.floor(lat), lo = Math.floor(lng);
  for(let i = -1; i <= 1; i++) for(let j = -1; j <= 1; j++){
    (gtlGrid.get((la + i) + ':' + (lo + j)) || []).forEach(c => {
      const d = haversine([lat, lng], [c.lat, c.lng]);
      if(d < bestD){ bestD = d; best = c; }
    });
  }
  return best;
}
function gtlBuildTrips(samples){
  samples.sort((a, b) => a.t - b.t);
  // прореживаем путь: одна точка на 20 минут, стоянки (visit) — все
  const thin = [];
  let lastT = -Infinity;
  samples.forEach(p => { if(p.visit || p.t - lastT >= 20 * 60000){ thin.push(p); lastT = p.t; } });
  const stays = [];
  let cur = null;
  thin.forEach(p => {
    if(haversine([p.lat, p.lng], [HOME_LOCATION.lat, HOME_LOCATION.lng]) <= GTL_HOME_KM){ cur = null; return; }
    const c = gtlNearestCity(p.lat, p.lng, GTL_CITY_KM);
    const key = c ? 'c:' + c.name + ':' + c.lat.toFixed(2) : 'g:' + (Math.round(p.lat * 4) / 4) + ':' + (Math.round(p.lng * 4) / 4);
    if(cur && cur.key === key && p.t - cur.end < 18 * 3600000){
      cur.end = Math.max(cur.end, p.end); cur.n++; if(p.visit) cur.visitMin += (p.end - p.t) / 60000;
      return;
    }
    cur = { key, name: c ? c.name : null, region: c ? c.region : '', lat: c ? c.lat : p.lat, lng: c ? c.lng : p.lng, exact: !!c,
            countryKey: c ? c.countryKey : null, start: p.t, end: p.end, n: 1, visitMin: p.visit ? (p.end - p.t) / 60000 : 0 };
    stays.push(cur);
  });
  // проезд мимо (короче трёх часов без остановки) — не визит
  const kept = stays.filter(s => (s.end - s.start) >= 3 * 3600000 || s.visitMin >= 60);
  kept.forEach(s => { if(!s.countryKey){ const f = findCountryFeature({ lat: s.lat, lng: s.lng }); s.countryKey = f ? f.properties.name : null; } });
  // поездки
  const trips = [];
  let tr = null;
  kept.forEach(s => {
    if(!tr || s.start - tr.to > GTL_TRIP_GAP_H * 3600000){ tr = { from: s.start, to: s.end, places: [] }; trips.push(tr); }
    tr.to = Math.max(tr.to, s.end);
    const same = tr.places.find(p => p.key === s.key);
    if(same){ same.to = Math.max(same.to, s.end); same.hours += (s.end - s.start) / 3600000; }
    else tr.places.push({ key: s.key, name: s.name, region: s.region, lat: s.lat, lng: s.lng, exact: s.exact, countryKey: s.countryKey, from: s.start, to: s.end, hours: (s.end - s.start) / 3600000 });
  });
  return trips.reverse(); // свежие сверху
}
// уже отмечено? Город — рядом (30 км) или с тем же названием в тот же месяц ±1;
// страна — запись страны в том же году
function gtlKnownPlace(p){
  const d = new Date(p.from), y = d.getFullYear(), m = d.getMonth() + 1;
  const near = getAllCityVisits(allEntries.filter(e => e.status !== 'wishlist')).some(v => {
    if(v.year !== y) return false;
    if(v.month && Math.abs(v.month - m) > 1) return false;
    if(v.lat != null && haversine([v.lat, v.lng], [p.lat, p.lng]) <= 30) return true;
    return p.name && normSearch(v.name) === normSearch(p.name);
  });
  return near;
}
function gtlKnownCountry(k, from){
  const y = new Date(from).getFullYear();
  return allEntries.some(e => e.type === 'country' && e.countryKey === k && e.status !== 'wishlist' && e.year === y);
}
const gtlFmtRange = (a, b) => {
  const da = new Date(a), db = new Date(b);
  const o = { day: 'numeric', month: 'short' };
  return da.toDateString() === db.toDateString() ? da.toLocaleDateString('ru-RU', { ...o, year: 'numeric' })
    : da.getFullYear() === db.getFullYear() ? `${da.toLocaleDateString('ru-RU', o)} — ${db.toLocaleDateString('ru-RU', { ...o, year: 'numeric' })}`
    : `${da.toLocaleDateString('ru-RU', { ...o, year: 'numeric' })} — ${db.toLocaleDateString('ru-RU', { ...o, year: 'numeric' })}`;
};
function gtlTripTitle(t){
  const foreign = [...new Set(t.places.map(p => p.countryKey).filter(k => k && k !== HOME_COUNTRY_KEY))];
  const d = new Date(t.from);
  const when = `${monthLabel(d.getMonth() + 1) || ''} ${d.getFullYear()}`.trim();
  if(foreign.length === 1) return `${COUNTRY_RU[foreign[0]] || foreign[0]}, ${when}`;
  const names = t.places.map(p => p.name).filter(Boolean);
  return names.length ? `${names.slice(0, 2).join(' — ')}${names.length > 2 ? ' и др.' : ''}, ${when}` : `Поездка, ${when}`;
}
function renderGtl(){
  const box = document.getElementById('gtlResults');
  const yearSel = document.getElementById('gtlYear');
  const hide = document.getElementById('gtlHideKnown').checked;
  const year = yearSel.value;
  gtlTrips.forEach(t => {
    t.places.forEach(p => { p.known = gtlKnownPlace(p); });
    t.countries = [...new Set(t.places.map(p => p.countryKey).filter(k => k && k !== HOME_COUNTRY_KEY))].map(k => ({ key: k, known: gtlKnownCountry(k, t.from) }));
  });
  let list = gtlTrips.filter(t => year === 'all' || new Date(t.from).getFullYear() === +year);
  if(hide) list = list.filter(t => t.places.some(p => !p.known) || t.countries.some(c => !c.known));
  const total = list.length;
  list = list.slice(0, gtlShown);
  if(!total){ box.innerHTML = `<div class="hint" style="padding:0 20px 20px;">${gtlTrips.length ? 'Всё из этой выборки уже есть на карте.' : 'Поездок вне дома не нашлось.'}</div>`; return; }
  box.innerHTML = list.map(t => {
    const ti = gtlTrips.indexOf(t);
    const rows = [];
    t.countries.forEach((c, ci) => { if(hide && c.known) return;
      rows.push(`<label class="gtl-row${c.known ? ' known' : ''}"><input type="checkbox" data-gtl-c="${ti}:${ci}" ${c.known ? '' : 'checked'}> ${countryFlag(c.key)} <span style="flex:1;">${escapeHtml(COUNTRY_RU[c.key] || c.key)} — страна</span>${c.known ? '<small>уже есть</small>' : ''}</label>`); });
    t.places.forEach((p, pi) => { if(hide && p.known) return;
      rows.push(`<div class="gtl-row${p.known ? ' known' : ''}"><input type="checkbox" data-gtl-p="${ti}:${pi}" ${p.known || !p.name ? '' : 'checked'} aria-label="Добавить">
        <input type="text" data-gtl-name="${ti}:${pi}" value="${escapeAttr(p.name || '')}" placeholder="${p.named ? escapeAttr('впишите название' + (p.hint ? ' (' + p.hint + ')' : '')) : 'определяю место…'}">
        <small>${escapeHtml(gtlFmtRange(p.from, p.to))}${p.known ? ' · уже есть' : ''}</small></div>`); });
    return `<div class="gtl-trip"><div class="gtl-trip-head"><b>${t.countries.map(c => countryFlag(c.key)).join('')} ${escapeHtml(gtlFmtRange(t.from, t.to))}</b>
      <span>мест: ${t.places.length}</span></div>${rows.join('')}
      <label class="gtl-tripname"><input type="checkbox" data-gtl-trip="${ti}" ${t.places.length > 1 ? 'checked' : ''}> поездка
        <input type="text" data-gtl-tripname="${ti}" value="${escapeAttr(t.tripName || gtlTripTitle(t))}"></label></div>`;
  }).join('') + `<div style="padding:4px 20px 20px;">
      ${total > gtlShown ? `<button class="cancel-edit" id="gtlMore" style="margin-top:0;">Показать ещё ${Math.min(30, total - gtlShown)} из ${total - gtlShown}</button>` : ''}
      <button class="cancel-edit" id="gtlApply" style="margin-top:8px;border-color:var(--amber-dim);color:var(--amber);">Добавить отмеченное</button>
      <div class="hint">Города добавятся с месяцем и годом визита, отмеченные «поездка» — объединятся в поездку с этим названием. Всё можно отменить.</div></div>`;
  box.querySelectorAll('[data-gtl-name]').forEach(inp => inp.addEventListener('input', () => {
    const [ti, pi] = inp.dataset.gtlName.split(':').map(Number);
    gtlTrips[ti].places[pi].name = inp.value.trim();
    const cb = box.querySelector(`[data-gtl-p="${ti}:${pi}"]`);
    if(cb && inp.value.trim()) cb.checked = true;
  }));
  box.querySelectorAll('[data-gtl-tripname]').forEach(inp => inp.addEventListener('input', () => { gtlTrips[+inp.dataset.gtlTripname].tripName = inp.value; }));
  const more = document.getElementById('gtlMore');
  if(more) more.addEventListener('click', () => { gtlShown += 30; renderGtl(); gtlNameUnknown(); });
  document.getElementById('gtlApply').addEventListener('click', applyGtl);
}
// названия для мест вне справочника (деревни, нацпарки) — у геокодера, по одному
let gtlNaming = false;
async function gtlNameUnknown(){
  if(gtlNaming) return;
  gtlNaming = true;
  try{
    const year = document.getElementById('gtlYear').value;
    const todo = [];
    gtlTrips.slice().filter(t => year === 'all' || new Date(t.from).getFullYear() === +year).slice(0, gtlShown)
      .forEach(t => t.places.forEach(p => { if(!p.name && !p.named) todo.push(p); }));
    const status = document.getElementById('gtlStatus');
    for(let i = 0; i < todo.length; i++){
      const p = todo[i];
      p.named = true;
      status.textContent = `Определяю названия мест: ${i + 1} из ${todo.length}…`;
      try{
        const r = await reverseGeocode(p.lat, p.lng);
        if(r && r.name){ p.name = r.name; if(r.countryKey) p.countryKey = r.countryKey; }
      }catch(e){}
      if(!p.name){
        // геокодер недоступен — подскажем ближайший город той же страны, но название не подставляем
        const c = gtlNearestCity(p.lat, p.lng, 150);
        if(c && (!p.countryKey || c.countryKey === p.countryKey)) p.hint = `рядом: ${c.name}, ${Math.round(haversine([p.lat, p.lng], [c.lat, c.lng]))} км`;
      }
      if(i % 3 === 2 || i === todo.length - 1) renderGtl();
    }
    status.textContent = gtlSummary;
  }finally{ gtlNaming = false; }
}
let gtlSummary = '';
async function handleGtlFiles(files){
  const status = document.getElementById('gtlStatus');
  const list = Array.from(files || []);
  if(!list.length) return;
  document.getElementById('gtlResults').innerHTML = '';
  gtlTrips = []; gtlShown = 30;
  const bar = document.getElementById('gtlProgress');
  bar.style.display = 'block'; bar.value = 0;
  const samples = [];
  for(let i = 0; i < list.length; i++){
    status.textContent = `Читаю ${list[i].name}${list.length > 1 ? ` (${i + 1} из ${list.length})` : ''}…`;
    await new Promise(r => setTimeout(r, 0));
    try{
      const text = await list[i].text();
      const pts = gtlExtract(JSON.parse(text));
      for(let j = 0; j < pts.length; j++) samples.push(pts[j]);
    }catch(e){
      toast(`Не удалось прочитать ${list[i].name}: это не выгрузка хронологии`);
    }
    bar.value = (i + 1) / list.length * 0.7;
  }
  if(!samples.length){ bar.style.display = 'none'; status.textContent = 'В файле не нашлось точек с координатами и временем. Нужен Timeline.json, location-history.json или файлы из Semantic Location History.'; return; }
  status.textContent = `Точек: ${samples.length.toLocaleString('ru-RU')}. Собираю поездки…`;
  await new Promise(r => setTimeout(r, 0));
  gtlTrips = gtlBuildTrips(samples);
  bar.value = 1;
  setTimeout(() => { bar.style.display = 'none'; }, 800);
  const years = [...new Set(gtlTrips.map(t => new Date(t.from).getFullYear()))].sort((a, b) => b - a);
  const sel = document.getElementById('gtlYear');
  sel.innerHTML = `<option value="all">все годы (${gtlTrips.length})</option>` + years.map(y => `<option value="${y}">${y} (${gtlTrips.filter(t => new Date(t.from).getFullYear() === y).length})</option>`).join('');
  // много лет истории — начинаем с последнего года, чтобы не утонуть в списке
  sel.value = gtlTrips.length > 40 && years.length ? String(years[0]) : 'all';
  document.getElementById('gtlFilters').style.display = gtlTrips.length ? 'flex' : 'none';
  const first = samples.reduce((m, p) => Math.min(m, p.t), Infinity), last = samples.reduce((m, p) => Math.max(m, p.t), 0);
  gtlSummary = `Точек: ${samples.length.toLocaleString('ru-RU')} · ${new Date(first).getFullYear()}–${new Date(last).getFullYear()} · поездок вне дома: ${gtlTrips.length}`;
  status.textContent = gtlSummary;
  renderGtl();
  gtlNameUnknown();
}
async function applyGtl(){
  if(READ_ONLY) return;
  const box = document.getElementById('gtlResults');
  const created = [];
  const base = { photos: [], purpose: 'tourism', status: 'visited', favorite: false };
  gtlTrips.forEach((t, ti) => {
    const tripOn = box.querySelector(`[data-gtl-trip="${ti}"]`);
    const tripName = tripOn && tripOn.checked ? ((t.tripName || gtlTripTitle(t)).trim() || null) : null;
    const note = `Из истории Google Maps: ${gtlFmtRange(t.from, t.to)}`;
    (t.countries || []).forEach((c, ci) => {
      const cb = box.querySelector(`[data-gtl-c="${ti}:${ci}"]`);
      if(!cb || !cb.checked) return;
      const d = new Date(t.from);
      const e = { ...base, id: genId(), type: 'country', name: COUNTRY_RU[c.key] || c.key, countryKey: c.key, year: d.getFullYear(), month: d.getMonth() + 1,
        season: seasonForMonth(d.getMonth() + 1), color: DEFAULT_COLOR.country, notes: note };
      if(tripName){ e.trip = tripName; e.tripOrder = nextTripOrder(tripName); }
      allEntries.push(e); created.push(e.id);
    });
    t.places.forEach((p, pi) => {
      const cb = box.querySelector(`[data-gtl-p="${ti}:${pi}"]`);
      if(!cb || !cb.checked || !p.name) return;
      const d = new Date(p.from);
      const e = { ...base, id: genId(), type: 'city', name: p.name, lat: p.lat, lng: p.lng, countryKey: p.countryKey || null,
        year: d.getFullYear(), month: d.getMonth() + 1, season: seasonForMonth(d.getMonth() + 1), color: DEFAULT_COLOR.city,
        notes: `Из истории Google Maps: ${gtlFmtRange(p.from, p.to)}` };
      if(tripName){ e.trip = tripName; e.tripOrder = nextTripOrder(tripName); }
      allEntries.push(e); created.push(e.id);
    });
  });
  if(!created.length){ toast('Ничего не отмечено'); return; }
  recordBulkAction(`импорт из Google Maps (${created.length})`, null, [], created);
  const saved = await saveData();
  rebuildAll();
  renderGtl();
  if(saved) showUndoToast(`Добавлено из истории Google Maps: ${created.length}`);
}
document.querySelectorAll('[data-imp-tab]').forEach(b => b.addEventListener('click', () => {
  const tab = b.dataset.impTab;
  document.querySelectorAll('[data-imp-tab]').forEach(x => x.setAttribute('aria-selected', String(x === b)));
  document.getElementById('impPhotoPane').style.display = tab === 'photo' ? '' : 'none';
  document.getElementById('impGtlPane').style.display = tab === 'gtl' ? '' : 'none';
}));
document.getElementById('gtlDrop').addEventListener('click', () => document.getElementById('gtlInput').click());
document.getElementById('gtlInput').addEventListener('change', e => { handleGtlFiles(e.target.files); e.target.value = ''; });
document.getElementById('gtlYear').addEventListener('change', () => { gtlShown = 30; renderGtl(); gtlNameUnknown(); });
document.getElementById('gtlHideKnown').addEventListener('change', () => renderGtl());

document.getElementById('openPhotoImportBtn').addEventListener('click', ()=>{
  document.getElementById('photoStatus').textContent = '';
  document.getElementById('photoResults').innerHTML = '';
  photoClusters = [];
  document.getElementById('photoImportModal').style.display = 'flex';
});
document.getElementById('closePhotoImportModal').addEventListener('click', ()=>{
  document.getElementById('photoImportModal').style.display = 'none';
});
document.getElementById('photoImportModal').addEventListener('click', (e)=>{
  if(e.target.id === 'photoImportModal') document.getElementById('photoImportModal').style.display = 'none';
});
document.getElementById('photoDrop').addEventListener('click', ()=> document.getElementById('photoInput').click());
document.getElementById('photoInput').addEventListener('change', (e)=>{
  handlePhotoFiles(e.target.files);
  e.target.value = '';
});

// Правка отдельной точки сохранённого маршрута. Раньше, чтобы исправить один
// неверно определившийся город, приходилось пересоздавать весь маршрут.
let editWaypointIndex = -1;
let editWaypointMatches = [];
let editWaypointTimer = null;

// После замены или удаления точки маршрут «по городам» строится заново:
// по дорогам, а если сервис недоступен — прямыми отрезками. Раньше менялись
// только названия и координаты точек, а линия и километраж оставались старыми.
const WAYPOINT_GEOMETRY_FIELDS = ['waypointNames','waypointCoords','waypointCountryKeys','coordsEncoded','segBreaks','distanceKm','isEstimated','name'];
async function rebuildRouteGeometry(entry, oldNames){
  const pts = (entry.waypointCoords || [])
    .map((c,i) => (c && c[0] != null && c[1] != null) ? { lat: c[0], lng: c[1], name: entry.waypointNames[i] } : null)
    .filter(Boolean);
  if(pts.length < 2) return { rebuilt: false };
  toast('Перестраиваю маршрут…');
  const road = await fetchRoadRoute(pts);
  const coords = road ? road.coords : pts.map(p => [p.lat, p.lng]);
  entry.coordsEncoded = encodePolyline(coords);
  delete entry.segBreaks; // маршрут по городам — одна линия
  entry.distanceKm = road ? road.distanceKm : trackDistanceKm(coords);
  entry.isEstimated = !road;
  // автоназвание «Первый — Последний» следует за сменой конечных точек,
  // написанное вручную название не трогаем
  const names = entry.waypointNames;
  if(oldNames && oldNames.length && entry.name === `${oldNames[0]} — ${oldNames[oldNames.length-1]}`){
    entry.name = `${names[0]} — ${names[names.length-1]}`;
  }
  return { rebuilt: true, estimated: !road };
}
// поле «Название» в форме правки должно показывать новое автоназвание,
// иначе кнопка «Сохранить изменения» вернула бы старое
function syncEditNameField(entry){
  if(editingId === entry.id) document.getElementById('fieldName').value = entry.name;
}
function geometryToastSuffix(res){
  if(!res.rebuilt) return '';
  return res.estimated ? ' · линия по прямой: сервис дорог недоступен' : ' · маршрут перестроен по дорогам';
}

function renderEditWaypoints(){
  const field = document.getElementById('editWaypointsField');
  const list = document.getElementById('editWaypointsList');
  const entry = allEntries.find(e => e.id === editingId);
  if(!entry || entry.type !== 'route' || !entry.waypointNames || entry.waypointNames.length === 0){
    field.style.display = 'none';
    return;
  }
  field.style.display = 'block';
  list.innerHTML = entry.waypointNames.map((name,i)=>{
    const c = entry.waypointCoords && entry.waypointCoords[i];
    const key = entry.waypointCountryKeys && entry.waypointCountryKeys[i];
    const flag = key ? countryFlag(key) : '';
    const coordText = (c && c[0] != null) ? `${c[0].toFixed(2)}, ${c[1].toFixed(2)}` : 'координат нет';
    return `<div class="waypoint-row${i === editWaypointIndex ? ' wp-editing' : ''}">
      <span class="waypoint-index">${i+1}</span>
      <span class="waypoint-name">${flag ? flag + ' ' : ''}${escapeHtml(name)}
        <span style="display:block;font-family:'Twemoji Country Flags','Courier Prime',monospace;font-size:9px;color:var(--text-dim);">${coordText}</span>
      </span>
      <div class="waypoint-actions">
        <button data-wp-edit="${i}" title="Заменить точку" aria-label="Заменить точку">✎</button>
        <button data-wp-del="${i}" title="Убрать точку" aria-label="Убрать точку">✕</button>
      </div>
    </div>`;
  }).join('');

  list.querySelectorAll('[data-wp-edit]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const i = parseInt(btn.dataset.wpEdit, 10);
      editWaypointIndex = editWaypointIndex === i ? -1 : i;
      renderEditWaypoints();
      const search = document.getElementById('editWaypointSearch');
      if(editWaypointIndex >= 0){
        search.value = entry.waypointNames[editWaypointIndex];
        search.focus();
      } else {
        search.value = '';
        document.getElementById('editWaypointSuggest').style.display = 'none';
      }
    });
  });
  list.querySelectorAll('[data-wp-del]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const i = parseInt(btn.dataset.wpDel, 10);
      if(entry.waypointNames.length <= 2){ toast('В маршруте должно остаться хотя бы две точки'); return; }
      recordBulkAction('удаление точки маршрута', [entry], WAYPOINT_GEOMETRY_FIELDS, []);
      const oldNames = entry.waypointNames.slice();
      entry.waypointNames = entry.waypointNames.filter((_,j) => j !== i);
      if(entry.waypointCoords) entry.waypointCoords = entry.waypointCoords.filter((_,j) => j !== i);
      if(entry.waypointCountryKeys) entry.waypointCountryKeys = entry.waypointCountryKeys.filter((_,j) => j !== i);
      editWaypointIndex = -1;
      const geo = await rebuildRouteGeometry(entry, oldNames);
      const saved = await saveData();
      rebuildAll();
      renderEditWaypoints();
      syncEditNameField(entry);
      if(saved) showUndoToast('Точка удалена' + geometryToastSuffix(geo));
    });
  });
}

function renderEditWaypointSuggest(){
  const box = document.getElementById('editWaypointSuggest');
  if(editWaypointMatches.length === 0){
    box.innerHTML = `<div class="suggest-empty">Ничего не найдено</div>`;
    box.style.display = 'block';
    return;
  }
  box.innerHTML = editWaypointMatches.map((m,i) => `<div class="suggest-item" data-wp-pick="${i}">${escapeHtml(m.full)}</div>`).join('');
  box.style.display = 'block';
  box.querySelectorAll('[data-wp-pick]').forEach(el=>{
    el.addEventListener('click', async ()=>{
      const m = editWaypointMatches[parseInt(el.dataset.wpPick, 10)];
      const entry = allEntries.find(e => e.id === editingId);
      if(!entry || editWaypointIndex < 0) return;
      recordBulkAction('замену точки маршрута', [entry], WAYPOINT_GEOMETRY_FIELDS, []);
      const oldNames = entry.waypointNames.slice();
      // массивы координат и стран могли не существовать у старых маршрутов
      if(!Array.isArray(entry.waypointCoords)) entry.waypointCoords = entry.waypointNames.map(()=> null);
      if(!Array.isArray(entry.waypointCountryKeys)) entry.waypointCountryKeys = entry.waypointNames.map(()=> null);
      entry.waypointNames = entry.waypointNames.slice();
      entry.waypointCoords = entry.waypointCoords.slice();
      entry.waypointCountryKeys = entry.waypointCountryKeys.slice();
      entry.waypointNames[editWaypointIndex] = m.name;
      entry.waypointCoords[editWaypointIndex] = [m.lat, m.lng];
      entry.waypointCountryKeys[editWaypointIndex] = m.countryKey || findAnyCountryKeyByRuName(m.country, m.countryCode);
      editWaypointIndex = -1;
      editWaypointMatches = [];
      document.getElementById('editWaypointSearch').value = '';
      box.style.display = 'none';
      const geo = await rebuildRouteGeometry(entry, oldNames);
      const saved = await saveData();
      rebuildAll();
      renderEditWaypoints();
      syncEditNameField(entry);
      if(saved) showUndoToast(`Точка заменена на «${m.name}»` + geometryToastSuffix(geo));
    });
  });
}

document.getElementById('editWaypointSearch').addEventListener('input', (e)=>{
  const q = e.target.value.trim();
  const box = document.getElementById('editWaypointSuggest');
  if(editWaypointIndex < 0){ toast('Сначала выберите точку кнопкой ✎'); box.style.display = 'none'; return; }
  clearTimeout(editWaypointTimer);
  if(q.length < 2){ box.style.display = 'none'; return; }
  editWaypointTimer = setTimeout(async ()=>{
    try{
      // смещаем поиск к соседним точкам маршрута — как при создании,
      // чтобы не подхватить одноимённый город на другом континенте
      const entry = allEntries.find(x => x.id === editingId);
      let bias = null;
      if(entry && Array.isArray(entry.waypointCoords)){
        const near = entry.waypointCoords.find((c,j) => c && c[0] != null && j !== editWaypointIndex);
        if(near) bias = near;
      }
      const seq = ++suggestSeq.waypoint;
      const quick = localCitySearch(q, 8, bias).map(cityAsMatch);
      if(quick.length){ editWaypointMatches = quick; renderEditWaypointSuggest(); }
      const res = await queryNominatimSettlements(q, bias).catch(err => { if(quick.length) return []; throw err; });
      if(seq !== suggestSeq.waypoint) return;
      editWaypointMatches = mergeSettlementMatches(res, quick);
      renderEditWaypointSuggest();
      clearServiceIssue('поиск городов');
    }catch(err){
      box.innerHTML = `<div class="suggest-empty">Нет соединения — попробуйте позже</div>`;
      box.style.display = 'block';
      reportServiceIssue('поиск городов');
    }
  }, 350);
});

// выпадающее меню «Итоги»
(function setupSummaryMenu(){
  const btn = document.getElementById('openSummaryMenu');
  const menu = document.getElementById('summaryMenu');
  if(!btn || !menu) return;
  let backdrop = null;
  const removeBackdrop = ()=>{ if(backdrop){ backdrop.remove(); backdrop = null; } };
  const close = ()=>{
    menu.style.display = 'none';
    btn.setAttribute('aria-expanded','false');
    removeBackdrop();
  };
  const open = ()=>{
    menu.style.display = 'block';
    btn.setAttribute('aria-expanded','true');
    // на телефоне меню показывается снизу экрана — затемнение делает понятным,
    // что это слой поверх интерфейса и куда нажать, чтобы закрыть
    const narrow = window.matchMedia && window.matchMedia('(max-width:768px)').matches;
    if(narrow && !backdrop){
      backdrop = document.createElement('div');
      backdrop.className = 'header-menu-backdrop';
      backdrop.addEventListener('click', close);
      document.body.appendChild(backdrop);
    }
  };
  btn.addEventListener('click', (e)=>{
    e.stopPropagation();
    if(menu.style.display === 'none') open(); else close();
  });
  // пункт выбран или клик мимо — закрываем
  menu.addEventListener('click', close);
  document.addEventListener('click', (e)=>{ if(!menu.contains(e.target) && e.target !== btn) close(); });
  document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape') close(); });
})();

