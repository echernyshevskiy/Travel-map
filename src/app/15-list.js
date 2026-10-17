// сбрасывает все фильтры разом — иначе при 4-5 накликанных фильтрах их
// приходится снимать по одному, в разных группах чипов
function anyFilterActive(){
  return activeYears.size || activeMonths.size || activePurposes.size || activeCompanies.size ||
         activeCommunities.size || activeSeasons.size || activeActivities.size ||
         activeStatuses.size || activeTrips.size ||
         activeLayerTypes.size !== 3 || (searchQuery && searchQuery.trim());
}

function resetAllFilters(){
  [activeYears, activeMonths, activePurposes, activeCompanies, activeCommunities,
   activeSeasons, activeActivities, activeStatuses, activeTrips].forEach(s => s.clear());
  activeLayerTypes = new Set(['country','city','route']);
  searchQuery = '';
  const gs = document.getElementById('globalSearch');
  if(gs) gs.value = '';
  const ts = document.getElementById('tableSearchInput');
  if(ts) ts.value = '';
  const cs = document.getElementById('clearSearchBtn');
  if(cs) cs.style.display = 'none';
  clearTripCard();
  updateTripUrlHash();
  rebuildAll();
}

const LIST_PAGE = 100;
let listLimit = LIST_PAGE;

