// ---------- type toggle (form) ----------
let currentStatus = 'visited';
function updateHikingDaysVisibility(){
  const activity = document.getElementById('fieldActivity').value;
  document.getElementById('hikingDaysField').style.display = activity === 'hiking' ? 'block' : 'none';
  const tf = document.getElementById('terrainField');
  if(tf) tf.style.display = activity === 'running' ? 'block' : 'none';
}

// Порог подобран по реальному разрыву между шоссе и трейлом: у шоссейных
// забегов набор обычно 3-8 м/км, у трейла — десятки. 18 м/км лежит в пустоте
// между этими группами. Это только подсказка — значение можно исправить руками.
const TRAIL_ELEV_THRESHOLD = 18;
function guessTerrain(distanceKm, elevationGain){
  if(!distanceKm || elevationGain == null) return 'road';
  return (elevationGain / distanceKm) >= TRAIL_ELEV_THRESHOLD ? 'trail' : 'road';
}
function updateCommunityVisibility(){
  const company = document.getElementById('fieldCompany').value;
  document.getElementById('communityField').style.display = company === 'group' ? 'block' : 'none';
  if(company !== 'group') document.getElementById('fieldCommunity').value = '';
}
// Переключение формы под тип записи. Вынесено из обработчика клика: при правке
// записи вкладку надо переключать программно — раньше форма оставалась на
// «Стране», и поля города/маршрута (активность, точки, страна города) были скрыты.
function applyTypeUI(type){
    document.querySelectorAll('.type-btn[data-type]').forEach(b=>b.classList.toggle('active', b.dataset.type === type));
    currentType = type;
    document.getElementById('countryFields').style.display = currentType === 'country' ? 'block' : 'none';
    document.getElementById('cityFields').style.display = currentType === 'city' ? 'block' : 'none';
    document.getElementById('routeFields').style.display = currentType === 'route' ? 'block' : 'none';
    updateHikingDaysVisibility();
    document.getElementById('refreshWaypointsField').style.display = 'none';
    document.getElementById('editWaypointsField').style.display = 'none';
    const statusToggle = document.getElementById('statusToggle');
    const statusLabel = document.getElementById('statusLabel');
    const isRoute = currentType === 'route';
    statusToggle.style.opacity = isRoute ? '0.4' : '1';
    statusToggle.style.pointerEvents = isRoute ? 'none' : 'auto';
    statusLabel.style.opacity = isRoute ? '0.4' : '1';
    if(!editingId) setFieldColor(DEFAULT_COLOR[currentType]); else renderColorSwatches();
}
document.querySelectorAll('.type-btn[data-type]').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    // тип существующей записи не меняется — геометрия у страны, города и маршрута разная
    if(editingId){ toast('Тип записи при правке не меняется'); return; }
    applyTypeUI(btn.dataset.type);
  });
});

document.querySelectorAll('.type-btn[data-status]').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.type-btn[data-status]').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    currentStatus = btn.dataset.status;
  });
});

// ---------- route source toggle (GPX vs manual city sequence) ----------
let routeSource = 'gpx';
let routeWaypoints = [];
document.querySelectorAll('.type-btn[data-source]').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.type-btn[data-source]').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    routeSource = btn.dataset.source;
    document.getElementById('gpxSourceFields').style.display = routeSource === 'gpx' ? 'block' : 'none';
    document.getElementById('citiesSourceFields').style.display = routeSource === 'cities' ? 'block' : 'none';
  });
});

const routeCitySearchInput = document.getElementById('routeCitySearch');
const routeCitySuggestBox = document.getElementById('routeCitySuggest');
let routeCityMatches = [];
let routeCityHlIndex = -1;
let routeCityDebounceTimer = null;

routeCitySearchInput.addEventListener('input', ()=>{
  const q = routeCitySearchInput.value.trim();
  clearTimeout(routeCityDebounceTimer);
  if(!q || q.length < 2){ routeCitySuggestBox.style.display = 'none'; return; }
  routeCitySuggestBox.innerHTML = `<div class="suggest-empty">Поиск…</div>`;
  routeCitySuggestBox.style.display = 'block';
  routeCityDebounceTimer = setTimeout(()=> fetchRouteCitySuggestions(q), 700);
});
routeCitySearchInput.addEventListener('keydown', (e)=>{
  if(routeCitySuggestBox.style.display === 'none') return;
  if(e.key === 'ArrowDown'){ e.preventDefault(); routeCityHlIndex = Math.min(routeCityHlIndex+1, routeCityMatches.length-1); renderRouteCitySuggestions(); }
  else if(e.key === 'ArrowUp'){ e.preventDefault(); routeCityHlIndex = Math.max(routeCityHlIndex-1, 0); renderRouteCitySuggestions(); }
  else if(e.key === 'Enter'){ e.preventDefault(); const idx = routeCityHlIndex >= 0 ? routeCityHlIndex : 0; if(routeCityMatches[idx]) addRouteWaypoint(routeCityMatches[idx]); }
  else if(e.key === 'Escape'){ routeCitySuggestBox.style.display = 'none'; }
});
document.addEventListener('click', (e)=>{
  if(!routeCitySearchInput.contains(e.target) && !routeCitySuggestBox.contains(e.target)) routeCitySuggestBox.style.display = 'none';
});

