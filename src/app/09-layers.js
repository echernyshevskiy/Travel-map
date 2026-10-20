// ---------- rendering ----------
function cityIcon(color, favorite, isWishlist){
  const c = color || DEFAULT_COLOR.city;
  if(isWishlist){
    return L.divIcon({
      className: '',
      html: `<div style="width:12px;height:12px;border-radius:50%;background:transparent;border:2px dashed ${c};"></div>`,
      iconSize: [12,12],
      iconAnchor: [6,6]
    });
  }
  if(favorite){
    return L.divIcon({
      className: '',
      // векторное сердце с тёмной обводкой — как у обычных точек, без размытой тени
      html: `<svg width="18" height="16" viewBox="0 0 18 16" style="display:block;overflow:visible;"><path d="M9 15.2C4.6 11.9 1 9 1 5.3 1 2.9 2.9 1 5.2 1c1.5 0 2.9.8 3.8 2 .9-1.2 2.3-2 3.8-2C15.1 1 17 2.9 17 5.3c0 3.7-3.6 6.6-8 9.9z" fill="${c}" stroke="#2B3B2E" stroke-width="2" stroke-linejoin="round"/></svg>`,
      iconSize: [18,16],
      iconAnchor: [9,9]
    });
  }
  return L.divIcon({
    className: '',
    html: `<div style="width:12px;height:12px;border-radius:50%;background:${c};border:2px solid #2B3B2E;"></div>`,
    iconSize: [12,12],
    iconAnchor: [6,6]
  });
}

let migrationChanged = false;
// Поля, которые попадают в разметку без экранирования (цвет — в style, id —
// в onclick и data-атрибуты, год и месяц — в текст), должны быть того вида,
// какой даёт сама форма. Файл резервной копии может прийти откуда угодно:
// подложенный «бэкап» с кодом вместо цвета раньше исполнялся при импорте.
const SAFE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const SAFE_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;
function sanitizeEntryFields(entry){
  let changed = false;
  if(typeof entry.id !== 'string' || !SAFE_ID_RE.test(entry.id)){ entry.id = genId(); changed = true; }
  if(typeof entry.color !== 'string' || !SAFE_COLOR_RE.test(entry.color)){
    if(entry.color) changed = true;
    entry.color = DEFAULT_COLOR[entry.type] || '#3F5240';
  }
  const y = parseInt(entry.year, 10);
  const year = Number.isFinite(y) && y > 0 && y < 3000 ? y : new Date().getFullYear();
  if(entry.year !== year){ entry.year = year; changed = true; }
  if(entry.month != null && entry.month !== ''){
    const m = parseInt(entry.month, 10);
    const month = m >= 1 && m <= 12 ? m : undefined;
    if(entry.month !== month){ entry.month = month; changed = true; }
  }
  if(entry.status !== 'visited' && entry.status !== 'wishlist'){
    if(entry.status) changed = true;
    entry.status = 'visited';
  }
  if(entry.segBreaks != null && !(Array.isArray(entry.segBreaks) && entry.segBreaks.every(i => Number.isInteger(i) && i > 0))){
    delete entry.segBreaks; changed = true;
  }
  if(entry.trackDays != null){
    const d = parseInt(entry.trackDays, 10);
    const days = d >= 1 && d <= 365 ? d : 1;
    if(entry.trackDays !== days){ entry.trackDays = days; changed = true; }
  }
  // точные даты — только в виде ГГГГ-ММ-ДД; конец не раньше начала
  if(entry.dateFrom != null && !parseIsoDate(entry.dateFrom)){ delete entry.dateFrom; changed = true; }
  if(entry.dateTo != null && (!entry.dateFrom || !parseIsoDate(entry.dateTo) || entry.dateTo <= entry.dateFrom)){ delete entry.dateTo; changed = true; }
  // Строки там, где ждут строки, числа там, где ждут числа: повреждённый файл
  // или старая версия могли записать что угодно, а один такой элемент ронял
  // список, карточки или глобус целиком.
  const fixed = normalizeEntryShape(entry);
  if(fixed) changed = true;
  if(changed) migrationChanged = true;
}
function sanitizeRace(r){
  if(!r || typeof r !== 'object') return null;
  const str = v => (v == null ? '' : String(v));
  const posNum = v => { const n = parseFloat(v); return isFinite(n) && n > 0 ? n : null; };
  const posInt = v => { const n = parseInt(v, 10); return isFinite(n) && n > 0 ? n : null; };
  const out = Object.assign({}, r, {
    id: typeof r.id === 'string' && SAFE_ID_RE.test(r.id) ? r.id : genId(),
    name: str(r.name), city: str(r.city), country: str(r.country), time: str(r.time),
    date: /^\d{4}-\d{2}-\d{2}$/.test(str(r.date)) ? r.date : '',
    status: r.status === 'upcoming' ? 'upcoming' : 'done',
    distanceKm: posNum(r.distanceKm), place: posInt(r.place), participants: posInt(r.participants)
  });
  // у старых записей статуса нет вовсе — так и оставляем (они считаются состоявшимися)
  if(r.status == null) delete out.status;
  return out;
}