function renderList(precomputedVisible){
  const container = document.getElementById('entryList');
  const visible = (precomputedVisible || allEntries.filter(passesFilter)).slice().sort((a,b)=> b.year - a.year || a.name.localeCompare(b.name));
  const lc = document.getElementById('listSwitchCount');
  if(lc) lc.textContent = visible.length ? String(visible.length) : '';
  if(visible.length === 0){
    // «данных нет вообще» и «фильтры всё отсеяли» — разные ситуации,
    // и подсказка нужна разная: во втором случае с кнопкой сброса
    if(allEntries.length > 0 && anyFilterActive()){
      container.innerHTML = `<div class="empty-state">Под текущие фильтры ничего не попало.<br><button class="cancel-edit" id="emptyResetFiltersBtn" style="margin-top:9px;">Сбросить все фильтры</button></div>`;
      const btn = document.getElementById('emptyResetFiltersBtn');
      if(btn) btn.addEventListener('click', resetAllFilters);
    } else if(allEntries.length === 0){
      container.innerHTML = `<div class="empty-state">${READ_ONLY ? 'В этой карте пока нет отметок.' : 'Пока нет ни одной отметки.<br>Добавьте страну, город или маршрут через форму выше.'}</div>`;
    } else {
      container.innerHTML = `<div class="empty-state">Пока нет отметок под текущий фильтр.</div>`;
    }
    return;
  }
  // Собираем весь список одной строкой и вставляем за один раз: раньше на каждую
  // запись приходился отдельный разбор HTML и по четыре обработчика событий
  // (при 400 записях — 400 разборов и ~1600 обработчиков). Клики теперь
  // обрабатываются делегированием на самом контейнере.
  // Показываем список порциями: при нескольких сотнях записей отрисовка всех
  // строк разом заметно тормозит, а прокрутить их всё равно невозможно
  const shown = visible.slice(0, listLimit);
  // счётчик по годам одним проходом: раньше на каждый заголовок года заново
  // пересматривался весь список видимых записей
  const yearCounts = new Map();
  visible.forEach(e => yearCounts.set(e.year, (yearCounts.get(e.year) || 0) + 1));
  const parts = [];
  let lastYear = null;
  shown.forEach(entry=>{
    if(entry.year !== lastYear){
      lastYear = entry.year;
      parts.push(`<div class="entry-year-head">${entry.year}<span>${yearCounts.get(entry.year) || 0}</span></div>`);
    }
    const extras = [seasonLabel(entry.season), companyLabel(entry.company), communityLabel(entry.community), entry.type === 'route' ? activityLabel(entry.activity) : null].filter(Boolean);
    let meta = `${escapeHtml(whenLabel(entry))} · ${purposeLabel(entry.purpose)}`;
    if(entry.type === 'route'){
      meta += ` · ${entry.distanceKm.toFixed(1)} км${entry.isEstimated ? ' (по прямой)' : ''}`;
      if(entry.elevationGain !== null && entry.elevationGain !== undefined) meta += ` · +${Math.round(entry.elevationGain)}м`;
    }
    if(extras.length) meta += ` · ${extras.join(' · ')}`;
    if(entry.trip) meta += ` · ${escapeHtml(entry.trip)}`;
    if(entry.status === 'wishlist') meta += ` · план`;
    if(entry.hidden && !READ_ONLY) meta += ` · 🔒`;
    const heart = entry.type === 'city' ? entry.favorite : null;
    parts.push(`<div class="entry-row" data-entry-id="${escapeAttr(entry.id)}">
      <div class="dot ${entry.type}" style="background:${entry.color};"></div>
      <div class="entry-main">
        <div class="entry-name" style="${entry.status === 'wishlist' ? 'font-style:italic;' : ''}">${(entry.type === 'country' || entry.type === 'city') && countryFlag(entry.countryKey) ? countryFlag(entry.countryKey) + ' ' : ''}${escapeHtml(entry.name)}</div>
        <div class="entry-meta mono">${meta}</div>
      </div>
      <div class="entry-actions">
        ${(!READ_ONLY && heart !== null) ? `<button title="${heart ? 'Убрать из любимых' : 'В любимые'}" aria-label="${heart ? 'Убрать из любимых' : 'В любимые'}" data-act="fav" style="color:${heart ? '#d9704f' : 'var(--text-dim)'};">${heart ? '❤' : '♡'}</button>` : ''}
        ${(!READ_ONLY && entry.status === 'wishlist') ? `<button title="Отметить как посещённое" aria-label="Отметить как посещённое" data-act="visit" style="color:var(--amber);">✓</button>` : ''}
        ${entry.photos && entry.photos.length ? `<a href="${escapeAttr(safeUrl(entry.photos[0]))}" target="_blank" rel="noopener" title="Фото${entry.photos.length>1 ? ' ('+entry.photos.length+')' : ''}" aria-label="Открыть фото">🖼</a>` : ''}
        ${entry.instagramUrl ? `<a href="${escapeAttr(safeUrl(entry.instagramUrl))}" target="_blank" rel="noopener" title="Instagram" aria-label="Instagram">📷</a>` : ''}
        ${entry.mapLinkUrl ? `<a href="${escapeAttr(safeUrl(entry.mapLinkUrl))}" target="_blank" rel="noopener" title="Место на карте" aria-label="Место на карте">🗺️</a>` : ''}
        ${entry.docLinkUrl ? `<a href="${escapeAttr(safeUrl(entry.docLinkUrl))}" target="_blank" rel="noopener" title="Документ" aria-label="Документ">📄</a>` : ''}
        ${READ_ONLY ? '' : `<button title="Редактировать" aria-label="Редактировать" data-act="edit">✎</button>
        <button title="Удалить" aria-label="Удалить" data-act="del">✕</button>`}
      </div>
    </div>`);
  });
  container.innerHTML = parts.join('');
  if(visible.length > shown.length){
    const rest = visible.length - shown.length;
    container.insertAdjacentHTML('beforeend',
      `<button class="cancel-edit" id="showMoreEntriesBtn" style="margin-top:10px;">Показать ещё ${Math.min(rest, LIST_PAGE)} из ${rest}</button>`);
    const more = document.getElementById('showMoreEntriesBtn');
    if(more) more.addEventListener('click', ()=>{ listLimit += LIST_PAGE; renderList(); });
  }
}

// один обработчик на весь список вместо четырёх на каждую строку
document.getElementById('entryList').addEventListener('click', async (ev)=>{
  const row = ev.target.closest('.entry-row');
  if(!row) return;
  const entry = allEntries.find(e => e.id === row.dataset.entryId);
  if(!entry) return;
  const actEl = ev.target.closest('[data-act]');
  if(!actEl){
    if(ev.target.closest('.entry-main')) focusEntry(entry);
    return;
  }
  ev.stopPropagation();
  const act = actEl.dataset.act;
  if(act === 'visit') await upgradeToVisited(entry.id);
  else if(act === 'fav'){ entry.favorite = !entry.favorite; await saveData(); rebuildAll(); }
  else if(act === 'edit') startEdit(entry);
  else if(act === 'del') deleteEntry(entry.id);
});

let routeAnimLayer = null;
let routeAnimTimer = null;

