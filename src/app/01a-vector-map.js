// ---------- Подложка «Подробная»: векторная карта OpenFreeMap (D1) ----------
// Вместо картинок-плиток сервер присылает данные (дороги, реки, здания,
// названия), а рисует их браузер (MapLibre GL, WebGL). Поэтому карта резкая на
// любом масштабе, подписи — по-русски (src/lib/vector-map.js), а стиль следует
// теме приложения. Встроена в Leaflet как обычная подложка (мост
// maplibre-gl-leaflet), так что метки, маршруты и всё остальное — как раньше.
//
// Библиотека тяжёлая (~1,6 МБ), поэтому грузится только при выборе этой
// подложки — из своей папки vendor/ (копируется при сборке из npm). Без WebGL
// или без сети (и без сохранённого стиля) возвращаемся на обычную подложку.
// Скачивание района для работы без сети — в разделе «Карта без сети».

const MAPLIBRE_DIR = 'vendor/maplibre-gl-6.16.0/';
const MAPLIBRE_LEAFLET = 'vendor/leaflet-maplibre-gl-0.1.4.js';
const VECTOR_ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

let maplibreLoading = null;
let vectorLayer = null;
let vectorStyleTheme = null;

// есть ли WebGL — без него MapLibre не рисует
function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch (e) {
    return false; // нет canvas — нет и WebGL
  }
}

// адрес своего файла относительно страницы (у версии для друзей — на уровень выше)
const vendorUrl = rel => new URL((READ_ONLY ? '../' : '') + rel, location.href).href;

function loadMaplibre() {
  if (window.maplibregl && L.maplibreGL) return Promise.resolve(true);
  if (maplibreLoading) return maplibreLoading;
  maplibreLoading = (async () => {
    // стили библиотеки
    if (!document.getElementById('maplibreCss')) {
      const link = document.createElement('link');
      link.id = 'maplibreCss';
      link.rel = 'stylesheet';
      link.href = vendorUrl(MAPLIBRE_DIR + 'maplibre-gl.css');
      document.head.appendChild(link);
    }
    // сама библиотека — модуль; её фоновый обработчик (maplibre-gl-worker.mjs)
    // она найдёт рядом с собой
    const mod = await import(/* @vite-ignore */ vendorUrl(MAPLIBRE_DIR + 'maplibre-gl.mjs'));
    window.maplibregl = mod.default || mod;
    // мост Leaflet ↔ MapLibre — обычный скрипт, ждёт L и maplibregl
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = vendorUrl(MAPLIBRE_LEAFLET);
      s.onload = resolve;
      s.onerror = () => reject(new Error('не загрузился мост Leaflet ↔ MapLibre'));
      document.head.appendChild(s);
    });
    if (!L.maplibreGL) throw new Error('мост Leaflet ↔ MapLibre не появился');
    return true;
  })();
  maplibreLoading.catch(() => {
    maplibreLoading = null;
  });
  return maplibreLoading;
}

