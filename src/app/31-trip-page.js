// ---------- страница поездки ----------
// Заметки и фотографии привязаны к отдельным записям, а не к поездке целиком —
// поэтому переплетение текста, фото и маршрута получается само: каждая
// остановка работает как глава. Страница осмысленна и без заметок: у любой
// поездки есть порядок городов, страны и цифры.
let tripPageName = null;

function openTripPage(tripName){
  tripPageName = tripName;
  renderTripPage();
  document.getElementById('tripPageModal').style.display = 'flex';
}

// ---------- мини-карты маршрутов на странице поездки ----------
// Раньше маршрут рисовался схемой поверх грубого контура страны — «кракозябра».
// Теперь это настоящая маленькая карта: с сетью — рельеф и подписи OpenTopoMap,
// без сети — подробные границы из borders/ и подписи остановок. Схема остаётся,
// пока карта не загрузилась, и как запасной вариант.
let tripMiniMaps = [];
let tripMiniObserver = null;
function destroyTripMiniMaps(){
  tripMiniMaps.forEach(m => { try{ m.remove(); }catch(e){} });
  tripMiniMaps = [];
  if(tripMiniObserver){ tripMiniObserver.disconnect(); tripMiniObserver = null; }
}
function borderDetailAsync(tier, dk, timeoutMs){
  return new Promise(resolve => {
    const t0 = Date.now();
    const tick = () => {
      const got = borderLatLngs(tier, dk);
      if(got && got[1] === tier) return resolve(got[0]);
      if(Date.now() - t0 > (timeoutMs || 6000)) return resolve(got ? got[0] : null);
      setTimeout(tick, 150);
    };
    tick();
  });
}
function tripMiniOnline(){ return SERVED_OVER_HTTP && navigator.onLine !== false && !tileFallbackDone; }
function buildTripMiniMap(holder, entry, tripCities){
  const coords = entryDrawCoords(entry);
  const flat = getEntryCoords(entry);
  if(!flat || flat.length < 2) return;
  const el = document.createElement('div');
  el.className = 'tp-mini-map';
  holder.appendChild(el);
  const m = L.map(el, { zoomControl: false, attributionControl: true, dragging: false, touchZoom: false, scrollWheelZoom: false,
    doubleClickZoom: false, boxZoom: false, keyboard: false, tap: false, zoomSnap: 0.25, fadeAnimation: false });
  m.attributionControl.setPrefix(false);
  tripMiniMaps.push(m);
  const bounds = L.latLngBounds(flat.map(c => [c[0], c[1]]));
  const color = entry.color || DEFAULT_COLOR.route;
  // подложка
  const usePlain = () => {
    holder.classList.add('plain');
    const base = L.geoJSON(COUNTRIES_GEOJSON, { style: { color: '#B8A98A', weight: 0.8, fillColor: '#EFE7D2', fillOpacity: 1 }, interactive: false }).addTo(m);
    base.bringToBack();
    // подробные границы стран в кадре
    const tier = 'f';
    base.eachLayer(l => {
      const k = l.feature && l.feature.properties && l.feature.properties.name;
      const b = k && borderBBox('c:' + k);
      if(!b || !b.intersects(bounds.pad(0.5))) return;
      borderDetailAsync(tier, 'c:' + k).then(ll => { if(ll && m._loaded) l.setLatLngs(ll); });
    });
  };
  if(tripMiniOnline()){
    let ok = 0, bad = 0, switched = false;
    const tiles = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 17, referrerPolicy: TILE_REFERRER,
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OSM</a>, <a href="https://opentopomap.org" target="_blank" rel="noopener">OpenTopoMap</a>' }).addTo(m);
    tiles.on('tileload', () => { ok++; });
    tiles.on('tileerror', () => { bad++; if(!ok && bad >= 3 && !switched){ switched = true; m.removeLayer(tiles); usePlain(); } });
  } else usePlain();
  // линия маршрута с подложкой-обводкой, чтобы читалась на рельефе
  L.polyline(coords, { color: '#F6F0DE', weight: 6, opacity: 0.85, interactive: false }).addTo(m);
  L.polyline(coords, { color, weight: 3, opacity: 0.95, interactive: false, dashArray: entry.isEstimated ? '7,5' : null }).addTo(m);
  const first = flat[0], last = flat[flat.length - 1];
  L.circleMarker(first, { radius: 4.5, color: '#F6F0DE', weight: 2, fillColor: color, fillOpacity: 1, interactive: false }).addTo(m);
  L.circleMarker(last, { radius: 4.5, color, weight: 2.5, fillColor: '#F6F0DE', fillOpacity: 1, interactive: false }).addTo(m);
  // подписи: остановки маршрута и города этой поездки, попавшие в кадр
  const labels = [];
  const seen = new Set();
  const addLabel = (lat, lng, name) => {
    if(!name || !isFinite(lat) || !isFinite(lng)) return;
    const key = name.trim().toLowerCase();
    if(seen.has(key)) return;
    seen.add(key);
    labels.push([lat, lng, name.trim()]);
  };
  if(Array.isArray(entry.waypointCoords)) entry.waypointCoords.forEach((c, i) => c && addLabel(c[0], c[1], (entry.waypointNames || [])[i]));
  const view = bounds.pad(0.15);
  (tripCities || []).forEach(c => { if(view.contains([c.lat, c.lng])) addLabel(c.lat, c.lng, c.name); });
  m.fitBounds(bounds, { padding: [18, 18], maxZoom: 13 });
  // без тайлов подписей нет — подскажем ближайшие населённые пункты из справочника
  if(holder.classList.contains('plain')){
    const vb = m.getBounds();
    getWorldCities().filter(c => vb.contains([c.lat, c.lng])).sort((a, b) => b.pop - a.pop).slice(0, 4)
      .forEach(c => addLabel(c.lat, c.lng, c.name));
  }
  const many = labels.length > 8;
  const W = m.getSize().x;
  labels.forEach(([lat, lng, name], i) => {
    const mk = L.circleMarker([lat, lng], { radius: 3.2, color: '#2B3B2E', weight: 1.2, fillColor: '#F6F0DE', fillOpacity: 1, interactive: false }).addTo(m);
    // у правого края подпись — слева от точки, чтобы не обрезалась
    const right = m.latLngToContainerPoint([lat, lng]).x > W * 0.62;
    if(!many || i === 0 || i === labels.length - 1 || i % 2 === 0) mk.bindTooltip(escapeHtml(name), { permanent: true, direction: right ? 'left' : 'right', offset: [right ? -5 : 5, 0], className: 'tp-map-label' });
  });
  L.control.scale({ metric: true, imperial: false, position: 'bottomleft', maxWidth: 80 }).addTo(m);
  holder.classList.add('has-map');
  // нажатие — показать маршрут на большой карте
  holder.addEventListener('click', () => {
    document.getElementById('tripPageModal').style.display = 'none';
    destroyTripMiniMaps();
    focusEntry(entry);
  });
}
function setupTripMiniMaps(body, tripEntries){
  const tripCities = tripEntries.filter(e => e.type === 'city' && isFinite(e.lat) && isFinite(e.lng));
  const holders = [...body.querySelectorAll('[data-route-map]')];
  if(!holders.length) return;
  const start = holder => {
    if(holder.__built) return;
    holder.__built = true;
    const entry = allEntries.find(e => e.id === holder.dataset.routeMap);
    if(entry) try{ buildTripMiniMap(holder, entry, tripCities); }catch(err){ console.warn('мини-карта', err); }
  };
  // карты создаём, только когда блок доходит до экрана: в длинной поездке их десятки
  if('IntersectionObserver' in window){
    tripMiniObserver = new IntersectionObserver(items => items.forEach(it => { if(it.isIntersecting){ tripMiniObserver.unobserve(it.target); start(it.target); } }), { rootMargin: '200px 0px' });
    holders.forEach(h => tripMiniObserver.observe(h));
  } else holders.forEach(start);
}