function migrateEntry(entry){
  sanitizeEntryFields(entry);
  if(!entry.purpose) entry.purpose = 'tourism';
  // Повреждённый или частичный бэкап может принести маршрут без дистанции:
  // проверка при импорте смотрит только id/тип/название, а дальше форматирование
  // числа роняло отрисовку списка целиком. Чиним здесь, а не в восьми местах вывода.
  if(entry.type === 'route'){
    if(typeof entry.distanceKm !== 'number' || !isFinite(entry.distanceKm)) entry.distanceKm = 0;
    if(entry.elevationGain != null && (typeof entry.elevationGain !== 'number' || !isFinite(entry.elevationGain))) entry.elevationGain = null;
    if(entry.durationMin != null && (typeof entry.durationMin !== 'number' || !isFinite(entry.durationMin))) entry.durationMin = null;
    if(entry.maxElevation != null && (typeof entry.maxElevation !== 'number' || !isFinite(entry.maxElevation))) entry.maxElevation = null;
  }
  // покрытие для уже сохранённых забегов выводим из набора высоты —
  // иначе разделение шоссе/трейл заработало бы только для новых записей
  if(entry.type === 'route' && entry.activity === 'running' && !entry.terrain){
    entry.terrain = guessTerrain(entry.distanceKm, entry.elevationGain);
  }
  if(!entry.photos){
    entry.photos = entry.photo ? [entry.photo] : [];
  }
  // уже сохранённые ссылки Google Drive приводим к отображаемому виду
  if(entry.photos.length){
    const before = entry.photos.join('\n');
    entry.photos = entry.photos.map(p => normalizePhotoUrl(p)).filter(Boolean);
    if(entry.photos.join('\n') !== before) migrationChanged = true;
  }
  return entry;
}

// Заливка страны по числу визитов, а не «был / не был»: одна поездка и десять
// выглядели одинаково, хотя это разные истории. Шкала пологая, чтобы страна
// с одним визитом оставалась хорошо заметной.
// Счётчик визитов по странам: пересобирается при изменении данных, а не
// перебирается заново на каждую страну при отрисовке слоёв
let countryVisitCounts = new Map();
function rebuildCountryVisitCounts(){
  countryVisitCounts = new Map();
  allEntries.forEach(e=>{
    if(e.type !== 'country' || e.status === 'wishlist' || !e.countryKey) return;
    countryVisitCounts.set(e.countryKey, (countryVisitCounts.get(e.countryKey) || 0) + 1);
  });
}

function countryFillOpacity(countryKey){
  const visits = countryVisitCounts.get(countryKey) || 0;
  if(visits <= 1) return 0.28;
  if(visits === 2) return 0.40;
  if(visits === 3) return 0.52;
  if(visits === 4) return 0.62;
  return 0.72;
}

// Сравниваем дёшево: длина и концы. Полное сравнение тысяч точек на каждом
// обновлении стоило бы дороже, чем сама перерисовка, а подмена трека при
// совпадении длины и обоих концов практически невозможна.
function sameCoords(a, b){
  if(!Array.isArray(b)) return true;
  const flat = Array.isArray(a[0]) ? a[0] : a;
  if(!Array.isArray(flat) || flat.length !== b.length) return false;
  if(b.length === 0) return true;
  const eq = (p, q) => p && q && Math.abs((p.lat !== undefined ? p.lat : p[0]) - q[0]) < 1e-9
                            && Math.abs((p.lng !== undefined ? p.lng : p[1]) - q[1]) < 1e-9;
  return eq(flat[0], b[0]) && eq(flat[flat.length-1], b[b.length-1]);
}

