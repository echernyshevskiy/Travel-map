// Service worker: делает приложение «устанавливаемым» (PWA), кэширует саму
// страницу (оболочку) при установке, и вдобавок откладывает про запас тайлы
// карты по мере того, как вы их просматриваете — так что места, которые вы
// уже открывали онлайн, останутся видны и без сети в следующий раз.
// Поиск городов и роутинг по дорогам всё равно требуют интернета — это
// живые запросы к сторонним сервисам, их кэшировать нет смысла.

const SHELL_CACHE_NAME = 'travel-map-shell-v2';
const TILE_CACHE_NAME = 'travel-map-tiles-v1';
const MAX_CACHED_TILES = 600; // ~ 600 тайлов ≈ 8-10 МБ, разумный запас без риска съесть всё хранилище

function isTileRequest(url){
  return url.includes('tile.openstreetmap.org') || url.includes('tile.opentopomap.org');
}

async function trimTileCache(cache){
  const keys = await cache.keys();
  const excess = keys.length - MAX_CACHED_TILES;
  if(excess > 0){
    // Cache.keys() отдаёт записи в порядке добавления в большинстве браузеров —
    // удаляем самые старые, простая FIFO-стратегия без лишней сложности
    for(let i = 0; i < excess; i++){
      await cache.delete(keys[i]);
    }
  }
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
        .filter((n) => n !== SHELL_CACHE_NAME && n !== TILE_CACHE_NAME)
        .map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = event.request.url;

  if (isTileRequest(url)) {
    // тайлы: сперва отдать закэшированное (если есть) для мгновенной отрисовки,
    // и параллельно обновить кэш свежим тайлом с сети — при отсутствии сети
    // используется то, что уже было отложено про запас ранее
    event.respondWith(
      caches.open(TILE_CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        const networkFetch = fetch(event.request).then((response) => {
          if (response && (response.ok || response.type === 'opaque')) {
            cache.put(event.request, response.clone());
            trimTileCache(cache);
          }
          return response;
        }).catch(() => cached);
        return cached || networkFetch;
      })
    );
    return;
  }

  // оболочка приложения: кэш в приоритете, сеть — запасной вариант
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).catch(() => cached);
    })
  );
});
