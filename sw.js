// Минимальный service worker: делает приложение «устанавливаемым» (PWA)
// и кэширует саму страницу, чтобы оболочка открывалась офлайн.
// Карта (тайлы), поиск городов и роутинг по дорогам всё равно требуют
// интернета — кэшируется только сам HTML-файл приложения.

const CACHE_NAME = 'travel-map-shell-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.add(self.registration.scope))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).catch(() => cached);
    })
  );
});
