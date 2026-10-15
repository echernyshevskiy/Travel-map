// ---------- GPX upload ----------
document.getElementById('fileDrop').addEventListener('click', ()=>{
  document.getElementById('gpxInput').click();
});
document.getElementById('gpxInput').addEventListener('change', (e)=>{
  const files = Array.from(e.target.files || []);
  if(files.length === 0) return;
  pendingGpxList = [];
  let failed = [];
  let processed = 0;

  function finishFile(result){
    processed++;
    if(result) pendingGpxList.push(result);
    else failed.push(result);
    if(processed === files.length) updateFileDropSummary(failed.length);
  }

  files.forEach(file=>{
    const reader = new FileReader();
    reader.onload = (ev)=>{
      try{
        const parsed = parseGPX(ev.target.result);
        if(parsed.coords.length < 2){ finishFile(null, file.name); return; }
        const distanceKm = gpxDistanceKm(parsed);
        const elevationGain = gpxElevationGain(parsed);
        const maxElevation = parsed.elevations.length > 0 ? Math.max(...parsed.elevations) : null;
        const durationMin = parsed.times.length > 1 ? (parsed.times[parsed.times.length-1] - parsed.times[0]) / 60000 : null;
        const profile = parsed.elevations.length > 1 ? downsampleNumeric(parsed.elevations, 40) : null;
        const ds = parsed.segments.length > 1
          ? downsampleSegments(parsed.segments.map(g => g.coords), 800)
          : { coords: downsample(parsed.coords), breaks: [] };
        const coords = ds.coords;
        const baseName = file.name.replace(/\.gpx$/i, '');
        // Дата старта — по местному времени МЕСТА, а не устройства.
        // В GPX время записано в UTC. Раньше оно переводилось в пояс телефона,
        // и трек, начатый поздним вечером в другой стране, мог записаться
        // следующим днём — а помните вы его тем вечером. Часовой пояс берём
        // из долготы первой точки: 15° долготы ≈ один час. Это приближение,
        // но ошибается максимум на час, тогда как пояс устройства — на сутки.
        let startYear = null, startMonth = null;
        if(parsed.times.length > 0){
          const t = new Date(parsed.times[0]);
          if(!isNaN(t.getTime())){
            const lng = parsed.coords.length ? parsed.coords[0][1] : null;
            const offsetH = (lng !== null && isFinite(lng)) ? Math.round(lng / 15) : 0;
            const local = new Date(t.getTime() + offsetH * 3600000);
            startYear = local.getUTCFullYear();
            startMonth = local.getUTCMonth() + 1;
          }
        }
        const trackDaysInfo = countDistinctDays(parsed.times); // объединённый в один файл многодневный поход — не один день, а столько, сколько разных календарных дат встретилось в самом треке; если меток времени вовсе нет (например, файлы из планировщиков маршрутов вроде The Ride Atlas), auto-детект бессмысленен — тогда используется ручное поле «Число дней»
        finishFile({ coords, segBreaks: ds.breaks, distanceKm, fileName: file.name, baseName, elevationGain, maxElevation, durationMin, profile, startYear, startMonth, trackDays: trackDaysInfo.days, hasTimeData: trackDaysInfo.hasTimeData });
      }catch(err){
        finishFile(null);
      }
    };
    reader.onerror = () => finishFile(null);
    reader.readAsText(file);
  });
});

