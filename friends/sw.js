// Service worker: делает приложение «устанавливаемым» (PWA), кэширует саму
// страницу (оболочку) при установке, и вдобавок откладывает про запас тайлы
// карты по мере того, как вы их просматриваете — так что места, которые вы
// уже открывали онлайн, останутся видны и без сети в следующий раз.
// Поиск городов и роутинг по дорогам всё равно требуют интернета — это
// живые запросы к сторонним сервисам, их кэшировать нет смысла.

// Имя хранилища своё у каждой версии: иначе при активации одна копия скрипта
// стирала бы кеш другой, стоит их версиям разойтись. Подставляется при сборке.
const APP_VARIANT = 'friends';
const SHELL_CACHE_NAME = `travel-map-shell-${APP_VARIANT}-v4`;
const TILE_CACHE_NAME = `travel-map-tiles-${APP_VARIANT}-v1`;
// подробные границы стран и регионов (папка borders/) — общие для обеих версий
const BORDER_CACHE_NAME = `travel-map-borders-${APP_VARIANT}-v1`;
// шрифт флагов (fonts/, с ?v=хэш) — нужен там, где система не рисует флаги
const ASSET_CACHE_NAME = `travel-map-assets-${APP_VARIANT}-v1`;
const MAX_CACHED_TILES = 600; // ~ 600 тайлов ≈ 8-10 МБ, разумный запас без риска съесть всё хранилище

function isTileRequest(url){
  return url.includes('tile.openstreetmap.org') || url.includes('tile.opentopomap.org');
}

// Подрезка хранилища — не после каждого тайла, а разом, когда загрузка
// утихнет: раньше на каждый тайл запускался полный перебор 600 записей, и при
// приближении десятки таких переборов шли одновременно
let trimTimer = null, trimRunning = false;
function scheduleTileTrim(){
  clearTimeout(trimTimer);
  trimTimer = setTimeout(async () => {
    if(trimRunning) return scheduleTileTrim();
    trimRunning = true;
    try{
      const cache = await caches.open(TILE_CACHE_NAME);
      const keys = await cache.keys();
      const excess = keys.length - MAX_CACHED_TILES;
      // Cache.keys() отдаёт записи в порядке добавления в большинстве браузеров —
      // удаляем самые старые, простая FIFO-стратегия без лишней сложности
      for(let i = 0; i < excess; i++) await cache.delete(keys[i]);
    }catch(e){}
    finally{ trimRunning = false; }
  }, 4000);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE_NAME).then((cache) => cache.add(self.registration.scope))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names
        // удаляем только свои устаревшие хранилища: у версии для друзей — свои,
        // и раньше обновление одной версии стирало кеш другой
        .filter((n) => n.startsWith('travel-map-') && n.includes(`-${APP_VARIANT}-`)
          && n !== SHELL_CACHE_NAME && n !== TILE_CACHE_NAME && n !== BORDER_CACHE_NAME && n !== ASSET_CACHE_NAME)
        .map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = event.request.url;

  if (isTileRequest(url)) {
    // Тайлы: сохранённый отдаём сразу и в сеть за ним не ходим. Раньше каждый
    // показанный тайл, даже из кэша, параллельно скачивался заново «для
    // свежести» — при приближении и отдалении на мобильной сети это вдвое
    // увеличивало число запросов, новые тайлы стояли в очереди за старыми, и
    // карта подолгу оставалась лоскутной. Подложка меняется редко, а старые
    // тайлы и так вытесняются новыми (хранилище ограничено MAX_CACHED_TILES).
    event.respondWith(
      caches.open(TILE_CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        const response = await fetch(event.request);
        if (response && (response.ok || response.type === 'opaque')) {
          cache.put(event.request, response.clone()).then(scheduleTileTrim, () => {});
        }
        return response;
      })
    );
    return;
  }

  // Файлы границ не меняются в пределах версии (?v=…): кэш в приоритете,
  // загруженное однажды доступно и без сети
  if (/\/borders\/[^?#]+\.json(\?|$)/.test(url)) {
    event.respondWith(
      caches.open(BORDER_CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        const response = await fetch(event.request);
        if (response && response.ok) cache.put(event.request, response.clone());
        return response;
      })
    );
    return;
  }

  // Шрифт флагов: версия в адресе (?v=), поэтому кэш в приоритете; старые
  // версии убираются, чтобы не копились
  if (/\/fonts\/[^?#]+\.woff2(\?|$)/.test(url)) {
    event.respondWith(
      caches.open(ASSET_CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        const response = await fetch(event.request);
        if (response && response.ok){
          const path = url.split('?')[0];
          (await cache.keys()).filter((r) => r.url.split('?')[0] === path).forEach((r) => cache.delete(r));
          cache.put(event.request, response.clone());
        }
        return response;
      })
    );
    return;
  }

  // Сами страницы: сеть в приоритете, кэш — запасной вариант на случай офлайна.
  // Раньше здесь был кэш в приоритете, и обновлённый файл на сервере не
  // подхватывался — приходилось чистить данные сайта вручную. Теперь версий
  // две (index.html и read-only.html), обе обновляются, и устаревание было бы
  // особенно неприятным.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(SHELL_CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      }).catch(() => caches.match(event.request).then((cached) => cached || caches.match(self.registration.scope)))
    );
    return;
  }

  // остальные файлы (иконки, манифест): кэш в приоритете, сеть — запасной путь
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).catch(() => cached);
    })
  );
});