function syncLayers(){
  const currentIds = new Set(allEntries.map(e => e.id));

  // drop layers for entries that no longer exist
  Object.keys(layers).forEach(id=>{
    if(!currentIds.has(id)){
      const orphan = layers[id];
      if(orphan instanceof L.Marker) cityCluster.removeLayer(orphan);
      else map.removeLayer(orphan);
      delete layers[id];
    }
  });

  // create new layers, update existing ones in place (avoids re-parsing geometry/tracks on every edit)
  allEntries.forEach(entry=>{
    const isWishlist = entry.status === 'wishlist';
    let layer = layers[entry.id];
    // город без координат (повреждённый файл, старая версия) на карту не ставим —
    // маркер в NaN ронял кластеры; запись остаётся в списке и «Проверке данных»
    if(entry.type === 'city' && (entry.lat == null || entry.lng == null)){
      if(layer){ if(layer instanceof L.Marker) cityCluster.removeLayer(layer); else map.removeLayer(layer); delete layers[entry.id]; }
      return;
    }

    // Слой переиспользуется по идентификатору. При импорте запись с тем же id
    // может прийти с другой геометрией или вообще другого типа — тогда на карте
    // остался бы прежний трек, а вызов метода не того типа (setStyle у маркера)
    // и вовсе бросил бы ошибку. Поэтому проверяем пригодность слоя и, если он
    // не подходит, выбрасываем его и создаём заново.
    if(layer){
      const fits =
        entry.type === 'route'   ? typeof layer.setLatLngs === 'function' :
        entry.type === 'city'    ? typeof layer.setLatLng  === 'function' :
                                   typeof layer.eachLayer  === 'function';
      if(!fits){
        if(layer instanceof L.Marker) cityCluster.removeLayer(layer);
        else map.removeLayer(layer);
        delete layers[entry.id];
        layer = null;
      }
    }

    if(!layer){
      if(entry.type === 'route'){
        layer = L.polyline(entryDrawCoords(entry), {color: entry.color, weight:3, opacity:0.85, dashArray: entry.isEstimated ? '8,5' : null, pane: 'routePane', renderer: routeRenderer});
        layer.__geomKey = entryGeomKey(entry);
      } else if(entry.type === 'city'){
        layer = L.marker([entry.lat, entry.lng], {icon: cityIcon(entry.color, entry.favorite, isWishlist)});
      } else { // country
        const geom = getCountryGeometry(entry.countryKey);
        if(!geom) return;
        layer = L.geoJSON(geom, {
          style: isWishlist
            ? { color: entry.color, weight:1.5, fillOpacity:0, dashArray:'4,4' }
            : { color: entry.color, weight:1.5, fillColor: entry.color, fillOpacity: countryFillOpacity(entry.countryKey), dashArray:null }
        });
      }
      if(entry.type === 'country') layer.__countryKey = entry.countryKey;
      layers[entry.id] = layer;
      layer.on('click', L.DomEvent.stopPropagation);
    } else {
      if(entry.type === 'route'){
        // геометрия могла измениться — при импорте или после правки точек
        // у сжатых треков сравниваем саму строку: это точно и дёшево. Сравнение
        // по длине и концам пропускало замену средней точки маршрута
        const coords = getEntryCoords(entry);
        const same = entry.coordsEncoded ? layer.__geomKey === entryGeomKey(entry)
                                         : sameCoords(layer.getLatLngs ? layer.getLatLngs() : [], coords);
        if(!same){ layer.setLatLngs(entryDrawCoords(entry)); layer.__geomKey = entryGeomKey(entry); }
        layer.setStyle({ color: entry.color, weight:3, opacity:0.85, dashArray: entry.isEstimated ? '8,5' : null });
      } else if(entry.type === 'city'){
        layer.setLatLng([entry.lat, entry.lng]);
        layer.setIcon(cityIcon(entry.color, entry.favorite, isWishlist));
      } else {
        // у записи могла смениться страна — тогда и контур нужен другой
        if(layer.__countryKey !== entry.countryKey){
          const geom = getCountryGeometry(entry.countryKey);
          if(geom){
            layer.clearLayers();
            layer.addData(geom);
            layer.__countryKey = entry.countryKey;
          }
        }
        layer.setStyle(isWishlist
          ? { color: entry.color, weight:1.5, fillOpacity:0, dashArray:'4,4' }
          : { color: entry.color, weight:1.5, fillColor: entry.color, fillOpacity: countryFillOpacity(entry.countryKey), dashArray:null });
      }
    }
    // У страны собственный слой перехватывал клик, и попап с поездками и
    // действиями до неё не доходил: показывалась только карточка записи.
    // Теперь клик по стране всегда открывает общий попап страны.
    if(entry.type === 'country' && entry.countryKey){
      layer.off('click');
      layer.unbindPopup();
      layer.on('click', (ev)=>{
        L.DomEvent.stopPropagation(ev);
        // в режиме «указать на карте» клик по отмеченной стране — это выбор
        // точки, а не открытие попапа (раньше точку внутри посещённых стран
        // и России поставить было нельзя)
        if(placingCity || placingCountry || quizMapActive()){ handleMapClick(ev); return; }
        openCountryPopup(entry.countryKey, ev.latlng);
      });
    } else {
      // Содержимое попапа собирается только при открытии. Раньше оно строилось
      // для каждой записи на каждом перестроении — работа, которая почти всегда
      // выбрасывалась, ведь попап открывают у одной записи из сотен.
      // Запись ищем по идентификатору в момент открытия, а не держим ссылку:
      // после импорта объект мог быть заменён, и попап показывал бы старое.
      const entryId = entry.id;
      layer.bindPopup(() => {
        const fresh = allEntries.find(e => e.id === entryId);
        return fresh ? buildPopup(fresh) : '';
      });
    }
  });
  // Линии маршрутов тонкие, а заливки стран занимают всю площадь — без подъёма
  // наверх попасть в маршрут внутри страны почти невозможно.
  allEntries.forEach(e=>{
    if(e.type !== 'route') return;
    const l = layers[e.id];
    if(l && typeof l.bringToFront === 'function'){
      try{ l.bringToFront(); }catch(err){}
    }
  });
}