// Политика Nominatim: не больше одного запроса в секунду. Раньше пауза стояла
// отдельно в каждом месте (350-400 мс) — этого мало само по себе, а при
// наложении подсказок поиска на фоновый пересчёт координат лимит превышался
// вдвое-втрое. Очередь общая на все обращения, поэтому суммарный темп
// соблюдается независимо от того, сколько мест шлют запросы одновременно.
const NOMINATIM_MIN_INTERVAL = 1100;
let nominatimNextFreeAt = 0;
async function nominatimThrottle(){
  const now = Date.now();
  const startAt = Math.max(now, nominatimNextFreeAt);
  nominatimNextFreeAt = startAt + NOMINATIM_MIN_INTERVAL;
  const wait = startAt - now;
  if(wait > 0) await new Promise(r => setTimeout(r, wait));
}

// Геокодер иногда не отвечает вовсе: запрос висит без ошибки, и всё, что его
// ждёт (подсказки, «Ищу точку 2 из 11…»), замирало навсегда. Ограничиваем
// ожидание 8 секундами, а после сбоя полторы минуты не ждём его вовсе —
// сразу берём встроенный справочник городов.
const NOMINATIM_TIMEOUT = 8000;
// Сколько ждём остальные сетевые запросы. Зависший без ответа запрос не должен
// навсегда занимать очередь: синхронизация без ограничения ждала бы GitHub до
// перезагрузки страницы, а подгрузка границ — занимала бы все три «слота».
// Объект, а не числа — автотесты укорачивают ожидание, не трогая код.
const NET_TIMEOUTS = { github: 30000, githubPut: 60000, borders: 20000 };
let nominatimDownUntil = 0;
const nominatimDown = () => Date.now() < nominatimDownUntil;
async function nominatimJson(url){
  await nominatimThrottle();
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), NOMINATIM_TIMEOUT) : null;
  try{
    const res = await fetch(url, controller ? { signal: controller.signal } : undefined);
    if(!res.ok) throw new Error('Nominatim ' + res.status);
    return await res.json();
  }catch(err){
    nominatimDownUntil = Date.now() + 90000;
    throw err;
  }finally{
    if(timer) clearTimeout(timer);
  }
}
// онлайн-результаты + города из справочника, которых в них нет
function mergeSettlementMatches(online, local){
  const out = (online || []).slice();
  (local || []).forEach(m => { if(!out.some(o => (o.name || '').toLowerCase() === (m.name || '').toLowerCase() && Math.abs(o.lat - m.lat) < 0.3 && Math.abs(o.lng - m.lng) < 0.3)) out.push(m); });
  return out.slice(0, 14);
}

// Ответы приходят не в том порядке, в каком уходили: на медленной сети ответ
// на «Пар» может вернуться позже ответа на «Париж» и затереть подсказки более
// точного запроса. Каждому полю ввода даём свой счётчик поколений и применяем
// только последний ответ.
const suggestSeq = { city: 0, routeCity: 0, photo: 0, waypoint: 0 };