function renderTripPage(){
  destroyTripMiniMaps();
  const tripName = tripPageName;
  const body = document.getElementById('tripPageBody');
  document.getElementById('tripPageTitle').textContent = tripName || 'Поездка';
  if(!tripName){ body.innerHTML = ''; return; }

  const s = computeTripSummary(tripName);
  if(s.entries.length === 0){
    body.innerHTML = `<div class="hint" style="padding:20px;">Записи этой поездки не найдены.</div>`;
    return;
  }
  const meta = tripMeta[tripName] || {};
  const yearsLabel = s.years.length > 1 ? `${s.years[0]}–${s.years[s.years.length-1]}` : `${s.years[0] || ''}`;

  // период по месяцам, если они указаны
  const withMonth = s.entries.filter(e => e.month).sort((a,b)=> (a.year-b.year) || (a.month-b.month));
  let period = yearsLabel;
  if(withMonth.length){
    const f = withMonth[0], l = withMonth[withMonth.length-1];
    period = (f.year === l.year && f.month === l.month)
      ? `${monthLabel(f.month)} ${f.year}`
      : `${monthLabel(f.month)} ${f.year} — ${monthLabel(l.month)} ${l.year}`;
  }

  // страны поездки с флагами
  const keys = [...new Set(s.entries.map(e => e.countryKey).filter(Boolean))];
  const routeKeys = [];
  s.entries.forEach(e => (e.waypointCountryKeys || []).forEach(k => { if(k && !routeKeys.includes(k)) routeKeys.push(k); }));
  const allKeys = [...new Set([...keys, ...routeKeys])];
  const flags = allKeys.map(k => `${countryFlag(k) || ''} ${escapeHtml(COUNTRY_RU[k] || k)}`).join(' · ');

  const photos = [];
  s.entries.forEach(e => (e.photos || []).forEach(p => { if(p && !photos.includes(p)) photos.push(p); }));
  const coverCandidate = (meta.coverPhoto && photos.includes(meta.coverPhoto)) ? meta.coverPhoto : photos.find(p => !photoLinkProblem(p));

  // точные даты, если они есть хотя бы у части записей, — точнее месяцев
  const span = dateSpan(s.entries);
  if(span) period = formatDateRange(span.from, span.to);
  const stats = [];
  if(span && span.days > 1) stats.push([span.days, daysWord(span.days)]);
  if(s.cities > 0) stats.push([s.cities, 'городов']);
  if(s.countries > 0) stats.push([s.countries, 'стран']);
  if(s.routesCount > 0) stats.push([s.routesCount, 'маршрутов']);
  if(s.totalKm > 0) stats.push([s.totalKm.toFixed(0), 'км']);
  if(s.totalElevation > 0) stats.push([Math.round(s.totalElevation).toLocaleString('ru-RU'), 'м набора']);
  if(photos.length) stats.push([photos.length, 'фото']);

  // остановки в заданном порядке — страны исключаем, они не точки маршрута
  const stops = s.entries.filter(e => e.type !== 'country').sort((a,b)=> (a.tripOrder||0) - (b.tripOrder||0));

  const stopsHtml = stops.map((e,i)=>{
    const flag = e.countryKey ? countryFlag(e.countryKey) : '';
    // Обложка поездки берётся из первой пригодной фотографии, и она же
    // показывалась у своей остановки — один снимок дважды на экране.
    // У остановки берём следующий по списку, если первый ушёл в обложку.
    const usable = (e.photos || []).filter(p => p && !photoLinkProblem(p));
    const photo = usable.find(p => p !== coverCandidate) || (usable[0] === coverCandidate ? null : usable[0]);
    const note = (e.notes || '').trim();
    const metaBits = [
      e.type === 'route' ? (activityLabel(e.activity) || 'маршрут') : null,
      (e.type === 'route' && e.distanceKm) ? `${e.distanceKm.toFixed(1)} км` : null,
      whenLabel(e) || null,
      e.countryKey ? (COUNTRY_RU[e.countryKey] || e.countryKey) : null,
    ].filter(Boolean).join(' · ');
    return `<div class="tp-stop">
      <div class="tp-stop-num">${i+1}</div>
      <div class="tp-stop-body">
        <div class="tp-stop-name" data-tp-focus="${escapeAttr(e.id)}">${flag ? flag + ' ' : ''}${escapeHtml(e.name)}</div>
        ${metaBits ? `<div class="tp-stop-meta">${escapeHtml(metaBits)}</div>` : ''}
        ${e.type === 'route' && Array.isArray(e.waypointNames) && e.waypointNames.length
          ? `<div class="tp-stop-via">${e.waypointNames.map(n => escapeHtml(cleanPlaceName(n))).join(' → ')}</div>` : ''}
        ${e.type === 'route' ? `<div class="tp-stop-spark"><div class="tp-route-map" data-route-map="${escapeAttr(e.id)}" title="Показать на большой карте">${buildRouteSparkSvg(e, 300, 110)}</div>${buildElevationSvg(e, 300, 46)}</div>` : ''}
        ${photo ? `<img class="tp-stop-photo" src="${escapeAttr(safeUrl(photo))}" alt="" loading="lazy" data-photo>` : ''}
        ${note ? `<div class="tp-stop-note" ${READ_ONLY ? '' : `data-tp-edit="${escapeAttr(e.id)}" title="Нажмите, чтобы изменить" style="cursor:text;"`}>${escapeHtml(note)}</div>`
               : (READ_ONLY ? '' : `<button class="tp-add-note" data-tp-note="${escapeAttr(e.id)}">+ добавить заметку</button>`)}
      </div>
    </div>`;
  }).join('');

  body.innerHTML = `
    ${coverCandidate ? `<div class="tp-hero"><img class="tp-cover" src="${escapeAttr(safeUrl(coverCandidate))}" alt="" data-photo></div>` : ''}
    <div class="tp-head">
      <div class="tp-title">${escapeHtml(tripName)}</div>
      <div class="tp-period">${escapeHtml(period)}</div>
      ${flags ? `<div class="tp-flags">${flags}</div>` : ''}
      ${stops.length ? `<button type="button" class="cancel-edit tp-tour-btn" data-tour-trip="${escapeAttr(tripName)}">🌍 Облёт на глобусе</button>` : ''}
    </div>
    ${meta.narrative ? `<div class="tp-intro">${escapeHtml(meta.narrative)}</div>` : ''}
    ${stats.length ? `<div class="tp-stats">${stats.map(([v,l]) => `<div class="tp-stat"><b>${v}</b><span>${l}</span></div>`).join('')}</div>` : ''}
    ${stops.length ? `<div class="tp-section">Маршрут · ${stops.length} ${stops.length === 1 ? 'остановка' : (stops.length < 5 ? 'остановки' : 'остановок')}</div>${stopsHtml}` : ''}
  `;

  // клик по названию — показать точку на карте
  body.querySelectorAll('[data-tp-focus]').forEach(el=>{
    el.addEventListener('click', ()=>{
      const entry = allEntries.find(e => e.id === el.dataset.tpFocus);
      if(!entry) return;
      document.getElementById('tripPageModal').style.display = 'none';
      focusEntry(entry);
    });
  });
  // Заметки — топливо этой страницы, поэтому пишем их прямо здесь, не уходя
  // в форму: иначе на каждую остановку приходится открывать запись, править и
  // возвращаться, и до конца поездки обычно не доходишь.
  body.querySelectorAll('[data-tp-note]').forEach(btn=>{
    btn.addEventListener('click', ()=> openInlineNote(btn.dataset.tpNote, btn));
  });
  body.querySelectorAll('[data-tp-edit]').forEach(el=>{
    el.addEventListener('click', ()=> openInlineNote(el.dataset.tpEdit, el));
  });
  setupTripMiniMaps(body, allEntries.filter(e => e.trip === tripName));
}

