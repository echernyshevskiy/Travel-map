function buildYearChips(){
  const years = [...new Set(allEntries.map(e=>e.year))].sort((a,b)=>b-a);
  const container = document.getElementById('yearChips');
  container.innerHTML = '';
  const allChip = document.createElement('div');
  allChip.className = 'chip' + (activeYears.size === 0 ? ' active' : '');
  allChip.textContent = 'Все';
  allChip.addEventListener('click', ()=>{
    activeYears.clear();
    buildYearChips();
    applyFilters();
  });
  container.appendChild(allChip);
  years.forEach(y=>{
    const chip = document.createElement('div');
    chip.className = 'chip' + (activeYears.has(y) ? ' active' : '');
    chip.textContent = y;
    chip.addEventListener('click', ()=>{
      if(activeYears.has(y)) activeYears.delete(y); else activeYears.add(y);
      buildYearChips();
      applyFilters();
    });
    container.appendChild(chip);
  });
}

function buildFixedChips(containerId, options, activeSet){
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  const allChip = document.createElement('div');
  allChip.className = 'chip' + (activeSet.size === 0 ? ' active' : '');
  allChip.textContent = 'Все';
  allChip.addEventListener('click', ()=>{
    activeSet.clear();
    buildFixedChips(containerId, options, activeSet);
    applyFilters();
  });
  container.appendChild(allChip);
  options.forEach(o=>{
    const chip = document.createElement('div');
    chip.className = 'chip' + (activeSet.has(o.key) ? ' active' : '');
    chip.textContent = o.ru;
    chip.addEventListener('click', ()=>{
      if(activeSet.has(o.key)) activeSet.delete(o.key); else activeSet.add(o.key);
      buildFixedChips(containerId, options, activeSet);
      applyFilters();
    });
    container.appendChild(chip);
  });
}

