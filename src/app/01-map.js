let map = L.map('map', {worldCopyJump:true});
const WORLD_VIEW_BOUNDS = [[-58, -170], [78, 170]];
map.fitBounds(WORLD_VIEW_BOUNDS);

// OpenStreetMap обновил правила использования плиток и стал отдавать вместо
// карты картинку «Access blocked». Причин у нас было три:
//  1) адрес вида {s}.tile.openstreetmap.org — обращение мимо их CDN;
//     правильный адрес без поддоменов: tile.openstreetmap.org;
//  2) отсутствовал заголовок Referer — он теперь обязателен. Leaflet 1.9.4
//     сам его не выставляет (это появилось в версиях после мая 2026),
//     поэтому задаём referrerPolicy явно;
//  3) при открытии файла с диска Referer не существует в принципе — там
//     плитки OSM работать не будут никогда, см. переключение ниже.
// Страница открыта с настоящего сайта (http/https), а не файлом с диска, не
// встроенным предпросмотром (about:srcdoc), не blob: и т. п. Только тогда есть
// Referer для подложки, работают относительные адреса (файлы границ) и кэш.
const SERVED_OVER_HTTP = /^https?:$/.test(location.protocol);
const TILE_REFERRER = 'strict-origin-when-cross-origin';
const streetLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 18,
  referrerPolicy: TILE_REFERRER,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
});
const topoLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
  maxZoom: 17,
  referrerPolicy: TILE_REFERRER,
  attribution: 'Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap (CC-BY-SA)'
});
streetLayer.addTo(map);

// Подложка грузится с внешних серверов, а они в некоторых странах блокируются —
// пользователь видит вместо карты плитки с ошибкой. Но вся геометрия стран уже
// зашита в файл, поэтому карту можно рисовать без подложки вовсе: контуры на
// бумажном фоне. Это не запасной вариант «на крайний случай», а полноценный
// режим, работающий вообще без интернета.
let plainBaseLayer = null;
let basemapMode = 'street'; // street | topo | plain

function buildPlainBaseLayer(){
  if(plainBaseLayer) return plainBaseLayer;
  plainBaseLayer = L.geoJSON(COUNTRIES_GEOJSON, {
    style: { color: '#B8A98A', weight: 0.7, fillColor: '#EFE7D2', fillOpacity: 1, interactive: false, className: 'plain-land' },
    interactive: false
  });
  return plainBaseLayer;
}

function setBasemap(mode){
  [streetLayer, topoLayer].forEach(l => { if(map.hasLayer(l)) map.removeLayer(l); });
  if(plainBaseLayer && map.hasLayer(plainBaseLayer)) map.removeLayer(plainBaseLayer);
  basemapMode = mode;
  if(mode === 'plain'){
    buildPlainBaseLayer().addTo(map);
    if(plainBaseLayer.bringToBack) plainBaseLayer.bringToBack();
    document.getElementById('map').classList.add('plain-base');
  } else {
    document.getElementById('map').classList.remove('plain-base');
    (mode === 'topo' ? topoLayer : streetLayer).addTo(map);
  }
  const btn = document.getElementById('topoToggleBtn');
  if(btn){
    btn.classList.toggle('active', mode !== 'street');
    btn.textContent = mode === 'plain' ? '📄 Контуры' : mode === 'topo' ? '🏔 Рельеф' : '🏔 Рельеф';
    btn.title = mode === 'plain' ? 'Карта без подложки — работает без интернета' :
                mode === 'topo' ? 'Рельефная карта' : 'Переключить на рельефную карту';
  }
  try{ localStorage.setItem('travel-map-basemap', mode); }catch(e){}
  try{ if(mode !== 'plain') mapLabelLayer.clearLayers(); scheduleMapLabels(); }catch(e){} // до объявления слоя подписей — просто пропускаем
}

// Плитки не загрузились — скорее всего подложка недоступна: сеть, блокировка
// или сбой сервера. Переключаемся на контуры, а не оставляем битую картинку.
let tileErrorCount = 0;
let tileFallbackDone = false;
[streetLayer, topoLayer].forEach(layer=>{
  // считаем только сбои подряд: любой загрузившийся тайл значит, что подложка
  // жива. Раньше шесть случайных осечек за всю сессию на неровной мобильной
  // сети молча переключали карту на контуры
  layer.on('tileload', ()=>{ tileErrorCount = 0; });
  layer.on('tileerror', ()=>{
    if(tileFallbackDone || basemapMode === 'plain') return;
    tileErrorCount++;
    // одна-две осечки бывают и при нормальной работе; реагируем на устойчивый отказ
    if(tileErrorCount >= 6){
      tileFallbackDone = true;
      setBasemap('plain');
      toast('Подложка карты недоступна — включены контуры стран. Переключить обратно можно кнопкой на карте');
    }
  });
});

