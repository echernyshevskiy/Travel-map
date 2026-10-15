// ---------- full-screen trip story mode ----------
let storyMap = null;
let storyPathLayer = null;
let storyMarkersLayer = null;
let storyRouteLayers = {}; // entry.id -> L.Polyline of its real track, so route stops show their actual shape
let storyObserver = null;
let storyFlightTimer = null;

function ensureStoryMap(){
  if(storyMap) return storyMap;
  storyMap = L.map('storyMap', {zoomControl:false, attributionControl:false, worldCopyJump:true});
  storyMap.setView([20, 0], 2); // establish a valid view immediately — vector layers/invalidateSize
                                 // throw "Set map center and zoom first" otherwise; fitBounds() below
                                 // overrides this placeholder as soon as real points are known
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:18, referrerPolicy: TILE_REFERRER}).addTo(storyMap);
  return storyMap;
}

function openTripStory(tripName){
  const entries = allEntries.filter(e => e.trip === tripName).sort((a,b) => (a.tripOrder||0) - (b.tripOrder||0));
  if(entries.length === 0) return;

  document.getElementById('storyTitle').textContent = tripName;
  const meta = tripMeta[tripName] || {};
  const feed = document.getElementById('storyFeed');

  let html = '';
  if(meta.narrative){
    html += `<div class="story-intro">${escapeHtml(meta.narrative)}</div>`;
  }
  entries.forEach((e,i)=>{
    const point = getEntryRepresentativePoint(e);
    const photo = (e.photos && e.photos[0]) || null;
    const typeLabel = e.type === 'country' ? 'Страна' : e.type === 'city' ? 'Город' : 'Маршрут';
    const flag = (e.type === 'country' || e.type === 'city') ? countryFlag(e.countryKey) : '';
    html += `
      <div class="story-card" data-entry-id="${e.id}" ${point ? `data-lat="${point[0]}" data-lng="${point[1]}"` : ''}>
        ${photo ? `<img src="${escapeAttr(safeUrl(photo))}" class="story-card-img" loading="lazy" data-photo>` : `<div class="story-card-swatch" style="background:${e.color};"></div>`}
        <div class="story-card-body">
          <div class="story-card-step">Остановка ${i+1} из ${entries.length} · ${typeLabel}</div>
          <h3>${flag ? flag + ' ' : ''}${escapeHtml(e.name)}</h3>
          <div class="story-card-meta">${monthLabel(e.month) ? monthLabel(e.month) + ' ' : ''}${e.year} · ${purposeLabel(e.purpose)}${e.season ? ' · ' + seasonLabel(e.season) : ''}</div>
          ${e.type === 'route' ? `<div class="story-card-meta" style="margin-top:4px;">${e.distanceKm.toFixed(1)} км${e.isEstimated ? ' (по прямой)' : ''}</div>` : ''}
          ${e.notes ? `<p class="story-card-notes">${escapeHtml(e.notes)}</p>` : ''}
          ${e.instagramUrl ? `<a class="ig-badge" href="${escapeAttr(safeUrl(e.instagramUrl))}" target="_blank" rel="noopener">📷 Открыть в Instagram →</a>` : ''}
          ${e.mapLinkUrl ? `<a class="ig-badge" href="${escapeAttr(safeUrl(e.mapLinkUrl))}" target="_blank" rel="noopener">🗺️ Место на карте →</a>` : ''}
          ${e.docLinkUrl ? `<a class="ig-badge" href="${escapeAttr(safeUrl(e.docLinkUrl))}" target="_blank" rel="noopener">📄 Документ →</a>` : ''}
        </div>
      </div>
    `;
  });
  feed.innerHTML = html;
  feed.scrollTop = 0;

  document.getElementById('storyModal').style.display = 'flex';
  ensureStoryMap();

  setTimeout(()=>{
    try{
      storyMap.invalidateSize();
      const points = entries.map(getEntryRepresentativePoint).filter(Boolean);
      if(storyPathLayer){ storyMap.removeLayer(storyPathLayer); storyPathLayer = null; }
      if(storyMarkersLayer){ storyMap.removeLayer(storyMarkersLayer); storyMarkersLayer = null; }
      Object.values(storyRouteLayers).forEach(layer => storyMap.removeLayer(layer));
      storyRouteLayers = {};
      entries.filter(e => e.type === 'route').forEach(e=>{
        const coords = getEntryCoords(e);
        if(coords.length < 2) return;
        storyRouteLayers[e.id] = L.polyline(entryDrawCoords(e), {color: e.color, weight:3, opacity:0.9, dashArray: e.isEstimated ? '8,5' : null}).addTo(storyMap);
      });
      if(points.length){
        storyPathLayer = L.polyline(points, {color:'#A6592E', weight:2, dashArray:'6,7', opacity:0.8}).addTo(storyMap);
        storyMarkersLayer = L.layerGroup(points.map(p =>
          L.circleMarker(p, {radius:5, color:'#2B3B2E', weight:1.5, fillColor:'#A6592E', fillOpacity:1})
        )).addTo(storyMap);
        storyMap.fitBounds(L.latLngBounds(points), {padding:[40,40]});
      }
    }catch(err){
      console.error('story map render failed', err);
    }
  }, 60);

  if(storyObserver) storyObserver.disconnect();
  storyObserver = new IntersectionObserver((observed)=>{
    // a fast scroll/swipe can make the browser report several cards crossing
    // the threshold in one batch — react only to whichever is most visible
    // right now, not whichever happens to be last in that batch, or the
    // camera can appear to "skip" a middle card entirely
    const visible = observed.filter(item => item.isIntersecting);
    if(visible.length === 0) return;
    const item = visible.reduce((best, cur) => cur.intersectionRatio > best.intersectionRatio ? cur : best);
    item.target.parentElement.querySelectorAll('.story-card').forEach(c => c.classList.remove('active'));
    item.target.classList.add('active');
    // debounce: fast scrolling through several cards should settle on the last
    // one before we commit to a flight, instead of stacking several half-finished
    // camera moves on top of each other
    clearTimeout(storyFlightTimer);
    storyFlightTimer = setTimeout(()=>{
      if(!storyMap) return;
      const routeLayer = storyRouteLayers[item.target.dataset.entryId];
      if(routeLayer){
        const bounds = routeLayer.getBounds();
        const dist = storyMap.getCenter().distanceTo(bounds.getCenter());
        const duration = Math.min(2.8, Math.max(1.1, dist / 350000)); // further away = more time for tiles to load
        storyMap.flyToBounds(bounds, {padding:[50,50], duration});
        return;
      }
      const lat = parseFloat(item.target.dataset.lat);
      const lng = parseFloat(item.target.dataset.lng);
      if(!isNaN(lat) && !isNaN(lng)){
        const dist = storyMap.getCenter().distanceTo([lat,lng]);
        const duration = Math.min(2.8, Math.max(1.1, dist / 350000));
        storyMap.flyTo([lat,lng], 10, {duration});
      }
    }, 180);
  }, { root: feed, threshold: 0.55 });
  feed.querySelectorAll('.story-card[data-lat]').forEach(card => storyObserver.observe(card));
}