// синхронизирует адрес страницы с текущей выбранной поездкой — ровно одна
// активная поездка отражается в #trip=..., иначе (несколько/ни одной) хэш убирается.
// replaceState — чтобы клики по чипам не засоряли историю браузера
function updateTripUrlHash(){
  if(activeTrips.size === 1){
    const tripName = [...activeTrips][0];
    history.replaceState(null, '', '#trip=' + encodeURIComponent(tripName));
  } else if(window.location.hash.startsWith('#trip=')){
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
}

// открытие по прямой ссылке вида #trip=Армения — воспроизводит ровно то же,
// что происходит по клику на чип этой поездки
function applyTripFromUrl(){
  const hash = window.location.hash;
  if(!hash.startsWith('#trip=')) return;
  const tripName = decodeURIComponent(hash.slice(6));
  const exists = allEntries.some(e => e.trip === tripName);
  if(!exists) return;
  activeTrips.clear();
  activeTrips.add(tripName);
  buildTripChips();
  applyFilters();
  focusTrip(tripName);
  renderTripCard(tripName);
  const tripCardEl = document.getElementById('tripCard');
  if(tripCardEl) tripCardEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function buildTripChips(){
  const container = document.getElementById('tripChips');
  const trips = [...new Set(allEntries.map(e => e.trip).filter(Boolean))].sort((a,b) => a.localeCompare(b, 'ru'));
  container.innerHTML = '';
  if(trips.length === 0){
    container.innerHTML = `<div class="hint">Пока нет отметок с тегом «Поездка». Добавьте его в форме при создании записи, чтобы сгруппировать несколько мест в одну поездку.</div>`;
    clearTripCard();
    return;
  }
  const allChip = document.createElement('div');
  allChip.className = 'chip' + (activeTrips.size === 0 ? ' active' : '');
  allChip.textContent = 'Все';
  allChip.addEventListener('click', ()=>{
    activeTrips.clear();
    buildTripChips();
    applyFilters();
    clearTripCard();
    updateTripUrlHash();
  });
  container.appendChild(allChip);
  trips.forEach(tr=>{
    const chip = document.createElement('div');
    chip.className = 'chip' + (activeTrips.has(tr) ? ' active' : '');
    chip.textContent = tr;
    chip.addEventListener('click', ()=>{
      if(activeTrips.has(tr)) activeTrips.delete(tr); else activeTrips.add(tr);
      buildTripChips();
      applyFilters();
      if(activeTrips.size === 1) focusTrip([...activeTrips][0]);
      updateTripUrlHash();
    });
    container.appendChild(chip);
  });
  if(activeTrips.size === 1) renderTripCard([...activeTrips][0]);
  else clearTripCard();
}

function computeTripSummary(tripName){
  const entries = allEntries.filter(e => e.trip === tripName);
  const visited = entries.filter(e => e.status !== 'wishlist');
  const years = [...new Set(visited.map(e => e.year))].sort((a,b) => a-b);
  const countries = new Set(visited.filter(e => e.type === 'country').map(e => e.countryKey)).size;
  const cities = distinctCityKeys(getAllCityVisits(visited)).size;
  const routes = visited.filter(e => e.type === 'route');
  const totalKm = routes.reduce((s,r) => s + r.distanceKm, 0);
  const totalElevation = routes.reduce((s,r) => s + (r.elevationGain || 0), 0);
  const totalDurationMin = routes.reduce((s,r) => s + (r.durationMin || 0), 0);
  const photosCount = visited.reduce((s,e) => s + ((e.photos || []).length), 0);

  const byActivity = {};
  ['hiking','running','cycling','roadtrip'].forEach(act=>{
    const actRoutes = routes.filter(r => r.activity === act);
    if(actRoutes.length === 0) return;
    const km = actRoutes.reduce((s,r) => s + r.distanceKm, 0);
    const durationMin = actRoutes.reduce((s,r) => s + (r.durationMin || 0), 0);
    if(act === 'hiking'){
      const elevation = actRoutes.reduce((s,r) => s + (r.elevationGain || 0), 0);
      const activeDays = actRoutes.reduce((s,r) => s + (r.trackDays || 1), 0); // объединённые многодневные треки считаются по факту дат внутри файла, не по числу файлов
      byActivity.hiking = { totalKm: km, totalDurationMin: durationMin, totalElevation: elevation, activeDays, avgKmPerDay: activeDays ? km / activeDays : 0 };
    } else if(act === 'running'){
      byActivity.running = { totalKm: km, totalDurationMin: durationMin, avgPaceMinPerKm: km > 0 ? durationMin / km : null };
    } else if(act === 'cycling'){
      // у вело важны и километры, и набор высоты — как в хайкинге
      const elevation = actRoutes.reduce((s,r) => s + (r.elevationGain || 0), 0);
      byActivity.cycling = { totalKm: km, totalDurationMin: durationMin, totalElevation: elevation,
        avgSpeedKmh: durationMin > 0 ? km / (durationMin / 60) : null };
    } else if(act === 'roadtrip'){
      byActivity.roadtrip = { totalKm: km, citiesCount: cities };
    }
  });

  return { entries, years, countries, cities, routesCount: routes.length, totalKm, totalElevation, totalDurationMin, photosCount, byActivity };
}

function renderTripCard(tripName){
  const container = document.getElementById('tripCard');
  const s = computeTripSummary(tripName);
  if(s.entries.length === 0){ container.innerHTML = ''; return; }
  const yearsLabel = s.years.length > 1 ? `${s.years[0]}–${s.years[s.years.length-1]}` : `${s.years[0] || ''}`;
  const stats = [];
  if(s.countries > 0) stats.push([`стран`, s.countries]);
  if(s.cities > 0) stats.push([`городов`, s.cities]);
  if(s.routesCount > 0) stats.push([`маршрутов`, s.routesCount]);
  if(s.totalKm > 0) stats.push([`км пройдено`, s.totalKm.toFixed(1)]);
  if(s.totalElevation > 0) stats.push([`набор высоты`, `${Math.round(s.totalElevation)} м`]);
  if(s.totalDurationMin > 0) stats.push([`в движении`, formatDuration(s.totalDurationMin)]);
  if(s.photosCount > 0) stats.push([`фото/видео`, s.photosCount]);

  const meta = tripMeta[tripName] || {};
  const availablePhotos = [];
  s.entries.forEach(e => (e.photos || []).forEach(p => { if(!availablePhotos.includes(p)) availablePhotos.push(p); }));
  const cover = (meta.coverPhoto && availablePhotos.includes(meta.coverPhoto)) ? meta.coverPhoto : availablePhotos[0];

  const orderedEntries = s.entries.filter(e => e.type !== 'country').sort((a,b) => (a.tripOrder||0) - (b.tripOrder||0));

  container.innerHTML = `
    <div class="trip-card">
      <button class="trip-close" title="Закрыть карточку" aria-label="Закрыть карточку">✕</button>
      ${cover ? `<img src="${escapeAttr(safeUrl(cover))}" class="trip-cover" alt="" data-photo>` : ''}
      <h3>${escapeHtml(tripName)}</h3>
      <div class="trip-years">${yearsLabel}</div>
      <button id="openTripPageBtn" class="cancel-edit" style="margin-top:8px;border-color:var(--amber-dim);color:var(--amber);">Страница поездки</button>
      <button id="openStoryBtn" class="cancel-edit" style="margin-top:6px;">📖 История (слайды)</button>
      ${(!READ_ONLY && availablePhotos.length > 1) ? `
        <label class="trip-sublabel">Обложка</label>
        <select id="tripCoverSelect">
          ${availablePhotos.map(p => `<option value="${escapeAttr(p)}" ${p===cover?'selected':''}>${escapeHtml(shortLinkLabel(p))}</option>`).join('')}
        </select>
      ` : ''}
      <div class="trip-stats">
        ${stats.map(([label,val]) => `<div class="trip-stat"><span>${label}</span><b>${val}</b></div>`).join('')}
      </div>
      ${buildActivityBreakdownHtml(s.byActivity)}
      ${READ_ONLY ? (meta.narrative ? `<label class="trip-sublabel">О поездке</label><p style="font-style:italic;font-size:13px;color:var(--text);line-height:1.6;">${escapeHtml(meta.narrative)}</p>` : '') : `
        <label class="trip-sublabel">О поездке</label>
        <textarea id="tripNarrativeInput" placeholder="Пара слов о том, какой была эта поездка…">${escapeHtml(meta.narrative || '')}</textarea>
        <button id="tripNarrativeSave" class="cancel-edit" style="margin-top:6px;">Сохранить описание</button>
      `}
      ${orderedEntries.length > 1 ? `
        <label class="trip-sublabel">Порядок остановок</label>
        <div id="tripOrderList">
          ${orderedEntries.map((e,i) => `
            <div class="waypoint-row" data-id="${e.id}">
              <span class="waypoint-index">${i+1}</span>
              <span class="waypoint-name">${escapeHtml(e.name)}</span>
              ${READ_ONLY ? '' : `<div class="waypoint-actions">
                <button data-act="up" ${i===0 ? 'disabled' : ''} title="Выше" aria-label="Выше">↑</button>
                <button data-act="down" ${i===orderedEntries.length-1 ? 'disabled' : ''} title="Ниже" aria-label="Ниже">↓</button>
              </div>`}
            </div>
          `).join('')}
        </div>
        ${READ_ONLY ? '' : `<div class="hint">Порядок задаёт пунктирную линию пути на карте.</div>`}
      ` : ''}
    </div>
  `;

  container.querySelector('#openStoryBtn').addEventListener('click', ()=> openTripStory(tripName));
  container.querySelector('#openTripPageBtn').addEventListener('click', ()=> openTripPage(tripName));

  container.querySelector('.trip-close').addEventListener('click', ()=>{
    activeTrips.clear();
    buildTripChips();
    applyFilters();
    clearTripCard();
    updateTripUrlHash();
  });

  const coverSelect = container.querySelector('#tripCoverSelect');
  if(coverSelect){
    coverSelect.addEventListener('change', async ()=>{
      if(!tripMeta[tripName]) tripMeta[tripName] = {};
      tripMeta[tripName].coverPhoto = coverSelect.value;
      await saveData();
      renderTripCard(tripName);
    });
  }

  const narrativeSaveBtn = container.querySelector('#tripNarrativeSave');
  if(narrativeSaveBtn){
    narrativeSaveBtn.addEventListener('click', async ()=>{
      const text = container.querySelector('#tripNarrativeInput').value.trim();
      if(!tripMeta[tripName]) tripMeta[tripName] = {};
      tripMeta[tripName].narrative = text;
      const saved = await saveData();
      if(saved) toast('Описание поездки сохранено');
    });
  }

  const orderList = container.querySelector('#tripOrderList');
  if(orderList){
    orderList.querySelectorAll('.waypoint-row').forEach(row=>{
      const entryId = row.dataset.id;
      const upBtn = row.querySelector('[data-act="up"]');
      const downBtn = row.querySelector('[data-act="down"]');
      if(upBtn) upBtn.addEventListener('click', async ()=>{ await moveTripEntry(tripName, entryId, -1); });
      if(downBtn) downBtn.addEventListener('click', async ()=>{ await moveTripEntry(tripName, entryId, 1); });
    });
  }
}

async function moveTripEntry(tripName, entryId, direction){
  const entries = allEntries.filter(e => e.trip === tripName && e.type !== 'country').sort((a,b) => (a.tripOrder||0) - (b.tripOrder||0));
  const idx = entries.findIndex(e => e.id === entryId);
  const swapIdx = idx + direction;
  if(idx === -1 || swapIdx < 0 || swapIdx >= entries.length) return;
  const a = entries[idx], b = entries[swapIdx];
  const tmp = a.tripOrder; a.tripOrder = b.tripOrder; b.tripOrder = tmp;
  await saveData();
  rebuildAll();
  renderTripCard(tripName);
  if(activeTrips.size === 1) focusTrip(tripName);
}