async function queryNominatimSettlements(q, biasLatLng, opts){
  // без сети — встроенный справочник городов; при сбое сервиса — тоже он
  const fallback = () => localCitySearch(q, 10, biasLatLng).map(cityAsMatch);
  if((navigator.onLine === false || nominatimDown()) && !(opts && opts.networkOnly)){
    const local = fallback();
    if(local.length || navigator.onLine === false) return local;
    throw new Error('геокодер недоступен'); // не ждём его снова — недавно уже не ответил
  }
  try{
    return await queryNominatimOnline(q, biasLatLng);
  }catch(err){
    if(opts && opts.networkOnly) throw err;
    const local = fallback();
    if(local.length) return local;
    throw err;
  }
}
async function queryNominatimOnline(q, biasLatLng){
  const ckey = 's2:' + q.trim().toLowerCase() + (biasLatLng ? '@' + biasLatLng[0].toFixed(1) + ',' + biasLatLng[1].toFixed(1) : '');
  const cached = geoCacheGet(ckey);
  if(cached !== undefined) return cached;
  const result = await queryNominatimFetch(q, biasLatLng);
  if(result.length) geoCachePut(ckey, result); // пустой ответ не запоминаем — вдруг опечатка
  return result;
}
async function queryNominatimFetch(q, biasLatLng){
  let url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&accept-language=ru&limit=12&q=${encodeURIComponent(q)}`;
  if(biasLatLng){
    // мягкое смещение результатов к региону уже добавленных точек маршрута —
    // без bounded=1, так что результаты в другом регионе не отсекаются совсем,
    // просто не выходят на первое место автоматически (случай «Дублин, Ирландия»
    // vs «Дублин, Огайо» — оба существуют, но нужный обычно рядом с остальными точками)
    const [lat, lng] = biasLatLng;
    const delta = 3;
    url += `&viewbox=${lng-delta},${lat-delta},${lng+delta},${lat+delta}`;
  }
  const data = await nominatimJson(url);
  return nominatimSettlementMatches(Array.isArray(data) ? data : []);
}
// Разбор ответа поиска. Название — у самого найденного объекта (d.name), а не у
// первого подходящего поля адреса: иначе для посёлка «Мир» бралась строка
// адреса уровнем выше — «Мирский сельский Совет», а для урочища Алтын-Арашан —
// «Ак-Суйский район». Сами районы и сельсоветы уходят в конец списка: ищем
// населённые пункты, район нужен редко.
const NOMI_SETTLEMENT = new Set(['city', 'town', 'village', 'hamlet', 'isolated_dwelling', 'locality', 'suburb', 'quarter', 'neighbourhood', 'farm', 'croft', 'borough']);
const NOMI_OWN_NAME = new Set(['place', 'boundary', 'natural', 'tourism', 'leisure', 'mountain_pass', 'waterway', 'historic']);
function nominatimSettlementMatches(list){
  const rank = d => NOMI_SETTLEMENT.has(d.addresstype) || NOMI_SETTLEMENT.has(d.type) && d.class === 'place' ? 0
    : d.class === 'boundary' || d.addresstype === 'county' || d.addresstype === 'municipality' || d.addresstype === 'state_district' || d.addresstype === 'state' ? 2 : 1;
  return list.map((d, i) => ({ d, i, r: rank(d) })).sort((a, b) => a.r - b.r || a.i - b.i).map(({ d }) => {
    const addr = d.address || {};
    const own = d.name && (NOMI_OWN_NAME.has(d.class) || NOMI_SETTLEMENT.has(d.addresstype)) ? d.name : '';
    const short = cleanPlaceName(own || addr.city || addr.town || addr.village || addr.hamlet || addr.municipality || addr.suburb || addr.county || String(d.display_name || '').split(',')[0]);
    const region = [addr.state, addr.country].filter(Boolean).join(', ');
    return { name: short, full: region ? `${short} — ${region}` : short, lat: parseFloat(d.lat), lng: parseFloat(d.lon), country: addr.country || null, countryCode: addr.country_code ? addr.country_code.toUpperCase() : null };
  });
}

// Общий пересчёт точек маршрута. Раньше обновлялись только координаты, а страны
// оставались пустыми — из-за этого маршрут не попадал ни в поиск по стране,
// ни в паспорт, ни в список поездок страны.
async function refetchRouteWaypoints(entry, onProgress){
  const names = entry.waypointNames || [];
  const oldCoords = Array.isArray(entry.waypointCoords) ? entry.waypointCoords : [];
  const oldKeys = Array.isArray(entry.waypointCountryKeys) ? entry.waypointCountryKeys : [];
  const newCoords = [];
  const newKeys = [];
  let failCount = 0;
  let lastGoodCoord = null; // следующую точку ищем рядом с предыдущей найденной
  for(let i = 0; i < names.length; i++){
    if(onProgress) onProgress(i + 1, names.length);
    try{
      // Справочник — это города с населением, а геокодер на «Витебск» мог отдать
      // деревню под Воронежем. Если такой город в справочнике есть — берём его
      // (ближайший к предыдущей точке), к геокодеру идём только за остальными.
      const n0 = normSearch(names[i]);
      const exact = localCitySearch(names[i], 10, lastGoodCoord).filter(c => normSearch(c.name) === n0);
      if(lastGoodCoord) exact.sort((a, b) => Math.hypot(a.lat - lastGoodCoord[0], a.lng - lastGoodCoord[1]) - Math.hypot(b.lat - lastGoodCoord[0], b.lng - lastGoodCoord[1]));
      const matches = exact.length ? [cityAsMatch(exact[0])] : await queryNominatimSettlements(names[i], lastGoodCoord);
      if(matches.length > 0){
        const m = matches[0];
        newCoords.push([m.lat, m.lng]);
        newKeys.push(m.countryKey || findAnyCountryKeyByRuName(m.country, m.countryCode) || null);
        lastGoodCoord = [m.lat, m.lng];
      } else {
        // не нашли — оставляем прежние координаты, а не стираем их
        newCoords.push(oldCoords[i] || null); newKeys.push(oldKeys[i] || null); failCount++;
        if(oldCoords[i]) lastGoodCoord = oldCoords[i];
      }
      clearServiceIssue('поиск городов');
    }catch(err){
      newCoords.push(oldCoords[i] || null); newKeys.push(oldKeys[i] || null); failCount++;
      if(oldCoords[i]) lastGoodCoord = oldCoords[i];
      reportServiceIssue('поиск городов');
    }
  }
  entry.waypointCoords = newCoords;
  entry.waypointCountryKeys = newKeys;
  return { failCount, total: names.length };
}

async function refreshWaypointCoords(){
  if(READ_ONLY){ toast('Это read-only версия — редактирование недоступно'); return; }
  const entry = allEntries.find(e => e.id === editingId);
  if(!entry || entry.type !== 'route' || !entry.waypointNames || entry.waypointNames.length === 0) return;
  const btn = document.getElementById('refreshWaypointsBtn');
  const originalText = btn.textContent;
  btn.disabled = true;
  const res = await refetchRouteWaypoints(entry, (i, total)=>{
    btn.textContent = `Ищу точку ${i} из ${total}…`;
  });
  const failCount = res.failCount;
  btn.disabled = false;
  btn.textContent = originalText;
  const saved = await saveData();
  rebuildAll();
  if(saved){
    toast(failCount === 0
      ? 'Координаты точек маршрута обновлены'
      : `Обновлено. Не найдено ${failCount} из ${entry.waypointNames.length} — у них оставлены прежние координаты`);
  }
}
document.getElementById('refreshWaypointsBtn').addEventListener('click', refreshWaypointCoords);

async function fetchRouteCitySuggestions(q){
  try{
    // как только в маршруте есть хотя бы одна точка — ищем следующую рядом с ней,
    // а не «в вакууме», чтобы не подхватить одноимённый город на другом континенте
    const last = routeWaypoints[routeWaypoints.length - 1];
    const bias = last ? [last.lat, last.lng] : null;
    const seq = ++suggestSeq.routeCity;
    const quick = localCitySearch(q, 8, bias).map(cityAsMatch);
    if(quick.length){ routeCityMatches = quick; routeCityHlIndex = -1; renderRouteCitySuggestions(); }
    const res = await queryNominatimSettlements(q, bias).catch(err => { if(quick.length) return []; throw err; });
    if(seq !== suggestSeq.routeCity) return;
    routeCityMatches = mergeSettlementMatches(res, quick);
    routeCityHlIndex = -1;
    renderRouteCitySuggestions();
    clearServiceIssue('поиск городов');
  }catch(err){
    routeCitySuggestBox.innerHTML = `<div class="suggest-empty">Нет соединения — попробуйте позже</div>`;
    reportServiceIssue('поиск городов');
  }
}
function renderRouteCitySuggestions(){
  if(routeCityMatches.length === 0){
    routeCitySuggestBox.innerHTML = `<div class="suggest-empty">Ничего не найдено</div>`;
    routeCitySuggestBox.style.display = 'block';
    return;
  }
  routeCitySuggestBox.innerHTML = '';
  routeCityMatches.forEach((m,i)=>{
    const el = document.createElement('div');
    el.className = 'suggest-item' + (i === routeCityHlIndex ? ' hl' : '');
    el.textContent = m.full;
    el.addEventListener('click', ()=> addRouteWaypoint(m));
    routeCitySuggestBox.appendChild(el);
  });
  routeCitySuggestBox.style.display = 'block';
}

function addRouteWaypoint(m){
  routeWaypoints.push({ name: m.name, lat: m.lat, lng: m.lng, countryKey: (m.country || m.countryCode) ? findAnyCountryKeyByRuName(m.country, m.countryCode) : null });
  routeCitySearchInput.value = '';
  routeCitySuggestBox.style.display = 'none';
  renderRouteWaypoints();
}

function renderRouteWaypoints(){
  const container = document.getElementById('routeWaypointsList');
  if(routeWaypoints.length === 0){ container.innerHTML = ''; return; }
  container.innerHTML = routeWaypoints.map((w,i) => `
    <div class="waypoint-row">
      <span class="waypoint-index">${i+1}</span>
      <span class="waypoint-name">${escapeHtml(w.name)}</span>
      <div class="waypoint-actions">
        <button data-act="up" ${i===0 ? 'disabled' : ''} title="Выше" aria-label="Выше">↑</button>
        <button data-act="down" ${i===routeWaypoints.length-1 ? 'disabled' : ''} title="Ниже" aria-label="Ниже">↓</button>
        <button data-act="remove" title="Убрать" aria-label="Убрать">✕</button>
      </div>
    </div>
  `).join('');
  container.querySelectorAll('.waypoint-row').forEach((row,i)=>{
    row.querySelector('[data-act="up"]').addEventListener('click', ()=>{
      if(i === 0) return;
      [routeWaypoints[i-1], routeWaypoints[i]] = [routeWaypoints[i], routeWaypoints[i-1]];
      renderRouteWaypoints();
    });
    row.querySelector('[data-act="down"]').addEventListener('click', ()=>{
      if(i === routeWaypoints.length-1) return;
      [routeWaypoints[i+1], routeWaypoints[i]] = [routeWaypoints[i], routeWaypoints[i+1]];
      renderRouteWaypoints();
    });
    row.querySelector('[data-act="remove"]').addEventListener('click', ()=>{
      routeWaypoints.splice(i,1);
      renderRouteWaypoints();
    });
  });
}

async function fetchRoadRoute(waypoints){
  const coordsParam = waypoints.map(w => `${w.lng},${w.lat}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coordsParam}?overview=full&geometries=geojson`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try{
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if(!res.ok){ reportServiceIssue('маршрут по дорогам'); return null; }
    const data = await res.json();
    if(data.code !== 'Ok' || !data.routes || !data.routes[0]){ reportServiceIssue('маршрут по дорогам'); return null; }
    const coords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]); // GeoJSON [lng,lat] -> [lat,lng]
    if(coords.length < 2){ reportServiceIssue('маршрут по дорогам'); return null; }
    clearServiceIssue('маршрут по дорогам');
    return { coords: downsample(coords, 800), distanceKm: data.routes[0].distance / 1000 };
  }catch(err){
    clearTimeout(timeoutId);
    reportServiceIssue('маршрут по дорогам');
    return null;
  }
}

// ---------- secondary "click on map" mode toggles ----------
document.getElementById('showCountryMapMode').addEventListener('click', ()=>{
  const el = document.getElementById('countryMapMode');
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
});
document.getElementById('showCityMapMode').addEventListener('click', ()=>{
  const el = document.getElementById('cityMapMode');
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
});

// ---------- placing a city point ----------
document.getElementById('placeCityBtn').addEventListener('click', ()=>{
  placingCity = !placingCity;
  placingCountry = false;
  document.getElementById('placeCountryBtn').classList.remove('active');
  document.getElementById('placeCityBtn').classList.toggle('active', placingCity);
  document.getElementById('map').style.cursor = placingCity ? 'crosshair' : '';
  if(placingCity){ mnavShow('map'); toast('Кликните по карте, чтобы поставить точку города'); }
});

// ---------- placing / detecting a country ----------
document.getElementById('placeCountryBtn').addEventListener('click', ()=>{
  placingCountry = !placingCountry;
  placingCity = false;
  document.getElementById('placeCityBtn').classList.remove('active');
  document.getElementById('placeCountryBtn').classList.toggle('active', placingCountry);
  document.getElementById('map').style.cursor = placingCountry ? 'crosshair' : '';
  if(placingCountry){ mnavShow('map'); toast('Кликните внутри границ нужной страны'); }
});

map.on('click', handleMapClick);
function handleMapClick(e){
  if(quizMapActive()){ quizMapAnswer(e.latlng); return; } // идёт «Где это?»
  // Клик по кнопке внутри попапа доходил сюда, карта считала его кликом по
  // новому месту и открывала попап заново — «Что здесь?» выглядело как
  // произвольное перемещение по карте. Защита самого попапа оказалась
  // ненадёжной, поэтому отсекаем такие клики здесь, у источника.
  if(popupJustTouched()) return;
  const src = e.originalEvent && (e.originalEvent.target || e.originalEvent.srcElement);
  if(src && src.closest && src.closest('.leaflet-popup')) return;
  if(placingCity){
    pendingLatLng = e.latlng;
    pendingCityName = null;
    pendingCityCountryKey = null;
    document.getElementById('citySearch').value = '';
    setSelectedTag('citySelectedTag', `Точка: ${e.latlng.lat.toFixed(3)}, ${e.latlng.lng.toFixed(3)}`, clearCitySelection);
    if(!document.getElementById('fieldName').value.trim()){
      document.getElementById('fieldName').value = `Точка ${e.latlng.lat.toFixed(2)}, ${e.latlng.lng.toFixed(2)}`;
    }
    placingCity = false;
    document.getElementById('placeCityBtn').classList.remove('active');
    document.getElementById('map').style.cursor = '';
    mnavShow('add'); // точка поставлена — обратно к форме
    return;
  }
  if(placingCountry){
    const feature = findCountryFeature(e.latlng);
    if(!feature){
      toast('Страна не распознана — попробуйте кликнуть точнее по суше');
      return;
    }
    if(feature.properties.name === HOME_COUNTRY_KEY){
      toast('Россия — ваш домашний регион, отмечать её как посещённую не нужно. Отмечайте города и маршруты внутри неё.');
      placingCountry = false;
      document.getElementById('placeCountryBtn').classList.remove('active');
      document.getElementById('map').style.cursor = '';
      return;
    }
    const ru = COUNTRY_RU[feature.properties.name] || feature.properties.name;
    pendingCountryKey = feature.properties.name;
    document.getElementById('countrySearch').value = '';
    setSelectedTag('countrySelectedTag', ru, clearCountrySelection);
    if(!document.getElementById('fieldName').value.trim()){
      document.getElementById('fieldName').value = ru;
    }
    placingCountry = false;
    document.getElementById('placeCountryBtn').classList.remove('active');
    document.getElementById('map').style.cursor = '';
    mnavShow('add');
    return;
  }
  // no placing mode active and the click didn't land on one of our own entry
  // layers (those stop propagation) — identify whatever country is here,
  // visited or not, purely informational
  const feature = findCountryFeature(e.latlng);
  if(feature){
    openCountryPopup(feature.properties.name, e.latlng);
  }
}

// Попап страны: раньше был только справочным. Теперь показывает связанные
// поездки и позволяет сразу отметить страну или добавить внутри неё запись —
// клик по карте был тупиком, из которого приходилось идти в форму вручную.
// Проверка «пришло ли событие из попапа» по его цели оказалась ненадёжной:
// на касаниях Leaflet подменяет цель на слой карты, и клик по кнопке приходил
// как обычный клик по точке под ней. Поэтому отмечаем сам факт взаимодействия
// с попапом по времени — это не зависит ни от типа события, ни от того, как
// браузер разрешил цель.
let popupTouchedAt = 0;
function markPopupTouched(){ popupTouchedAt = Date.now(); }
function popupJustTouched(){ return Date.now() - popupTouchedAt < 800; }
function guardPopupClicks(root){
  if(!root) return;
  ['pointerdown','touchstart','mousedown','click'].forEach(ev=>{
    root.addEventListener(ev, markPopupTouched, true);
  });
}
// Попап пересоздаётся при каждом клике, поэтому состояние блоков храним снаружи
// и в localStorage: иначе пришлось бы раскрывать нужное заново каждый раз.
const CPOP_SECTIONS_KEY = 'travel-map-cpop-sections';
let cpopOpen = (()=>{
  try{ return JSON.parse(localStorage.getItem(CPOP_SECTIONS_KEY) || 'null') || { info:false, trips:true, add:true }; }
  catch(e){ return { info:false, trips:true, add:true }; }
})();
function saveCpopSections(){
  try{ localStorage.setItem(CPOP_SECTIONS_KEY, JSON.stringify(cpopOpen)); }catch(e){}
}
function cpopSection(id, title, inner){
  const open = !!cpopOpen[id];
  return `<div class="cpop-sec${open ? '' : ' closed'}" data-cpop-sec="${id}">
      <span>${escapeHtml(title)}</span><span class="cpop-chev">▾</span>
    </div>
    <div class="cpop-secbody" data-cpop-body="${id}" style="${open ? '' : 'display:none;'}">${inner}</div>`;
}

function openCountryPopup(key, latlng){
  const ruName = COUNTRY_RU[key] || key;
  const flag = countryFlag(key);
  const isHome = key === HOME_COUNTRY_KEY;

  const own = allEntries.filter(e => e.countryKey === key);
  const visited = own.filter(e => e.type === 'country' && e.status !== 'wishlist');
  const planned = own.filter(e => e.type === 'country' && e.status === 'wishlist');
  const cities = own.filter(e => e.type === 'city');
  // поездки, связанные со страной, — включая маршруты, проходящие по ней
  const tripNames = new Set();
  own.forEach(e => { if(e.trip) tripNames.add(e.trip); });
  allEntries.forEach(e=>{
    if(e.type === 'route' && e.trip && (e.waypointCountryKeys || []).includes(key)) tripNames.add(e.trip);
  });
  // свежие поездки сверху: по последней дате записи поездки
  const tripLast = new Map();
  allEntries.forEach(e => { if(e.trip && tripNames.has(e.trip)){ const t = (e.year || 0) * 12 + (e.month || 0); if(t > (tripLast.get(e.trip) || -1)) tripLast.set(e.trip, t); } });
  const trips = [...tripNames].sort((a,b)=> (tripLast.get(b) || 0) - (tripLast.get(a) || 0) || a.localeCompare(b,'ru'));

  const years = [...new Set(visited.map(e => e.year).filter(Boolean))].sort((a,b)=>a-b);
  const statusLine = isHome
    ? 'Домашний регион — отмечать посещение не нужно'
    : visited.length ? `Посещено${years.length ? ': ' + years.join(', ') : ''}`
    : planned.length ? 'В планах' : 'Пока не отмечена';

  const parts = [];
  parts.push(`<div class="cpop">`);
  parts.push(`<div class="cpop-flag">${flag}</div>`);
  parts.push(`<b class="cpop-name">${escapeHtml(ruName)}</b>`);
  parts.push(`<div class="cpop-status">${escapeHtml(statusLine)}</div>`);
  // Ближайший населённый пункт спрашиваем у геокодера по требованию: встроить
  // справочник городов в файл нельзя — он весит мегабайты против 200 КБ границ.
  parts.push(`<div class="cpop-place" id="cpopPlace"><button class="cpop-place-btn" data-cpop-act="where">Что здесь?</button></div>`);
  if(cities.length) parts.push(`<div class="cpop-status">Городов отмечено: ${cities.length}</div>`);
  if(isHome) parts.push(ruRegionPopupHtml(latlng));

  const info = buildCountryInfoHtml(key);
  if(info) parts.push(cpopSection('info', 'О стране', info));

  if(trips.length){
    const SHOW = 6;
    const btn = (t, i) => `<button class="cpop-trip${i >= SHOW ? ' cpop-more-item' : ''}" data-cpop-trip="${escapeAttr(t)}"${i >= SHOW ? ' style="display:none;"' : ''}>${escapeHtml(t)}</button>`;
    parts.push(cpopSection('trips', `Поездки · ${trips.length}`,
      `<div class="cpop-trips">${trips.map(btn).join('')}${trips.length > SHOW ? `<button class="cpop-trip cpop-more" data-cpop-act="moretrips">ещё ${trips.length - SHOW} ▾</button>` : ''}</div>`));
  }

  if(!READ_ONLY){
    const acts = [];
    if(!isHome && visited.length === 0){
      acts.push(`<button class="cpop-btn" data-cpop-act="visited">Отметить посещённой</button>`);
      if(planned.length === 0) acts.push(`<button class="cpop-btn" data-cpop-act="wishlist">Хочу посетить</button>`);
    }
    acts.push(`<button class="cpop-btn" data-cpop-act="city">+ город</button>`);
    acts.push(`<button class="cpop-btn" data-cpop-act="route">+ маршрут</button>`);
    parts.push(cpopSection('add', 'Добавить', `<div class="cpop-actions">${acts.join('')}</div>`));
  }
  parts.push(`</div>`);

  const popup = L.popup({
      closeButton: true, minWidth: 210, maxWidth: 280,
      // содержимое меняется на месте (например, при определении места), и
      // автоматическая подгонка вида двигала бы карту прямо под пальцем
      autoPan: true, autoPanPadding: [20, 20], keepInView: false
    })
    .setLatLng(latlng)
    .setContent(parts.join(''))
    .openOn(map);

  // Без этого нажатие на кнопку внутри попапа доходило до карты, та считала
  // его кликом по новому месту и открывала попап заново — «Что здесь?»
  // выглядело как простое смещение по карте.
  const el = popup.getElement && popup.getElement();
  if(el){
    L.DomEvent.disableClickPropagation(el);
    L.DomEvent.disableScrollPropagation(el);
    guardPopupClicks(el);
  }
  // на случай, если элемент попапа ещё не готов в момент открытия
  setTimeout(()=>{
    const later = popup.getElement && popup.getElement();
    if(later) guardPopupClicks(later);
    document.querySelectorAll('.leaflet-popup').forEach(guardPopupClicks);
  }, 0);

  // обработчики навешиваем после отрисовки содержимого попапа
  setTimeout(()=>{
    document.querySelectorAll('[data-cpop-trip]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        map.closePopup();
        openTripPage(btn.dataset.cpopTrip);
      });
    });
    document.querySelectorAll('[data-cpop-act]').forEach(btn=>{
      ['pointerdown','touchstart','mousedown'].forEach(ev => btn.addEventListener(ev, markPopupTouched, true));
      btn.addEventListener('click', (ev)=>{
        markPopupTouched();
        if(ev.preventDefault) ev.preventDefault();
        if(ev.stopPropagation) ev.stopPropagation();
        handleCountryPopupAction(btn.dataset.cpopAct, key, latlng);
      });
    });
    document.querySelectorAll('[data-cpop-sec]').forEach(head=>{
      head.addEventListener('click', ()=>{
        const id = head.dataset.cpopSec;
        const bodyEl = document.querySelector(`[data-cpop-body="${id}"]`);
        cpopOpen[id] = !cpopOpen[id];
        head.classList.toggle('closed', !cpopOpen[id]);
        if(bodyEl) bodyEl.style.display = cpopOpen[id] ? '' : 'none';
        saveCpopSections();
      });
    });
  }, 0);
}

async function lookupPlaceHere(latlng, key){
  const box = document.getElementById('cpopPlace');
  if(!box) return;
  markPopupTouched();
  box.innerHTML = `<span class="cpop-place-wait">определяю…</span>`;
  try{
    const r = await reverseGeocode(latlng.lat, latlng.lng);
    if(!r){ box.innerHTML = `<span class="cpop-place-wait">рядом ничего не найдено</span>`; return; }
    const sameCountry = !r.countryKey || r.countryKey === key;
    box.innerHTML = `<div class="cpop-place-name">${escapeHtml(r.name)}</div>` +
      (sameCountry ? '' : `<div class="cpop-place-wait">по данным сервиса: ${escapeHtml(COUNTRY_RU[r.countryKey] || r.countryKey)}</div>`) +
      (READ_ONLY ? '' : `<button class="cpop-btn" data-cpop-place-add="1">+ добавить как город</button>`);
    const add = box.querySelector('[data-cpop-place-add]');
    if(add){
      add.addEventListener('click', ()=>{
        map.closePopup();
        exitEditMode(true);
        const typeBtn = document.querySelector('.type-btn[data-type="city"]');
        if(typeBtn) typeBtn.click();
        pendingLatLng = latlng;
        pendingCityCountryKey = r.countryKey || key;
        const sel = document.getElementById('fieldCityCountry');
        if(sel) sel.value = r.countryKey || key;
        const nameField = document.getElementById('fieldName');
        if(nameField) nameField.value = r.name;
        setSelectedTag('citySelectedTag', `${r.name}: ${latlng.lat.toFixed(3)}, ${latlng.lng.toFixed(3)}`, clearCitySelection);
        const section = document.getElementById('addEntrySection');
        if(section && section.classList.contains('collapsed')) section.classList.remove('collapsed');
        mnavShow('add');
        if(nameField) nameField.scrollIntoView({ block:'center' });
        toast(`Проверьте год и остальные поля для «${r.name}»`);
      });
    }
    clearServiceIssue('поиск городов');
  }catch(err){
    box.innerHTML = `<span class="cpop-place-wait">нет соединения — попробуйте позже</span>`;
    reportServiceIssue('поиск городов');
  }
}

async function handleCountryPopupAction(act, key, latlng){
  if(act === 'moretrips'){
    document.querySelectorAll('.cpop-more-item').forEach(b => { b.style.display = ''; });
    document.querySelectorAll('[data-cpop-act="moretrips"]').forEach(b => b.remove());
    return;
  }
  if(act === 'where'){ await lookupPlaceHere(latlng, key); return; }
  const ruName = COUNTRY_RU[key] || key;
  map.closePopup();
  if(act === 'visited' || act === 'wishlist'){
    const entry = {
      id: genId(), type: 'country', name: ruName, countryKey: key,
      year: new Date().getFullYear(), month: undefined,
      photos: [], notes: '', purpose: 'tourism',
      color: DEFAULT_COLOR.country,
      status: act === 'wishlist' ? 'wishlist' : 'visited', favorite: false
    };
    allEntries.push(entry);
    recordBulkAction(act === 'wishlist' ? 'страну в планах' : 'отметку страны', null, [], [entry.id]);
    const saved = await saveData();
    rebuildAll();
    if(saved) showUndoToast(`${ruName}: ${act === 'wishlist' ? 'в планах' : 'отмечена посещённой'}. Год и месяц можно уточнить`);
    return;
  }
  if(act === 'where'){ return; } // обрабатывается отдельно, попап не закрываем
  // город или маршрут — открываем форму, подставив страну и место клика
  exitEditMode(true);
  // переключаем тип через саму кнопку — она уже умеет показывать нужные поля
  const typeBtn = document.querySelector(`.type-btn[data-type="${act === 'city' ? 'city' : 'route'}"]`);
  if(typeBtn) typeBtn.click();
  if(act === 'city'){
    pendingLatLng = latlng;
    pendingCityCountryKey = key;
    const sel = document.getElementById('fieldCityCountry');
    if(sel) sel.value = key;
    setSelectedTag('citySelectedTag', `${ruName}: ${latlng.lat.toFixed(3)}, ${latlng.lng.toFixed(3)}`, clearCitySelection);
  }
  const section = document.getElementById('addEntrySection');
  if(section && section.classList.contains('collapsed')) section.classList.remove('collapsed');
  mnavShow('add');
  const nameField = document.getElementById('fieldName');
  if(nameField){ nameField.focus(); nameField.scrollIntoView({ block:'center' }); }
  toast(act === 'city' ? `Добавьте город в стране «${ruName}»` : `Добавьте маршрут — точки задайте поиском`);
}