function closeTripStory(){
  document.getElementById('storyModal').style.display = 'none';
  if(storyObserver){ storyObserver.disconnect(); storyObserver = null; }
  clearTimeout(storyFlightTimer);
}

document.getElementById('closeStoryModal').addEventListener('click', closeTripStory);
document.addEventListener('keydown', (e)=>{
  if(e.key === 'Escape' && document.getElementById('storyModal').style.display !== 'none') closeTripStory();
});

function clearTripCard(){
  const container = document.getElementById('tripCard');
  if(container) container.innerHTML = '';
  clearTripPath();
}

let tripPathLayer = null;

function getEntryRepresentativePoint(entry){
  if(entry.type === 'city') return [entry.lat, entry.lng];
  if(entry.type === 'route'){
    const rc = getEntryCoords(entry);
    return rc[0] ? [rc[0][0], rc[0][1]] : null;
  }
  if(entry.type === 'country'){
    const geom = getCountryGeometry(entry.countryKey);
    if(!geom) return null;
    const ring = geom.type === 'Polygon' ? geom.coordinates[0] : geom.coordinates[0][0];
    let sumLat = 0, sumLng = 0;
    ring.forEach(c => { sumLat += c[1]; sumLng += c[0]; });
    return [sumLat / ring.length, sumLng / ring.length];
  }
  return null;
}

function clearTripPath(){
  if(tripPathLayer){ map.removeLayer(tripPathLayer); tripPathLayer = null; }
}