// make sure Leaflet recalculates size once the container has real dimensions,
// then re-fit to the world view so the default scale is correct on any screen
setTimeout(()=>{
  map.invalidateSize();
  map.fitBounds(WORLD_VIEW_BOUNDS);
}, 150);
window.addEventListener('resize', ()=> map.invalidateSize());

document.getElementById('topoToggleBtn').addEventListener('click', ()=>{
  // по кругу: обычная → рельеф → контуры без подложки
  const next = basemapMode === 'street' ? 'topo' : basemapMode === 'topo' ? 'plain' : 'street';
  tileErrorCount = 0;
  tileFallbackDone = false;
  setBasemap(next);
});

// разворачивание карты на весь экран
function setMapFullscreen(on){
  document.body.classList.toggle('map-full', on);
  const btn = document.getElementById('mapFullBtn');
  if(btn){
    btn.textContent = on ? '⤡' : '⤢';
    const label = on ? 'Свернуть карту обратно' : 'Развернуть карту на весь экран';
    btn.title = label;
    btn.setAttribute('aria-label', label);
  }
  // Leaflet кэширует размеры контейнера: без пересчёта карта останется
  // прежнего размера и с серыми пустотами по краям
  setTimeout(()=>{ try{ map.invalidateSize(); }catch(e){} }, 60);
}
document.getElementById('mapFullBtn').addEventListener('click', ()=>{
  setMapFullscreen(!document.body.classList.contains('map-full'));
});
document.addEventListener('keydown', (e)=>{
  if(e.key === 'Escape' && document.body.classList.contains('map-full')) setMapFullscreen(false);
});

let cityCluster;
try{
  cityCluster = L.markerClusterGroup({
    maxClusterRadius: 45,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true,
    iconCreateFunction: function(cluster){
      const count = cluster.getChildCount();
      // Значки уменьшены: на общей карте прежние 30-46 px закрывали целые страны.
      // Светлый ореол тоже ужат с 3 до 2 px — он добавлялся к видимому размеру.
      const size = count < 10 ? 22 : count < 50 ? 27 : 32;
      const fontSize = count < 10 ? 10 : count < 50 ? 11 : 11.5;
      return L.divIcon({
        html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:#3F5240;border:1.5px solid #2B3B2E;display:flex;align-items:center;justify-content:center;color:#F3ECD8;font-family:'Twemoji Country Flags','Courier Prime',monospace;font-weight:700;font-size:${fontSize}px;box-shadow:0 0 0 2px rgba(231,223,199,0.7);">${count}</div>`,
        className: '',
        iconSize: [size, size]
      });
    }
  });
}catch(err){
  // markercluster plugin failed to load — fall back to a plain layer group.
  // City markers still work, just without visual clustering, and the rest
  // of the app keeps functioning instead of crashing entirely.
  cityCluster = L.layerGroup();
  setTimeout(function(){
    if(typeof reportServiceIssue === 'function') reportServiceIssue('кластеризация точек на карте');
  }, 0);
}
cityCluster.addTo(map);
cityCluster.on('clusterclick', (e) => L.DomEvent.stopPropagation(e));

let allEntries = [];
let layers = {}; // id -> leaflet layer
// Маршруты — в своей панели поверх заливок стран и дома: раньше нажатие на линию
// внутри России открывало карточку страны, потому что контур России лежал сверху.
// Рисуем на canvas с запасом в 8 пикселей вокруг линии — в тонкий трек на
// телефоне иначе не попасть пальцем.
map.createPane('routePane'); map.getPane('routePane').style.zIndex = 420;
const routeRenderer = L.canvas({ pane: 'routePane', tolerance: 8, padding: 0.3 });
// Остановки маршрутов — точками на карте (если у города нет своей отметки)
const routeStopsLayer = L.layerGroup().addTo(map);
let currentType = 'country';

let placingCity = false;
let pendingLatLng = null;
let pendingCityName = null;
let pendingCityCountry = null;
let pendingCityCountryCode = null;
let pendingCityCountryKey = null;