// Фильтры «Год» и «Поездка» строятся из самих данных, а не из фиксированного списка.
// Если удалить последнюю запись выбранного года/поездки, чип исчезает — но выбор
// остаётся в памяти и продолжает отфильтровывать вообще всё, а снять его уже нечем.
// Поэтому перед перерисовкой чистим выбор от того, чего в данных больше нет.
function pruneStaleFilters(){
  const years = new Set(allEntries.map(e => e.year));
  [...activeYears].forEach(y => { if(!years.has(y)) activeYears.delete(y); });
  const trips = new Set(allEntries.map(e => e.trip).filter(Boolean));
  let prunedTrip = false;
  [...activeTrips].forEach(t => { if(!trips.has(t)){ activeTrips.delete(t); prunedTrip = true; } });
  // хэш трогаем ТОЛЬКО если реально что-то вычистили: иначе первый же rebuildAll
  // при загрузке страницы стёр бы #trip=... раньше, чем applyTripFromUrl его прочитает
  if(prunedTrip) updateTripUrlHash();
}

// Записи, которые нельзя показать вовсе (не объект, неизвестный тип), не
// выбрасываются молча: они откладываются в отдельный ключ хранилища, чтобы их
// можно было достать из резервной копии браузера. Повторяющиеся id получают
// новые: иначе удаление одной записи удаляло бы обе.
const QUARANTINE_KEY = 'travel-map-quarantine';
function dropUnusableEntries(){
  const bad = [], seen = new Set();
  allEntries = (Array.isArray(allEntries) ? allEntries : []).filter(e => {
    if(!isUsableEntry(e)){ bad.push(e); return false; }
    if(typeof e.id === 'string' && seen.has(e.id)){ e.id = genId(); migrationChanged = true; }
    seen.add(e.id);
    return true;
  });
  if(!bad.length) return;
  migrationChanged = true;
  try{
    const prev = JSON.parse(localStorage.getItem(QUARANTINE_KEY) || '[]');
    localStorage.setItem(QUARANTINE_KEY, JSON.stringify(prev.concat(bad.map(x => ({ at: Date.now(), item: x }))).slice(-200)));
  }catch(e){ /* хранилище недоступно — запись всё равно непригодна */ }
  console.warn('Отложены повреждённые записи:', bad.length);
}
function rebuildAll(){
  dropUnusableEntries();
  allEntries.forEach(migrateEntry);
  races = (Array.isArray(races) ? races : []).map(sanitizeRace).filter(Boolean);
  pruneStaleFilters();
  rebuildCountryVisitCounts();
  syncLayers();
  buildYearChips();
  buildFixedChips('monthChips', MONTHS, activeMonths);
  buildFixedChips('purposeChips', PURPOSES, activePurposes);
  buildFixedChips('companyChips', COMPANIES, activeCompanies);
  buildFixedChips('communityChips', COMMUNITIES, activeCommunities);
  buildFixedChips('seasonChips', SEASONS, activeSeasons);
  buildFixedChips('activityChips', ACTIVITIES, activeActivities);
  buildFixedChips('statusChips', STATUSES, activeStatuses);
  buildTripChips();
  updateTripDatalist();
  updateTimelineRange();
  applyFilters();
  updateStats();
  renderNewCountriesChart();
  renderGlance();
  updateRunningButton();
  updateDiagnosticsBadge();
}

