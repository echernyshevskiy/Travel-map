// Service worker: делает приложение «устанавливаемым» (PWA), кэширует саму
// страницу (оболочку) при установке, и вдобавок откладывает про запас тайлы
// карты по мере того, как вы их просматриваете — так что места, которые вы
// уже открывали онлайн, останутся видны и без сети в следующий раз.
// Поиск городов и роутинг по дорогам всё равно требуют интернета — это
// живые запросы к сторонним сервисам, их кэшировать нет смысла. Свои файлы
// (шрифты, модуль Excel, иконки) сохраняются при первом обращении, а модуль
// Excel и иконки — ещё и заранее, при установке.

// Имя хранилища своё у каждой версии: иначе при активации одна копия скрипта
// стирала бы кеш другой, стоит их версиям разойтись. Подставляется при сборке.
const APP_VARIANT = 'edit';
const SHELL_CACHE_NAME = `travel-map-shell-${APP_VARIANT}-v4`;
const TILE_CACHE_NAME = `travel-map-tiles-${APP_VARIANT}-v1`;
// подробные границы стран и регионов (папка borders/) — общие для обеих версий
const BORDER_CACHE_NAME = `travel-map-borders-${APP_VARIANT}-v1`;
// свои файлы рядом с приложением: шрифты (fonts/, с ?v=хэш), модуль Excel
// (vendor/), иконки и манифест — чтобы и без сети всё выглядело и работало как обычно
const ASSET_CACHE_NAME = `travel-map-assets-${APP_VARIANT}-v1`;
// «Подробная» карта (OpenFreeMap, векторная): плитки по мере просмотра — в
// своё хранилище с тем же вытеснением давно не открытых; скачанные заранее
// районы — в отдельное, которое не вытесняется (его пишет сама страница,
// раздел «Карта без сети»). Имя скачанного — общее для обеих версий: скачали
// район в основной — он есть и у версии для друзей на этом устройстве.
const VECTOR_CACHE_NAME = `travel-map-vector-${APP_VARIANT}-v1`;
const VECTOR_SAVED_CACHE_NAME = 'travel-map-vector-saved-v1';
const MAX_CACHED_VECTOR = 1500;
// Плитки лежат по адресу с номером недельной сборки карты: в кэше — без него,
// иначе после обновления карты сохранённое не находилось бы без сети
// (та же функция — vectorTileKey в src/lib/vector-map.js)
const VECTOR_TILE_RE = /^(https:\/\/tiles\.openfreemap\.org\/planet\/)[^/]+(\/\d+\/\d+\/\d+\.pbf)(?:[?#].*)?$/;
const vectorKey = url => {
  const m = url.match(VECTOR_TILE_RE);
  return m ? m[1] + '_' + m[2] : url;
};
// ~2000 тайлов ≈ 30 МБ: хватает на домашний район и несколько поездок на всех
// масштабах, и это малая доля того, что браузер отдаёт сайту
const MAX_CACHED_TILES = 2000;
// Вытесняются давно не открытые, а не давно сохранённые: тайл, показанный из
// кэша, один раз за жизнь воркера переписывается в конец очереди. Раньше
// первым пропадал домашний район — его смотрели раньше всего.
const touchedTiles = new Set();

function isTileRequest(url) {
  return url.includes('tile.openstreetmap.org') || url.includes('tile.opentopomap.org');
}

// Подрезка хранилища — не после каждого тайла, а разом, когда загрузка
// утихнет: раньше на каждый тайл запускался полный перебор 600 записей, и при
// приближении десятки таких переборов шли одновременно
let trimTimer = null,
  trimRunning = false;
function scheduleTileTrim() {
  clearTimeout(trimTimer);
  trimTimer = setTimeout(async () => {
    if (trimRunning) return scheduleTileTrim();
    trimRunning = true;
    try {
      await trimCache(VECTOR_CACHE_NAME, MAX_CACHED_VECTOR);
      const cache = await caches.open(TILE_CACHE_NAME);
      const keys = await cache.keys();
      const excess = keys.length - MAX_CACHED_TILES;
      // Cache.keys() отдаёт записи в порядке добавления (перезапись переносит
      // в конец) — удаляем те, что дольше всех не открывались
      for (let i = 0; i < excess; i++) await cache.delete(keys[i]);
    } catch (e) {
    } finally {
      trimRunning = false;
    }
  }, 4000);
}

async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

// «Подробная» карта. Стиль и описание плиток меняются раз в неделю — сеть в
// приоритете, без сети — сохранённое. Плитки, шрифты подписей, значки —
// сохранённое в приоритете (скачанный район, затем просмотренное).
async function vectorResponse(request) {
  const url = request.url;
  const key = vectorKey(url);
  const saved = await caches.open(VECTOR_SAVED_CACHE_NAME);
  const cache = await caches.open(VECTOR_CACHE_NAME);
  const fresh = /\/styles\/|\/planet\/?(\?|$)/.test(url);
  const fromCache = async () => (await saved.match(key)) || (await cache.match(key));
  if (!fresh) {
    const hit = await fromCache();
    if (hit) {
      if (!touchedTiles.has(key)) {
        touchedTiles.add(key);
        if (!(await saved.match(key))) cache.put(key, hit.clone()).catch(() => {});
      }
      return hit;
    }
  }
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      touchedTiles.add(key);
      cache.put(key, response.clone()).then(scheduleTileTrim, () => {});
    }
    return response;
  } catch (e) {
    const hit = await fromCache();
    if (hit) return hit;
    throw e;
  }
}