// Прорисовка маршрута от точки к точке при открытии. Анимируем не сам слой,
// а временную линию поверх него: так исходный маршрут остаётся нетронутым,
// и прерванная анимация не может оставить его в половинчатом виде.
function animateRouteDraw(entry){
  stopRouteAnim();
  const coords = getEntryCoords(entry);
  if(!coords || coords.length < 3) return;
  // на длинных треках рисуем по нескольку точек за кадр, чтобы время было
  // примерно одинаковым независимо от числа точек
  const FRAMES = 46;
  const step = Math.max(1, Math.ceil(coords.length / FRAMES));
  let i = step;
  try{
    routeAnimLayer = L.polyline(coords.slice(0, i), {
      color: entry.color, weight: 5, opacity: 0.95, lineCap: 'round'
    }).addTo(map);
  }catch(e){ routeAnimLayer = null; return; }
  routeAnimTimer = setInterval(()=>{
    i += step;
    if(!routeAnimLayer){ stopRouteAnim(); return; }
    if(i >= coords.length){
      try{ routeAnimLayer.setLatLngs(coords); }catch(e){}
      // короткая пауза на полной линии, затем убираем — под ней настоящий маршрут
      clearInterval(routeAnimTimer); routeAnimTimer = null;
      setTimeout(stopRouteAnim, 260);
      return;
    }
    try{ routeAnimLayer.setLatLngs(coords.slice(0, i)); }catch(e){ stopRouteAnim(); }
  }, 16);
}

function stopRouteAnim(){
  if(routeAnimTimer){ clearInterval(routeAnimTimer); routeAnimTimer = null; }
  if(routeAnimLayer){
    try{ map.removeLayer(routeAnimLayer); }catch(e){}
    routeAnimLayer = null;
  }
}

// Точка для попапа страны: центр рамки, а если он вне страны (Чили, Хорватия) —
// середина самого большого контура или его первая точка
function countryAnchor(key, bounds){
  const geom = getCountryGeometry(key);
  let at = bounds ? bounds.getCenter() : null;
  if(!geom) return at;
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  const ring = polys.reduce((a, p) => p[0].length > a.length ? p[0] : a, polys[0][0]);
  if(!at){
    let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;
    ring.forEach(c => { x0=Math.min(x0,c[0]); x1=Math.max(x1,c[0]); y0=Math.min(y0,c[1]); y1=Math.max(y1,c[1]); });
    at = L.latLng((y0+y1)/2, (x0+x1)/2);
  }
  if(pointInGeometry([at.lat, at.lng], geom)) return at;
  const avg = ring.reduce((m, c) => [m[0] + c[1] / ring.length, m[1] + c[0] / ring.length], [0, 0]);
  return pointInGeometry(avg, geom) ? L.latLng(avg[0], avg[1]) : L.latLng(ring[0][1], ring[0][0]);
}
function countryBounds(key){
  const geom = getCountryGeometry(key);
  if(!geom) return null;
  // у стран через линию перемены дат (Россия, Фиджи) берём самый большой контур
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  const spans = polys.map(p => { const xs = p[0].map(c=>c[0]); return Math.max(...xs) - Math.min(...xs); });
  const all = polys.flatMap(p => p[0]);
  const xs = all.map(c=>c[0]);
  const use = (Math.max(...xs) - Math.min(...xs)) > 300 ? polys[spans.indexOf(Math.max(...spans))][0] : all;
  return L.latLngBounds(use.map(c => [c[1], c[0]]));
}

function focusEntry(entry){
  const layer = layers[entry.id];
  if(!layer) return;
  mnavShow('map'); // на телефоне из списка — сразу к карте
  if(entry.type === 'country' && entry.countryKey){
    // у стран свой попап (поездки, действия), а не привязанный к слою —
    // layer.openPopup() для них ничего не показывал
    map.fitBounds(layer.getBounds(), {padding:[40,40]});
    openCountryPopup(entry.countryKey, countryAnchor(entry.countryKey, layer.getBounds()));
  } else if(entry.type === 'route' || entry.type === 'country'){
    map.fitBounds(layer.getBounds(), {padding:[40,40]});
    layer.openPopup();
    if(entry.type === 'route') animateRouteDraw(entry);
  } else if(typeof cityCluster.zoomToShowLayer === 'function'){
    cityCluster.zoomToShowLayer(layer, () => layer.openPopup());
  } else {
    map.setView(layer.getLatLng(), 8);
    layer.openPopup();
  }
}