function updateFileDropSummary(failedCount){
  const drop = document.getElementById('fileDrop');
  if(pendingGpxList.length === 0){
    drop.textContent = 'Не удалось прочитать выбранные файлы';
    drop.classList.remove('has-file');
    return;
  }
  const totalKm = pendingGpxList.reduce((s,g) => s + g.distanceKm, 0);
  const totalElevation = pendingGpxList.reduce((s,g) => s + (g.elevationGain || 0), 0);
  let summary = pendingGpxList.length === 1
    ? `${pendingGpxList[0].fileName} — ${pendingGpxList[0].distanceKm.toFixed(1)} км`
    : `${pendingGpxList.length} файлов — суммарно ${totalKm.toFixed(1)} км`;
  if(totalElevation > 0) summary += `, +${Math.round(totalElevation)} м`;
  if(failedCount > 0) summary += ` (${failedCount} не удалось прочитать)`;
  drop.textContent = summary;
  drop.classList.add('has-file');

  // если у загруженных треков есть собственная дата и она у всех одна и та же —
  // отражаем это в самой форме (месяц/сезон/год), а не только в сохраняемых данных,
  // иначе на экране остаётся то, что было выставлено раньше вручную
  const detectedMonths = pendingGpxList.map(g => g.startMonth).filter(Boolean);
  const detectedYears = pendingGpxList.map(g => g.startYear).filter(Boolean);
  // покрытие подставляем по суммарному набору высоты загруженных треков
  const totKm = pendingGpxList.reduce((s,g) => s + (g.distanceKm || 0), 0);
  const totGain = pendingGpxList.reduce((s,g) => s + (g.elevationGain || 0), 0);
  const tSel = document.getElementById('fieldTerrain');
  if(tSel && totKm > 0) tSel.value = guessTerrain(totKm, totGain);
  if(detectedMonths.length > 0 && detectedMonths.every(m => m === detectedMonths[0])){
    document.getElementById('fieldMonth').value = detectedMonths[0];
    const season = seasonForMonth(detectedMonths[0]);
    if(season) document.getElementById('fieldSeason').value = season;
  }
  if(detectedYears.length > 0 && detectedYears.every(y => y === detectedYears[0])){
    document.getElementById('fieldYear').value = detectedYears[0];
  }
}