function focusTrip(tripName){
  const tripEntries = allEntries.filter(e => e.trip === tripName).sort((a,b) => (a.tripOrder||0) - (b.tripOrder||0));
  const tripLayers = tripEntries.filter(e => layers[e.id]).map(e => layers[e.id]);
  if(tripLayers.length === 0) return;
  const group = L.featureGroup(tripLayers);
  map.fitBounds(group.getBounds(), {padding:[50,50]});

  clearTripPath();
  const points = tripEntries.filter(e => e.type !== 'country').map(getEntryRepresentativePoint).filter(Boolean);
  if(points.length >= 2){
    tripPathLayer = L.polyline(points, {color:'#A6592E', weight:2, opacity:0.75, dashArray:'6,7'}).addTo(map);
  }
}

function updateTripDatalist(){
  const dl = document.getElementById('tripDatalist');
  const trips = [...new Set(allEntries.map(e => e.trip).filter(Boolean))];
  dl.innerHTML = trips.map(t => `<option value="${escapeAttr(t)}"></option>`).join('');
}

function passesFilter(entry){
  if(!activeLayerTypes.has(entry.type)) return false;
  if(activeYears.size > 0 && !activeYears.has(entry.year)) return false;
  if(activePurposes.size > 0 && !activePurposes.has(entry.purpose)) return false;
  // Раньше здесь стояла проверка вида `entry.company && ...`: запись без
  // значения проваливалась мимо фильтра и показывалась всегда. Получалось,
  // что «Июль» означало «июль и всё, у чего месяц неизвестен» — и это
  // расходилось с фильтрами года и цели, которые такие записи отбрасывают.
  if(activeCompanies.size > 0 && !activeCompanies.has(entry.company)) return false;
  if(activeCommunities.size > 0 && !activeCommunities.has(entry.community)) return false;
  if(activeSeasons.size > 0 && !activeSeasons.has(entry.season)) return false;
  if(activeMonths.size > 0 && !activeMonths.has(entry.month)) return false;
  // А вот у активности послабление осмысленно и остаётся: проверка ограничена
  // маршрутами, и фильтр «Бег» не должен прятать города — они другого типа.
  if(activeActivities.size > 0 && entry.type === 'route' && entry.activity && !activeActivities.has(entry.activity)) return false;
  if(activeStatuses.size > 0 && !activeStatuses.has(entry.status || 'visited')) return false;
  if(activeTrips.size > 0 && (!entry.trip || !activeTrips.has(entry.trip))) return false;
  if(searchQuery){
    // Ищем ещё и по стране, и по названиям точек маршрута: без этого запрос
    // «Грузия» не находил грузинские города, а «Тбилиси» — маршрут, который
    // через него проходит, хотя в статистике городов такая точка учитывается.
    const parts = [entry.name, entry.trip, entry.notes];
    if(entry.countryKey){
      parts.push(COUNTRY_RU[entry.countryKey] || entry.countryKey, entry.countryKey);
    }
    if(Array.isArray(entry.waypointNames)) parts.push(entry.waypointNames.join(' '));
    if(Array.isArray(entry.waypointCountryKeys)){
      entry.waypointCountryKeys.forEach(k => { if(k) parts.push(COUNTRY_RU[k] || k); });
    }
    const haystack = parts.filter(Boolean).join(' ').toLowerCase();
    if(!haystack.includes(searchQuery)) return false;
  }
  return true;
}

function isEntryOnMap(entry, layer){
  return entry.type === 'city' ? cityCluster.hasLayer(layer) : map.hasLayer(layer);
}
function addEntryLayer(entry, layer){
  if(entry.type === 'city') cityCluster.addLayer(layer); else layer.addTo(map);
}
function removeEntryLayer(entry, layer){
  if(entry.type === 'city') cityCluster.removeLayer(layer); else map.removeLayer(layer);
}

function applyFilters(){
  try{ scheduleMapLabels(); }catch(e){} // набор отметок меняется — пересчитать подписи
  const visible = [];
  allEntries.forEach(entry=>{
    const should = passesFilter(entry);
    if(should) visible.push(entry);
    const layer = layers[entry.id];
    if(!layer) return;
    const has = isEntryOnMap(entry, layer);
    if(should && !has) addEntryLayer(entry, layer);
    if(!should && has) removeEntryLayer(entry, layer);
  });
  applyTimelineOpacity();
  listLimit = LIST_PAGE; // новый набор результатов показываем с первой порции
  tableLimit = LIST_PAGE;
  renderList(visible);
  updateFilteredStats(visible);
  // именно здесь, а не в rebuildAll: клики по чипам фильтров вызывают applyFilters(),
  // полная перерисовка при этом не запускается
  const resetBtn = document.getElementById('resetFiltersBtn');
  if(resetBtn) resetBtn.style.display = anyFilterActive() ? 'block' : 'none';
  updateMnavBadge();
}