let placingCountry = false;
let pendingCountryKey = null;

const COUNTRY_LIST = Object.keys(COUNTRY_RU)
  .map(key => ({ key, ru: COUNTRY_RU[key] }))
  .sort((a,b) => a.ru.localeCompare(b.ru, 'ru'));

const HOME_COUNTRY_KEY = 'Russia';
const HOME_COLOR = '#6E7A8A';
const COUNTRY_LIST_SELECTABLE = COUNTRY_LIST.filter(c => c.key !== HOME_COUNTRY_KEY);
// ISO-код надёжнее сопоставления по переведённому названию: Nominatim иногда
// возвращает официальную полную форму («Южно-Африканская Республика»), а у нас
// в переводах — принятое короткое название («ЮАР») — по названию совпадения не
// будет, а по коду ZA/ZA — всегда однозначно
const ISO_TO_COUNTRY_KEY = {};
(function buildIsoIndex(){
  // некоторым непризнанным территориям в исходных данных присвоен код
  // родительской страны. Площадь тут не помогает: у Северного Кипра охват шире
  // из-за длинного полуострова Карпасия, поэтому нужен явный список
  const CANONICAL = { 'SO':'Somalia', 'CY':'Cyprus' };
  Object.entries(COUNTRY_ISO).forEach(([key, code])=>{
    if(!code) return;
    const c = code.toUpperCase();
    if(CANONICAL[c]){ ISO_TO_COUNTRY_KEY[c] = CANONICAL[c]; return; }
    if(!ISO_TO_COUNTRY_KEY[c]) ISO_TO_COUNTRY_KEY[c] = key;
  });
})();

const PURPOSES = [
  { key: 'tourism', ru: 'Туризм' },
  { key: 'transit', ru: 'Транзит' },
  { key: 'sport', ru: 'Спорт' },
  { key: 'business', ru: 'Бизнес' }
];
const COMPANIES = [
  { key: 'alone', ru: 'Один' },
  { key: 'couple', ru: 'С парой' },
  { key: 'group', ru: 'Сообщество' },
  { key: 'friends', ru: 'Друзья' },
  { key: 'parents', ru: 'Родители' }
];
const COMMUNITIES = [
  { key: 'sila_territorii', ru: 'Сила Территории' },
  { key: 'power_of_running', ru: 'Power of Running' },
  { key: 'route_community', ru: 'Route Community' }
];
const SEASONS = [
  { key: 'winter', ru: 'Зима' },
  { key: 'spring', ru: 'Весна' },
  { key: 'summer', ru: 'Лето' },
  { key: 'autumn', ru: 'Осень' }
];
const MONTHS = [
  { key: 1, ru: 'Январь', short: 'янв' },
  { key: 2, ru: 'Февраль', short: 'фев' },
  { key: 3, ru: 'Март', short: 'мар' },
  { key: 4, ru: 'Апрель', short: 'апр' },
  { key: 5, ru: 'Май', short: 'май' },
  { key: 6, ru: 'Июнь', short: 'июн' },
  { key: 7, ru: 'Июль', short: 'июл' },
  { key: 8, ru: 'Август', short: 'авг' },
  { key: 9, ru: 'Сентябрь', short: 'сен' },
  { key: 10, ru: 'Октябрь', short: 'окт' },
  { key: 11, ru: 'Ноябрь', short: 'ноя' },
  { key: 12, ru: 'Декабрь', short: 'дек' }
];
const ACTIVITIES = [
  { key: 'running', ru: 'Бег' },
  { key: 'hiking', ru: 'Хайкинг' },
  { key: 'cycling', ru: 'Вело' },
  { key: 'roadtrip', ru: 'Автотрип' }
];
const STATUSES = [
  { key: 'visited', ru: 'Посещено' },
  { key: 'wishlist', ru: 'Хочу посетить' }
];
const DEFAULT_COLOR = { country: '#A6592E', city: '#3F5240', route: '#3F5240' };
// готовые цвета в палитре формы — в тон карте
const COLOR_PRESETS = ['#A6592E', '#3F5240', '#4F6A86', '#B8862B', '#7A3E5A', '#2E6F73'];
document.getElementById('colorSwatches').addEventListener('click', e => { const b = e.target.closest('[data-color]'); if(b) setFieldColor(b.dataset.color); });
document.getElementById('fieldColor').addEventListener('input', () => renderColorSwatches());
setTimeout(() => renderColorSwatches(), 0);
function setFieldColor(v){ const el = document.getElementById('fieldColor'); if(el){ el.value = v; renderColorSwatches(); } }
function renderColorSwatches(){
  const box = document.getElementById('colorSwatches');
  const input = document.getElementById('fieldColor');
  if(!box || !input) return;
  const type = (typeof currentType !== 'undefined' && currentType) || 'country';
  const def = DEFAULT_COLOR[type] || '#3F5240';
  const cur = (input.value || '').toLowerCase();
  const presets = COLOR_PRESETS.filter(c => c.toLowerCase() !== def.toLowerCase());
  box.innerHTML = `<button type="button" class="color-sw is-default" role="radio" data-color="${def}" style="--sw:${def};" aria-checked="${cur === def.toLowerCase()}" title="Цвет по умолчанию для этого типа">по умолчанию</button>` +
    presets.map(c => `<button type="button" class="color-sw" role="radio" data-color="${c}" style="background:${c};" aria-checked="${cur === c.toLowerCase()}" aria-label="Цвет ${c}"></button>`).join('');
  const dl = document.getElementById('colorPresets');
  if(dl) dl.innerHTML = [def, ...presets].map(c => `<option value="${c}"></option>`).join('');
}
const HOME_LOCATION = { name: 'Москва, Россия', lat: 55.7558, lng: 37.6173 };
const HOME_CITY_NAME = HOME_LOCATION.name.split(',')[0].trim();
const CONTINENT_ORDER = ['Европа','Азия','Африка','Северная Америка','Южная Америка','Австралия и Океания','Антарктида'];
const CONTINENT_TOTALS = (()=>{
  const totals = {};
  Object.values(COUNTRY_CONTINENT).forEach(c => { totals[c] = (totals[c] || 0) + 1; });
  return totals;
})();
const COUNTRY_GEOMETRY_INDEX = (()=>{
  const idx = {};
  COUNTRIES_GEOJSON.features.forEach(f => { idx[f.properties.name] = f.geometry; });
  return idx;
})();