function formatDuration(min){
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h} ч ${m} мин` : `${m} мин`;
}

function buildActivityBreakdownHtml(byActivity){
  const blocks = [];
  if(byActivity.hiking){
    const h = byActivity.hiking;
    const rows = [
      ['пройдено', `${h.totalKm.toFixed(1)} км`],
      h.totalDurationMin > 0 ? ['время в пути', formatDuration(h.totalDurationMin)] : null,
      h.totalElevation > 0 ? ['набор высоты', `${Math.round(h.totalElevation)} м`] : null,
      ['активных дней', h.activeDays],
      ['в среднем за день', `${h.avgKmPerDay.toFixed(1)} км`],
    ].filter(Boolean);
    blocks.push({ icon: '🥾', title: 'Хайкинг', rows });
  }
  if(byActivity.running){
    const r = byActivity.running;
    const pace = formatPace(r.avgPaceMinPerKm);
    const rows = [
      ['пройдено', `${r.totalKm.toFixed(1)} км`],
      r.totalDurationMin > 0 ? ['время', formatDuration(r.totalDurationMin)] : null,
      pace ? ['средний темп', pace] : null,
    ].filter(Boolean);
    blocks.push({ icon: '🏃', title: 'Бег', rows });
  }
  if(byActivity.roadtrip){
    const rt = byActivity.roadtrip;
    const rows = [
      ['пройдено', `${rt.totalKm.toFixed(1)} км`],
      rt.citiesCount > 0 ? ['городов посещено', rt.citiesCount] : null,
    ].filter(Boolean);
    blocks.push({ icon: '🚗', title: 'Автотрип', rows });
  }
  if(blocks.length === 0) return '';
  return blocks.map(b => `
    <div class="activity-breakdown">
      <div class="activity-breakdown-title">${b.icon} ${b.title}</div>
      ${b.rows.map(([label,val]) => `<div class="trip-stat"><span>${label}</span><b>${val}</b></div>`).join('')}
    </div>
  `).join('');
}

// ---------- save ----------
document.getElementById('fieldYear').value = new Date().getFullYear();

document.getElementById('fieldActivity').addEventListener('change', updateHikingDaysVisibility);
// баннер «отметить страну» теперь зависит от года — при его смене пересчитываем,
// иначе на экране осталось бы предложение, относящееся к прежнему году
document.getElementById('fieldYear').addEventListener('input', ()=>{
  try{ renderCityCountrySuggest(); }catch(e){}
});
document.getElementById('fieldCompany').addEventListener('change', updateCommunityVisibility);

document.getElementById('fieldMonth').addEventListener('change', ()=>{
  const month = parseInt(document.getElementById('fieldMonth').value);
  const season = seasonForMonth(month);
  if(season) document.getElementById('fieldSeason').value = season;
});

document.getElementById('saveBtn').addEventListener('click', async ()=>{
  if(READ_ONLY){ toast('Это read-only версия — редактирование недоступно'); return; }
  const name = document.getElementById('fieldName').value.trim();
  const year = parseInt(document.getElementById('fieldYear').value) || new Date().getFullYear();
  const month = parseInt(document.getElementById('fieldMonth').value) || undefined;
  const photos = document.getElementById('fieldPhoto').value.split('\n').map(s => normalizePhotoUrl(s.trim())).filter(Boolean);
  const instagramUrl = document.getElementById('fieldInstagram').value.trim();
  const mapLinkUrl = document.getElementById('fieldMapLink').value.trim();
  const docLinkUrl = document.getElementById('fieldDocLink').value.trim();
  const notes = document.getElementById('fieldNotes').value.trim();
  const hideFromFriends = document.getElementById('fieldHidden').checked;
  const entriesBefore = allEntries.length;
  const purpose = document.getElementById('fieldPurpose').value;
  const company = document.getElementById('fieldCompany').value;
  const community = company === 'group' ? (document.getElementById('fieldCommunity').value || undefined) : undefined;
  const season = document.getElementById('fieldSeason').value;
  const color = document.getElementById('fieldColor').value;
  const status = currentType === 'route' ? 'visited' : currentStatus;
  const trip = document.getElementById('fieldTrip').value.trim();

  if(editingId){
    const entry = allEntries.find(x => x.id === editingId);
    if(entry){
      const snapshot = { name: entry.name, year: entry.year, month: entry.month, photos: entry.photos, instagramUrl: entry.instagramUrl,
        mapLinkUrl: entry.mapLinkUrl, docLinkUrl: entry.docLinkUrl,
        notes: entry.notes, purpose: entry.purpose, company: entry.company, community: entry.community, season: entry.season, color: entry.color,
        trip: entry.trip, tripOrder: entry.tripOrder, status: entry.status, activity: entry.activity, favorite: entry.favorite, trackDays: entry.trackDays,
        lat: entry.lat, lng: entry.lng, countryKey: entry.countryKey, hidden: entry.hidden };
      entry.name = name || entry.name; entry.year = year; entry.month = month; entry.photos = photos; entry.instagramUrl = instagramUrl; entry.notes = notes;
      entry.mapLinkUrl = mapLinkUrl; entry.docLinkUrl = docLinkUrl;
      entry.purpose = purpose; entry.company = company; entry.community = community; entry.season = season; entry.color = color;
      if(hideFromFriends) entry.hidden = true; else delete entry.hidden;
      const oldTrip = entry.trip;
      if(entry.trip !== trip) entry.tripOrder = trip ? nextTripOrder(trip) : undefined;
      entry.trip = trip;
      if(oldTrip !== trip) cleanupTripMetaIfOrphaned(oldTrip);
      if(entry.type !== 'route') entry.status = status;
      if(entry.type === 'route'){
        entry.activity = document.getElementById('fieldActivity').value;
        entry.trackDays = parseInt(document.getElementById('fieldTrackDays').value) || entry.trackDays || 1;
        entry.terrain = entry.activity === 'running' ? document.getElementById('fieldTerrain').value : undefined;
      }
      if(entry.type === 'city'){
        entry.favorite = document.getElementById('fieldFavorite').checked;
        // страна теперь явно видна в форме, поэтому применяем её всегда —
        // иначе исправить её можно было бы только заново найдя город
        entry.countryKey = document.getElementById('fieldCityCountry').value || null;
      }
      if(entry.type === 'city' && pendingLatLng){
        // координаты меняем только если во время именно этого редактирования
        // реально искали и выбрали город заново
        entry.lat = pendingLatLng.lat;
        entry.lng = pendingLatLng.lng;
      }
      if(entry.type === 'country' && pendingCountryKey){
        entry.countryKey = pendingCountryKey;
      }
      lastAction = { type: 'edit', id: entry.id, snapshot };
    }
    const saved = await saveData();
    exitEditMode(false);
    rebuildAll();
    if(saved) showUndoToast('Изменения сохранены');
    return;
  }

  if(currentType === 'route'){
    const activity = document.getElementById('fieldActivity').value;

    if(routeSource === 'cities'){
      if(routeWaypoints.length < 2){ toast('Добавьте минимум 2 города для маршрута'); return; }

      const saveBtn = document.getElementById('saveBtn');
      const originalBtnText = saveBtn.textContent;
      saveBtn.disabled = true;
      saveBtn.textContent = 'Строим маршрут…';
      const roadRoute = await fetchRoadRoute(routeWaypoints);
      saveBtn.disabled = false;
      saveBtn.textContent = originalBtnText;

      let coords, distanceKm, isEstimated;
      if(roadRoute){
        coords = roadRoute.coords;
        distanceKm = roadRoute.distanceKm;
        isEstimated = false;
      } else {
        coords = routeWaypoints.map(w => [w.lat, w.lng]);
        distanceKm = trackDistanceKm(coords);
        isEstimated = true;
      }

      const autoName = `${routeWaypoints[0].name} — ${routeWaypoints[routeWaypoints.length-1].name}`;
      const routeWaypointsForSuggest = routeWaypoints.slice();
      allEntries.push({
        id: genId(), type:'route', name: name || autoName, year, month, photos, instagramUrl, mapLinkUrl, docLinkUrl, notes, purpose, company, community, season, color, activity, status: 'visited', trip, tripOrder: nextTripOrder(trip),
        coordsEncoded: encodePolyline(coords), distanceKm, elevationGain: null, maxElevation: null, durationMin: null, profile: null,
        waypointNames: routeWaypoints.map(w => w.name), waypointCoords: routeWaypoints.map(w => [w.lat, w.lng]), waypointCountryKeys: routeWaypoints.map(w => w.countryKey || null), isEstimated
      });
      routeWaypoints = [];
      renderRouteWaypoints();
      markNewEntriesHidden(entriesBefore, hideFromFriends);
      resetEntryFormFields();
      const saved = await saveData();
      rebuildAll();
      if(saved) toast(isEstimated ? 'Маршрут добавлен: сервис дорог недоступен, использована прямая линия' : 'Маршрут добавлен по дорогам');
      suggestMissingCountriesForWaypoints(routeWaypointsForSuggest);
      return;
    }

    if(pendingGpxList.length === 0){ toast('Загрузите один или несколько GPX-файлов'); return; }
    const multi = pendingGpxList.length > 1;
    pendingGpxList.forEach((g, gi)=>{
      // заданное название — как есть; имя файла — только если название пустое.
      // Несколько файлов под одним названием различаем номером
      const routeName = name ? (multi ? `${name} (${gi + 1})` : name) : g.baseName;
      allEntries.push({
        id: genId(), type:'route', name: routeName, year: g.startYear || year, month: g.startMonth || month, photos, instagramUrl, mapLinkUrl, docLinkUrl, notes, purpose, company, community, season: (g.startMonth && seasonForMonth(g.startMonth)) || season, color, activity, status: 'visited', trip, tripOrder: nextTripOrder(trip),
        coordsEncoded: encodePolyline(g.coords), segBreaks: (g.segBreaks && g.segBreaks.length) ? g.segBreaks : undefined, distanceKm: g.distanceKm,
        elevationGain: g.elevationGain, maxElevation: g.maxElevation,
        durationMin: g.durationMin, profile: g.profile,
        trackDays: g.hasTimeData ? g.trackDays : (parseInt(document.getElementById('fieldTrackDays').value) || 1),
        terrain: activity === 'running' ? (document.getElementById('fieldTerrain').value || guessTerrain(g.distanceKm, g.elevationGain)) : undefined
      });
    });
    const addedCount = pendingGpxList.length;
    pendingGpxList = [];
    const drop = document.getElementById('fileDrop');
    drop.textContent = 'Нажмите, чтобы выбрать один или несколько .gpx файлов';
    drop.classList.remove('has-file');
    document.getElementById('gpxInput').value = '';
    markNewEntriesHidden(entriesBefore, hideFromFriends);
    resetEntryFormFields();
    const saved = await saveData();
    rebuildAll();
    if(saved) toast(addedCount === 1 ? 'Маршрут добавлен' : `Добавлено маршрутов: ${addedCount}`);
    return;
  } else if(currentType === 'city'){
    if(!pendingLatLng){ toast('Выберите город из подсказок или укажите точку на карте'); return; }
    const finalName = name || pendingCityName || 'Без названия';
    const favorite = document.getElementById('fieldFavorite').checked;
    allEntries.push({
      id: genId(), type: 'city', name: finalName, year, month, photos, instagramUrl, mapLinkUrl, docLinkUrl, notes, purpose, company, community, season, color, favorite, status, trip, tripOrder: nextTripOrder(trip),
      lat: pendingLatLng.lat, lng: pendingLatLng.lng, countryKey: (document.getElementById('fieldCityCountry').value || pendingCityCountryKey || null)
    });
    clearCitySelection();
    document.getElementById('fieldFavorite').checked = false;
  } else { // country
    if(!pendingCountryKey){ toast('Выберите страну из подсказок или на карте'); return; }
    const ruName = COUNTRY_RU[pendingCountryKey] || pendingCountryKey;
    allEntries.push({
      id: genId(), type: 'country', name: name || ruName, year, month, photos, instagramUrl, mapLinkUrl, docLinkUrl, notes, purpose, company, community, season, color, status, trip, tripOrder: nextTripOrder(trip),
      countryKey: pendingCountryKey
    });
    clearCountrySelection();
  }

  markNewEntriesHidden(entriesBefore, hideFromFriends);
  resetEntryFormFields();

  const saved = await saveData();
  rebuildAll();
  if(saved) toast('Добавлено');
});

document.getElementById('cancelEditBtn').addEventListener('click', ()=> exitEditMode(true));

function exitEditMode(fullReset){
  editingId = null;
  document.getElementById('typeToggle').classList.remove('type-locked');
  document.getElementById('routeSourceBlock').style.display = '';
  document.getElementById('cancelEditBtn').style.display = 'none';
  document.getElementById('saveBtn').textContent = 'Сохранить';
  resetEntryFormFields();
  document.getElementById('fieldActivity').value = 'hiking';
  document.getElementById('fieldTerrain').value = 'road';
  document.getElementById('fieldTrackDays').value = 1;
  updateHikingDaysVisibility();
  document.getElementById('refreshWaypointsField').style.display = 'none';
  document.getElementById('editWaypointsField').style.display = 'none';
  editWaypointIndex = -1;
  document.getElementById('fieldFavorite').checked = false;
  setFieldColor(DEFAULT_COLOR[currentType]);
  currentStatus = 'visited';
  document.querySelectorAll('.type-btn[data-status]').forEach(b => b.classList.toggle('active', b.dataset.status === 'visited'));
  if(!fullReset) return; // после сохранения оставляем когда/зачем/с кем — обычно следующая точка из той же поездки
  document.getElementById('fieldYear').value = new Date().getFullYear();
  document.getElementById('fieldMonth').value = '';   // сбрасывался не всегда — из-за этого месяц расходился с сезоном
  document.getElementById('fieldPurpose').value = 'tourism';
  document.getElementById('fieldCompany').value = 'alone';
  document.getElementById('fieldCommunity').value = '';
  updateCommunityVisibility();
  document.getElementById('fieldSeason').value = 'summer';
}

function resetEntryFormFields(){
  ['fieldName','fieldPhoto','fieldInstagram','fieldMapLink','fieldDocLink','fieldNotes','fieldTrip']
    .forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('fieldHidden').checked = false;
}
// флаг «не показывать друзьям» — на все записи, созданные этим сохранением
// (GPX может дать сразу несколько маршрутов)
function markNewEntriesHidden(fromIndex, hidden){
  if(!hidden) return;
  for(let i = fromIndex; i < allEntries.length; i++) allEntries[i].hidden = true;
}

function genId(){ return 'e_' + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

function cleanupTripMetaIfOrphaned(tripName){
  if(!tripName) return;
  const stillUsed = allEntries.some(e => e.trip === tripName);
  if(!stillUsed) delete tripMeta[tripName];
}

function nextTripOrder(tripName){
  if(!tripName) return undefined;
  const existing = allEntries.filter(e => e.trip === tripName);
  return existing.reduce((m,e) => Math.max(m, e.tripOrder || 0), 0) + 1;
}

// ---------- layer type filter chips ----------
document.querySelectorAll('.chip[data-layer]').forEach(chip=>{
  chip.addEventListener('click', ()=>{
    const t = chip.dataset.layer;
    chip.classList.toggle('active');
    if(activeLayerTypes.has(t)) activeLayerTypes.delete(t); else activeLayerTypes.add(t);
    applyFilters();
  });
});