function openInlineNote(entryId, anchorEl, onDone){
  const entry = allEntries.find(e => e.id === entryId);
  if(!entry || READ_ONLY) return;
  // редактор зовут и со страницы поездки, и из дневника — перерисовывать нужно
  // тот раздел, из которого пришли
  const refresh = onDone || renderTripPage;
  const box = document.createElement('div');
  box.className = 'tp-note-edit';
  box.innerHTML = `
    <textarea placeholder="Что запомнилось в этом месте…">${escapeHtml(entry.notes || '')}</textarea>
    <div class="tp-note-actions">
      <button data-act="save">Сохранить</button>
      <button data-act="cancel">Отмена</button>
    </div>`;
  anchorEl.replaceWith(box);
  const ta = box.querySelector('textarea');
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);

  const close = ()=> refresh();
  box.querySelector('[data-act="cancel"]').addEventListener('click', close);
  box.querySelector('[data-act="save"]').addEventListener('click', async ()=>{
    const val = ta.value.trim();
    if(val === (entry.notes || '').trim()){ close(); return; }
    recordBulkAction('заметку', [entry], ['notes'], []);
    entry.notes = val;
    const saved = await saveData();
    rebuildAll();
    refresh();
    if(saved) showUndoToast(val ? 'Заметка сохранена' : 'Заметка удалена');
  });
  // Ctrl+Enter — быстрое сохранение, чтобы не тянуться к кнопке
  ta.addEventListener('keydown', (ev)=>{
    if((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') box.querySelector('[data-act="save"]').click();
    if(ev.key === 'Escape') close();
  });
}

document.getElementById('closeTripPageModal').addEventListener('click', ()=>{
  document.getElementById('tripPageModal').style.display = 'none';
  destroyTripMiniMaps();
});
document.getElementById('tripPageModal').addEventListener('click', (e)=>{
  if(e.target.id === 'tripPageModal') document.getElementById('tripPageModal').style.display = 'none';
});

function renderChangelog(){
  const list = readChangelog();
  document.getElementById('changelogSummary').textContent = list.length
    ? `Событий: ${list.length}${list.length >= CHANGELOG_MAX ? ` (хранятся последние ${CHANGELOG_MAX})` : ''}`
    : 'Журнал пуст';
  const body = document.getElementById('changelogBody');
  if(list.length === 0){
    body.innerHTML = `<div class="hint">Здесь появятся добавления, правки и удаления записей. Журнал ведётся с момента обновления приложения.</div>`;
    return;
  }
  const actRu = { add: 'добавлено', edit: 'изменено', del: 'удалено' };
  const typeRu = { country: 'страна', city: 'город', route: 'маршрут' };
  let html = '', lastDay = null;
  list.forEach(ev=>{
    const dt = new Date(ev.at);
    const day = dt.toLocaleDateString('ru-RU', { day:'numeric', month:'long', year:'numeric' });
    if(day !== lastDay){ lastDay = day; html += `<div class="cl-day">${escapeHtml(day)}</div>`; }
    const fields = (ev.fields || []).map(f => LOG_FIELD_RU[f] || f).join(', ');
    html += `<div class="cl-row">
      <span class="cl-act ${ev.act}">${actRu[ev.act] || ev.act}</span>
      <span class="cl-name">${escapeHtml(ev.name || '—')}
        <em>${escapeHtml(typeRu[ev.type] || ev.type || '')}${fields ? ' · ' + escapeHtml(fields) : ''}</em>
      </span>
      <span class="cl-time">${dt.toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit' })}</span>
    </div>`;
  });
  body.innerHTML = html;
}

document.getElementById('openChangelogBtn').addEventListener('click', ()=>{
  renderChangelog();
  document.getElementById('changelogModal').style.display = 'flex';
});
document.getElementById('closeChangelogModal').addEventListener('click', ()=>{
  document.getElementById('changelogModal').style.display = 'none';
});
document.getElementById('changelogModal').addEventListener('click', (e)=>{
  if(e.target.id === 'changelogModal') document.getElementById('changelogModal').style.display = 'none';
});