function isoToFlagEmoji(iso){
  if(!iso || iso.length !== 2) return '';
  return String.fromCodePoint(...[...iso.toUpperCase()].map(c => 127397 + c.charCodeAt(0)));
}
const COUNTRY_FLAG_INDEX = (()=>{
  const idx = {};
  Object.keys(COUNTRY_ISO).forEach(key => { idx[key] = isoToFlagEmoji(COUNTRY_ISO[key]); });
  return idx;
})();
function countryFlag(key){
  return COUNTRY_FLAG_INDEX[key] || '';
}

// выпадающий список стран для города — заполняется один раз при загрузке
(function fillCityCountrySelect(){
  const sel = document.getElementById('fieldCityCountry');
  if(!sel) return;
  const opts = COUNTRY_LIST.slice().sort((a,b) => a.ru.localeCompare(b.ru, 'ru'));
  sel.innerHTML = `<option value="">— не указана —</option>` +
    opts.map(c => `<option value="${escapeAttr(c.key)}">${escapeHtml((countryFlag(c.key) ? countryFlag(c.key) + ' ' : '') + c.ru)}</option>`).join('');
})();

function formatCapitalTime(tz){
  try{
    const now = new Date();
    const timeStr = new Intl.DateTimeFormat('ru-RU', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(now);
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(now);
    const offset = parts.find(p => p.type === 'timeZoneName');
    return offset ? `${timeStr}, ${offset.value}` : timeStr;
  }catch(e){
    return '';
  }
}

function buildCountryInfoHtml(key){
  const info = COUNTRY_INFO[key];
  if(!info) return '';
  const timeStr = formatCapitalTime(info.tz);
  return `<div style="margin-top:7px;padding-top:7px;border-top:1px solid rgba(120,110,80,0.25);font-size:11.5px;color:var(--text-dim);text-align:left;line-height:1.7;">
    <div>Столица: <b style="color:var(--text);">${escapeHtml(info.capital)}</b>${timeStr ? `<br>Сейчас там: ${timeStr}` : ''}</div>
    <div>Язык: ${escapeHtml(info.lang)}</div>
    <div>Валюта: ${escapeHtml(info.currency)}</div>
  </div>`;
}

function debounce(fn, delay){
  let timer = null;
  return function(...args){
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