// заранее — то, что может понадобиться без сети впервые: иконки и модуль Excel
// (у версии для друзей — только иконки: Excel в ней не нужен)
const WARM_ASSETS =
  APP_VARIANT === 'edit'
    ? ['manifest.json', 'icon-192.png', 'icon-512.png', 'vendor/xlsx-0.18.5.full.min.js']
    : ['manifest.json', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL_CACHE_NAME).then(cache => cache.add(self.registration.scope)));
  // без ожидания: если чего-то нет или сеть пропала, установка не срывается
  caches.open(ASSET_CACHE_NAME).then(async cache => {
    for (const rel of WARM_ASSETS) {
      const url = new URL(rel, self.registration.scope).href;
      try {
        if (!(await cache.match(url))) {
          const r = await fetch(url);
          if (r.ok) await cache.put(url, r);
        }
      } catch (e) {}
    }
  });
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(
        names
          // удаляем только свои устаревшие хранилища: у версии для друзей — свои,
          // и раньше обновление одной версии стирало кеш другой
          .filter(
            n =>
              n.startsWith('travel-map-') &&
              n.includes(`-${APP_VARIANT}-`) &&
              n !== SHELL_CACHE_NAME &&
              n !== TILE_CACHE_NAME &&
              n !== VECTOR_CACHE_NAME &&
              n !== BORDER_CACHE_NAME &&
              n !== ASSET_CACHE_NAME
          )
          .map(n => caches.delete(n))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = event.request.url;

  if (url.startsWith('https://tiles.openfreemap.org/')) {
    event.respondWith(vectorResponse(event.request));
    return;
  }

  if (isTileRequest(url)) {
    // Тайлы: сохранённый отдаём сразу и в сеть за ним не ходим. Раньше каждый
    // показанный тайл, даже из кэша, параллельно скачивался заново «для
    // свежести» — при приближении и отдалении на мобильной сети это вдвое
    // увеличивало число запросов, новые тайлы стояли в очереди за старыми, и
    // карта подолгу оставалась лоскутной. Подложка меняется редко, а старые
    // тайлы вытесняются давно не открытыми (хранилище ограничено MAX_CACHED_TILES).
    event.respondWith(
      caches.open(TILE_CACHE_NAME).then(async cache => {
        const cached = await cache.match(event.request);
        if (cached) {
          if (!touchedTiles.has(url)) {
            touchedTiles.add(url);
            cache.put(event.request, cached.clone()).catch(() => {});
          }
          return cached;
        }
        const response = await fetch(event.request);
        if (response && (response.ok || response.type === 'opaque')) {
          touchedTiles.add(url);
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
      caches.open(BORDER_CACHE_NAME).then(async cache => {
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
      caches.open(ASSET_CACHE_NAME).then(async cache => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        const response = await fetch(event.request);
        if (response && response.ok) {
          const path = url.split('?')[0];
          (await cache.keys()).filter(r => r.url.split('?')[0] === path).forEach(r => cache.delete(r));
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
      fetch(event.request)
        .then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(SHELL_CACHE_NAME).then(cache => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then(cached => cached || caches.match(self.registration.scope)))
    );
    return;
  }

  // Остальные свои файлы (модуль Excel, иконки, манифест): отдаём сохранённое
  // сразу и тихо обновляем копию; чего нет — берём из сети и сохраняем.
  // Чужие адреса (поиск мест, маршруты, GitHub) — только сеть, как и раньше.
  if (new URL(url).origin === self.location.origin) {
    event.respondWith(
      caches.open(ASSET_CACHE_NAME).then(async cache => {
        const cached = await cache.match(event.request);
        const fresh = fetch(event.request).then(response => {
          if (response && response.ok) cache.put(event.request, response.clone());
          return response;
        });
        if (cached) {
          fresh.catch(() => {});
          return cached;
        }
        return fresh;
      })
    );
    return;
  }
});
