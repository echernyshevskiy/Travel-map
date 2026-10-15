// ---------- timeline ----------
let timelineInitialized = false;
function updateTimelineRange(){
  timelineYears = [...new Set(allEntries.map(e => e.year))].sort((a,b) => a-b);
  const bar = document.getElementById('timelineBar');
  const slider = document.getElementById('timelineSlider');
  if(timelineYears.length === 0){
    bar.style.display = 'none';
    return;
  }
  bar.style.display = 'flex';
  slider.max = Math.max(timelineYears.length - 1, 0);
  if(!timelineInitialized){
    timelineIndex = timelineYears.length - 1;
    timelineInitialized = true;
  } else {
    if(timelineIndex >= timelineYears.length) timelineIndex = timelineYears.length - 1;
    if(timelineIndex < 0) timelineIndex = 0;
  }
  slider.value = timelineIndex;
  updateTimelineLabel();
}

function updateTimelineLabel(){
  const y = timelineYears[timelineIndex];
  document.getElementById('timelineYearLabel').textContent = y !== undefined ? y : '—';
}

function timelineTargetStyle(entry, included){
  if(entry.type === 'route'){
    return { opacity: included ? 0.85 : 0 };
  }
  if(entry.type === 'country'){
    const isWishlist = entry.status === 'wishlist';
    return isWishlist
      ? { opacity: included ? 1 : 0 }
      : { opacity: included ? 1 : 0, fillOpacity: included ? (entry.type === 'country' ? countryFillOpacity(entry.countryKey) : 0.35) : 0 };
  }
  return null;
}

function applyTimelineOpacity(){
  const currentYear = timelineYears[timelineIndex];
  if(currentYear === undefined) return;
  allEntries.forEach(entry=>{
    const layer = layers[entry.id];
    if(!layer) return;
    const included = timelineMode === 'cumulative' ? entry.year <= currentYear : entry.year === currentYear;
    if(entry.type === 'city'){
      // маркеры городов сгруппированы в кластеры — .setOpacity() на отдельном
      // маркере кластер игнорирует (сам кружок с числом не меняется), поэтому
      // временная невидимость реализована через добавление/удаление из кластера.
      // Пересчитывается заново из фильтров+таймлайна каждый раз — не зависит
      // от того, был ли город спрятан раньше, поэтому корректно работает
      // при перемотке в обе стороны.
      const shouldShow = passesFilter(entry) && included;
      const onMap = cityCluster.hasLayer(layer);
      if(shouldShow && !onMap) cityCluster.addLayer(layer);
      else if(!shouldShow && onMap) cityCluster.removeLayer(layer);
    } else {
      if(!map.hasLayer(layer)) return;
      const style = timelineTargetStyle(entry, included);
      if(style) layer.setStyle(style);
    }
  });
  try{ updateRouteStops(); }catch(err){ console.warn('остановки маршрутов', err); }
}

function updateRouteStops(){
  routeStopsLayer.clearLayers();
  const currentYear = timelineYears[timelineIndex];
  const inc = e => currentYear === undefined ? true : (timelineMode === 'cumulative' ? e.year <= currentYear : e.year === currentYear);
  const shown = allEntries.filter(e => inc(e) && passesFilter(e));
  // если у города есть своя отметка — точку остановки не дублируем
  const own = new Set(shown.filter(e => e.type === 'city').map(e => (e.name || '').trim().toLowerCase()));
  const seen = new Set();
  shown.forEach(e => {
    if(e.type !== 'route' || !Array.isArray(e.waypointCoords) || !Array.isArray(e.waypointNames)) return;
    const layer = layers[e.id];
    if(!layer || !map.hasLayer(layer)) return;
    e.waypointCoords.forEach((c, i) => {
      const name = (e.waypointNames[i] || '').trim();
      if(!c || !name || !isFinite(c[0]) || !isFinite(c[1])) return;
      const key = name.toLowerCase();
      if(own.has(key)) return;
      const pk = key + '|' + c[0].toFixed(2) + ',' + c[1].toFixed(2);
      if(seen.has(pk)) return;
      seen.add(pk);
      L.circleMarker(c, { pane: 'routePane', renderer: routeRenderer, radius: 4.5, color: '#2B3B2E', weight: 1.5, fillColor: e.color || DEFAULT_COLOR.route, fillOpacity: 1 })
        .bindTooltip(`${escapeHtml(name)} <span style="opacity:.7;">· ${escapeHtml(e.name)}</span>`, { direction: 'top', offset: [0, -4] })
        .on('click', ev => {
          L.DomEvent.stopPropagation(ev);
          if(placingCity || placingCountry || quizMapActive()){ handleMapClick(ev); return; }
          layer.openPopup(ev.latlng);
        })
        .addTo(routeStopsLayer);
    });
  });
}

const debouncedTimelineOpacity = debounce(applyTimelineOpacity, 40);
document.getElementById('timelineSlider').addEventListener('input', (e)=>{
  timelineIndex = parseInt(e.target.value);
  updateTimelineLabel();
  debouncedTimelineOpacity();
});

document.getElementById('timelineModeBtn').addEventListener('click', ()=>{
  timelineMode = timelineMode === 'cumulative' ? 'single' : 'cumulative';
  document.getElementById('timelineModeBtn').textContent = timelineMode === 'cumulative' ? 'Накопительно' : 'Только этот год';
  applyTimelineOpacity();
});

document.getElementById('timelinePlayBtn').addEventListener('click', ()=>{
  if(timelinePlaying) stopTimelinePlay(); else startTimelinePlay();
});

function startTimelinePlay(){
  if(timelineYears.length <= 1) return;
  if(timelineIndex >= timelineYears.length - 1) timelineIndex = 0;
  timelinePlaying = true;
  document.getElementById('timelinePlayBtn').textContent = '⏸';
  timelineTimer = setInterval(()=>{
    timelineIndex++;
    if(timelineIndex >= timelineYears.length){
      timelineIndex = timelineYears.length - 1;
      stopTimelinePlay();
      return;
    }
    document.getElementById('timelineSlider').value = timelineIndex;
    updateTimelineLabel();
    applyTimelineOpacity();
  }, 1100);
}

function stopTimelinePlay(){
  timelinePlaying = false;
  clearInterval(timelineTimer);
  document.getElementById('timelinePlayBtn').textContent = '▶';
}