const currentThemeName = () => (document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');

// стиль с русскими подписями; без сети — из кэша (его хранит сервис-воркер)
async function fetchVectorStyle(theme) {
  const res = await fetch(vectorStyleUrl(theme));
  if (!res.ok) throw new Error('стиль карты: ' + res.status);
  return russifyStyle(await res.json());
}

// Включить «Подробную». Вернёт false, если не вышло (тогда вызывающий
// переключит на запасную подложку).
async function showVectorBasemap() {
  if (!hasWebGL()) throw new Error('нет WebGL');
  await loadMaplibre();
  const theme = currentThemeName();
  const style = await fetchVectorStyle(theme);
  if (basemapMode !== 'vector') return; // пока грузилось, выбрали другую подложку
  if (!vectorLayer) {
    // подпись источников — своя (мост берёт её из attributionControl.customAttribution)
    vectorLayer = L.maplibreGL({ style, attributionControl: { customAttribution: VECTOR_ATTRIBUTION }, interactive: false });
    vectorStyleTheme = theme;
  } else if (vectorStyleTheme !== theme) {
    vectorLayer.getMaplibreMap().setStyle(style);
    vectorStyleTheme = theme;
  }
  if (!map.hasLayer(vectorLayer)) vectorLayer.addTo(map);
  watchVectorErrors();
}
function hideVectorBasemap() {
  if (vectorLayer && map.hasLayer(vectorLayer)) map.removeLayer(vectorLayer);
}

// Плитки не грузятся подряд (сеть пропала, сервис недоступен) — так же, как с
// обычной подложкой, переключаемся на контуры, а не оставляем пустой фон
let vectorErrors = 0;
let vectorErrorsWatched = false;
function watchVectorErrors() {
  if (vectorErrorsWatched || !vectorLayer) return;
  const ml = vectorLayer.getMaplibreMap();
  if (!ml) return;
  vectorErrorsWatched = true;
  ml.on('data', e => {
    if (e.dataType === 'source' && e.tile) vectorErrors = 0;
  });
  ml.on('error', e => {
    if (basemapMode !== 'vector' || tileFallbackDone) return;
    if (++vectorErrors >= 6) {
      tileFallbackDone = true;
      setBasemap('plain');
      toast('Подробная карта недоступна — включены контуры стран. Переключить обратно можно кнопкой на карте');
    }
    logError('подробная карта', (e && e.error) || e);
  });
}

// тема поменялась — у «Подробной» свой стиль для тёмной темы
new MutationObserver(() => {
  if (basemapMode !== 'vector' || !vectorLayer || vectorStyleTheme === currentThemeName()) return;
  showVectorBasemap().catch(e => logError('подробная карта: смена темы', e));
}).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

// ---------- «Карта без сети»: скачать район подробной карты ----------
// Страница сама кладёт плитки в хранилище, которое сервис-воркер отдаёт без
// сети и не вытесняет. Ограничения OpenFreeMap на одно скачивание — не больше
// 3000 плиток и 50 МБ и не больше 4 запросов разом; мы их соблюдаем.
const VECTOR_SAVED_CACHE = 'travel-map-vector-saved-v1';
const OFFLINE_MAX_TILES = 3000;
// let, а не const: тест уменьшает предел, чтобы проверить частичное скачивание
let OFFLINE_MAX_BYTES = 50 * 1024 * 1024;
const OFFLINE_PARALLEL = 4;
const OFFLINE_META_KEY = 'travel-map-offline-map';
let offlineJob = null; // идёт скачивание: { cancel: bool }

function offlineMeta() {
  try {
    const v = JSON.parse(prefGet(OFFLINE_META_KEY) || 'null');
    return v && typeof v.tiles === 'number' ? v : null;
  } catch (e) {
    return null; // испорчено — как будто ничего не скачано
  }
}
const mb = b => (b / 1024 / 1024).toFixed(b < 10 * 1024 * 1024 ? 1 : 0).replace('.', ',') + ' МБ';

function renderOfflineMapSection(progress) {
  const status = document.getElementById('offlineMapStatus');
  const dl = document.getElementById('offlineMapDownloadBtn');
  const clear = document.getElementById('offlineMapClearBtn');
  if (!status || !dl) return;
  const canCache = SERVED_OVER_HTTP && typeof caches !== 'undefined';
  if (!canCache) {
    status.textContent = 'Скачивание работает только на сайте (не из файла с диска).';
    dl.disabled = true;
    return;
  }
  const meta = offlineMeta();
  if (offlineJob) {
    status.textContent = progress || 'Скачивание…';
    dl.textContent = 'Остановить';
    dl.disabled = false;
  } else {
    status.textContent = meta
      ? `Скачано: ${meta.tiles.toLocaleString('ru-RU')} плиток, ${mb(meta.bytes)}${meta.area ? ' — ' + meta.area : ''}.`
      : basemapMode === 'vector'
        ? 'Ничего не скачано. Подведите карту к нужному району и нажмите кнопку.'
        : 'Включите «Подробную» карту и подведите её к нужному району.';
    dl.textContent = meta ? 'Скачать видимый район (добавить)' : 'Скачать видимый район';
    dl.disabled = basemapMode !== 'vector' || navigator.onLine === false;
  }
  if (clear) clear.hidden = !meta || !!offlineJob;
}

async function downloadVectorArea() {
  if (offlineJob) {
    offlineJob.cancel = true;
    return;
  }
  const b = map.getBounds();
  const bounds = { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() };
  const plan = planDownload(bounds, { minZoom: 0, maxZoom: 14, maxTiles: OFFLINE_MAX_TILES });
  if (!plan.total) return toast('Район слишком большой — приблизьте карту');
  const job = (offlineJob = { cancel: false });
  renderOfflineMapSection('Готовлю список плиток…');
  try {
    const cache = await caches.open(VECTOR_SAVED_CACHE);
    // адрес плиток (с номером недельной сборки) — из описания источника
    const tj = await (await fetch(OFM_ORIGIN + '/planet')).json();
    const tmpl = tj.tiles && tj.tiles[0];
    if (!tmpl) throw new Error('нет адреса плиток');
    // шрифты подписей и значки текущего стиля — без них карта без сети была бы без надписей
    const extras = [];
    for (const theme of ['light', 'dark']) {
      const st = await (await fetch(vectorStyleUrl(theme))).json();
      extras.push(vectorStyleUrl(theme));
      const fonts = new Set();
      (st.layers || []).forEach(l => (l.layout && l.layout['text-font'] ? l.layout['text-font'] : []).forEach(f => fonts.add(f)));
      // латиница, кириллица, знаки препинания
      for (const f of fonts)
        for (const range of ['0-255', '256-511', '1024-1279', '8192-8447'])
          extras.push(st.glyphs.replace('{fontstack}', encodeURIComponent(f)).replace('{range}', range));
      if (typeof st.sprite === 'string') for (const sfx of ['.json', '.png', '@2x.json', '@2x.png']) extras.push(st.sprite + sfx);
    }
    extras.push(OFM_ORIGIN + '/planet');
    const urls = [...new Set(extras)].concat([...tilesOf(plan.ranges)].map(([z, x, y]) => tmpl.replace('{z}', z).replace('{x}', x).replace('{y}', y)));
    // что уже лежит в хранилище: повторное скачивание обновляет эти плитки,
    // но в общий объём их второй раз не добавляем
    const had = new Set((await cache.keys()).map(r => r.url));
    let done = 0,
      bytes = 0,
      newBytes = 0,
      failed = 0,
      i = 0;
    const worker = async () => {
      while (i < urls.length && !job.cancel && bytes < OFFLINE_MAX_BYTES) {
        const url = urls[i++];
        try {
          const res = await fetch(url, { cache: 'no-store' });
          if (!res.ok) {
            failed++;
            continue;
          }
          const blob = await res.blob();
          bytes += blob.size;
          const key = vectorTileKey(url);
          if (!had.has(key)) newBytes += blob.size;
          await cache.put(key, new Response(blob, { headers: { 'Content-Type': res.headers.get('Content-Type') || 'application/octet-stream' } }));
          done++;
        } catch (e) {
          failed++; // сеть моргнула — эту плитку пропускаем, остальные качаем
        }
        if (done % 25 === 0) renderOfflineMapSection(`Скачано ${done} из ${urls.length} (${mb(bytes)})…`);
      }
    };
    await Promise.all(Array.from({ length: OFFLINE_PARALLEL }, worker));
    const keys = await cache.keys();
    const prev = offlineMeta();
    // остановились на пределе объёма — подробные уровни (они идут последними) скачаны не все
    const partial = !job.cancel && i < urls.length;
    const area = partial ? `частично: не поместились самые подробные уровни` : `до ${plan.maxZoom}-го уровня приближения`;
    prefSet(OFFLINE_META_KEY, JSON.stringify({ tiles: keys.length, bytes: (prev ? prev.bytes : 0) + newBytes, area, at: Date.now() }));
    offlineJob = null;
    renderOfflineMapSection();
    const lost = failed ? `, не скачалось ${failed}` : '';
    if (job.cancel) toast(`Остановлено: сохранено ${done} плиток`);
    else if (partial)
      toast(
        `Сохранено частично: ${done} из ${urls.length} — предел ${mb(OFFLINE_MAX_BYTES)} за одно скачивание. Приблизьте карту и скачайте остаток по частям${lost}`
      );
    else toast(`Район сохранён: ${done} плиток, ${mb(bytes)}${lost}`);
  } catch (e) {
    offlineJob = null;
    logError('скачивание района карты', e);
    renderOfflineMapSection();
    toast('Не удалось скачать район — проверьте подключение к интернету');
  }
}

async function clearVectorArea() {
  try {
    await caches.delete(VECTOR_SAVED_CACHE);
  } catch (e) {
    logError('удаление скачанной карты', e);
  }
  prefRemove(OFFLINE_META_KEY);
  renderOfflineMapSection();
  toast('Скачанная подробная карта удалена');
}

(function setupOfflineMapSection() {
  const dl = document.getElementById('offlineMapDownloadBtn');
  const clear = document.getElementById('offlineMapClearBtn');
  if (dl) dl.addEventListener('click', downloadVectorArea);
  if (clear) clear.addEventListener('click', clearVectorArea);
  window.addEventListener('online', () => renderOfflineMapSection());
  window.addEventListener('offline', () => renderOfflineMapSection());
})();