function startEdit(entry){
  if(READ_ONLY){ toast('Это read-only версия — редактирование недоступно'); return; }
  editingId = entry.id;
  applyTypeUI(entry.type);
  document.getElementById('typeToggle').classList.add('type-locked');
  // при правке трек не меняется — выбор источника (GPX / по городам) здесь лишний
  document.getElementById('routeSourceBlock').style.display = 'none';
  clearCitySelection(); // иначе может подмешаться то, что искали для другой, более ранней записи в этой же сессии
  clearCountrySelection();
  document.getElementById('fieldName').value = entry.name;
  document.getElementById('fieldYear').value = entry.year;
  document.getElementById('fieldMonth').value = entry.month || '';
  setFormDates(entry.dateFrom, entry.dateTo);
  document.getElementById('fieldPhoto').value = (entry.photos || []).join('\n');
  document.getElementById('fieldInstagram').value = entry.instagramUrl || '';
  document.getElementById('fieldMapLink').value = entry.mapLinkUrl || '';
  document.getElementById('fieldDocLink').value = entry.docLinkUrl || '';
  document.getElementById('fieldNotes').value = entry.notes || '';
  document.getElementById('fieldHidden').checked = !!entry.hidden;
  document.getElementById('fieldTrip').value = entry.trip || '';
  document.getElementById('fieldPurpose').value = entry.purpose || 'tourism';
  document.getElementById('fieldCompany').value = entry.company || 'alone';
  document.getElementById('fieldCommunity').value = entry.community || '';
  updateCommunityVisibility();
  document.getElementById('fieldSeason').value = entry.season || 'summer';
  setFieldColor(entry.color || DEFAULT_COLOR[entry.type]);
  if(entry.type === 'route'){
    document.getElementById('fieldActivity').value = entry.activity || 'hiking';
    document.getElementById('fieldTrackDays').value = entry.trackDays || 1;
    document.getElementById('fieldTerrain').value = entry.terrain || guessTerrain(entry.distanceKm, entry.elevationGain);
    updateHikingDaysVisibility();
    document.getElementById('refreshWaypointsField').style.display = (entry.waypointNames && entry.waypointNames.length) ? 'block' : 'none';
    editWaypointIndex = -1;
    document.getElementById('editWaypointSearch').value = '';
    document.getElementById('editWaypointSuggest').style.display = 'none';
    renderEditWaypoints();
  }
  if(entry.type === 'city'){
    document.getElementById('fieldFavorite').checked = !!entry.favorite;
    document.getElementById('fieldCityCountry').value = entry.countryKey || '';
  }
  if(entry.type !== 'route'){
    currentStatus = entry.status || 'visited';
    document.querySelectorAll('.type-btn[data-status]').forEach(b => b.classList.toggle('active', b.dataset.status === currentStatus));
  }
  document.getElementById('cancelEditBtn').style.display = 'block';
  document.getElementById('saveBtn').textContent = 'Сохранить изменения';
  mnavShow('add');
  toast(entry.type === 'route' && entry.waypointNames && entry.waypointNames.length
    ? 'При замене или удалении точки линия маршрута перестроится'
    : 'Правки не затрагивают геометрию/трек — остальное можно менять');
}

let lastAction = null; // { type:'delete', items:[{entry,index}], tripsToCleanup:Set } | { type:'edit', id, snapshot }

async function deleteEntry(id){
  if(READ_ONLY){ toast('Это read-only версия — удаление недоступно'); return; }
  const entry = allEntries.find(e => e.id === id);
  if(!entry) return;
  // без подтверждения: удаление одной записи сразу отменяемо кнопкой «Отменить»
  // в тосте (7 секунд), системный диалог тут только мешает
  map.closePopup();
  const index = allEntries.findIndex(e => e.id === id);
  const removed = allEntries[index];
  allEntries = allEntries.filter(e => e.id !== id);
  decodedCoordsCache.delete(id);
  lastAction = { type: 'delete', items: [{ entry: removed, index }], tripsToCleanup: removed.trip ? new Set([removed.trip]) : new Set() };
  const saved = await saveData();
  rebuildAll();
  if(saved) showUndoToast(`Удалено: ${removed.name}`);
}

async function upgradeToVisited(id){
  const entry = allEntries.find(e => e.id === id);
  if(!entry || entry.status !== 'wishlist') return;
  entry.status = 'visited';
  const saved = await saveData();
  rebuildAll();
  if(saved) toast(`«${entry.name}» отмечено как посещённое`);
  map.closePopup();
}
// кнопки в карточке отметки на карте (разметка попапа — строкой, см. 10-popups.js)
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-popup-act]');
  if(!b) return;
  if(b.dataset.popupAct === 'upgrade') upgradeToVisited(b.dataset.id);
  else if(b.dataset.popupAct === 'delete') deleteEntry(b.dataset.id);
});

