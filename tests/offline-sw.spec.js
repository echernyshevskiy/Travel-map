// Настоящий сервис-воркер без сети: приложение открывается из кэша, подробные
// границы, загруженные один раз, показываются и офлайн. Остальные тесты
// сервис-воркер отключают (он ходил бы в сеть мимо перехвата запросов), поэтому
// здесь — свой маленький веб-сервер из папки репозитория.
const { test, expect } = require('@playwright/test');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { ROOT, sampleEntries, sampleRaces } = require('./helpers');
const { openFreeMapMock, requests: ofmRequests, setVersion, VERSION } = require('./fixtures/openfreemap');

test.use({ serviceWorkers: 'allow' });

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.webmanifest': 'application/manifest+json'
};
let server, base;
test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    let rel = decodeURIComponent(req.url.split(/[?#]/)[0]);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, r));
  // приложение регистрирует сервис-воркер только по https или на localhost
  base = `http://localhost:${server.address().port}/`;
});
test.afterAll(() => new Promise(r => server.close(r)));

test('без сети: приложение открывается из кэша, подробные границы — тоже', async ({ context, page }, info) => {
  test.skip(info.project.name !== 'desktop', 'достаточно одной раскладки');
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // сторонние адреса (шрифты, тайлы) не нужны: обрываем, чтобы тест не зависел от сети
  await context.route(
    url => !String(url).startsWith(base),
    r => r.abort()
  );
  await context.addInitScript(
    ({ entries, races }) => {
      if (!localStorage.getItem('travel-map-data')) {
        localStorage.setItem('travel-map-data', JSON.stringify({ entries, races, tripMeta: {} }));
        localStorage.setItem('travel-map-basemap', 'plain');
      }
    },
    { entries: sampleEntries(), races: sampleRaces() }
  );
  const ready = () => page.waitForFunction(() => window.__travelMap && __travelMap.allEntries && __travelMap.allEntries.length > 0);
  await page.goto(base);
  await ready();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload(); // теперь страницей управляет сервис-воркер
  await ready();
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  // подробные границы Грузии: загрузка с сервера и сохранение в кэше
  const tier = () =>
    page.evaluate(() => {
      let t = null;
      plainBaseLayer.eachLayer(l => {
        if (l.feature.properties.name === 'Georgia') t = l.__detailTier || null;
      });
      return t;
    });
  await page.evaluate(() => map.setView([42.2, 43.5], 8, { animate: false }));
  await expect.poll(tier, { timeout: 15000 }).not.toBeNull();
  const cached = await page.evaluate(async () => {
    const out = {};
    for (const k of await caches.keys()) out[k] = (await (await caches.open(k)).keys()).length;
    return out;
  });
  expect(
    Object.entries(cached).some(([k, n]) => /shell/.test(k) && n > 0),
    JSON.stringify(cached)
  ).toBe(true);
  expect(
    Object.entries(cached).some(([k, n]) => /borders/.test(k) && n > 0),
    JSON.stringify(cached)
  ).toBe(true);
  // без сети
  await context.setOffline(true);
  await page.reload();
  await ready();
  expect(await page.evaluate(() => __travelMap.allEntries.length)).toBe(sampleEntries().length);
  await page.evaluate(() => map.setView([42.2, 43.5], 8, { animate: false }));
  await expect.poll(tier, { timeout: 15000 }).not.toBeNull();
  await context.setOffline(false);
  expect(errors).toEqual([]);
});

test('без сети: шрифт флагов (отдельный файл) берётся из кэша', async ({ context, page }, info) => {
  test.skip(info.project.name !== 'desktop', 'достаточно одной раскладки');
  await context.route(
    url => !String(url).startsWith(base),
    r => r.abort()
  );
  // как в Chrome на Windows: флаг-эмодзи системой не рисуется
  await context.addInitScript(() => {
    const g = HTMLCanvasElement.prototype.getContext;
    let first = true;
    HTMLCanvasElement.prototype.getContext = function () {
      if (first) {
        first = false;
        return null;
      }
      return g.apply(this, arguments);
    };
    if (!localStorage.getItem('travel-map-data')) localStorage.setItem('travel-map-basemap', 'plain');
  });
  const flagOk = () =>
    page.evaluate(async () => {
      await document.fonts.load('16px "Twemoji Country Flags"', '🇬🇪');
      return document.fonts.check('16px "Twemoji Country Flags"', '🇬🇪');
    });
  await page.goto(base);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(flagOk).toBe(true);
  const cached = await page.evaluate(async () => {
    for (const k of await caches.keys()) if (/assets/.test(k)) return (await (await caches.open(k)).keys()).map(r => r.url);
    return [];
  });
  expect(
    cached.some(u => /fonts\/flags\.woff2\?v=/.test(u)),
    JSON.stringify(cached)
  ).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect.poll(flagOk).toBe(true);
  await context.setOffline(false);
});

test('без сети: шрифты интерфейса свои и из кэша, Excel работает, на Google не ходим', async ({ context, page }, info) => {
  test.skip(info.project.name !== 'desktop', 'достаточно одной раскладки');
  const foreign = [];
  await context.route(
    url => !String(url).startsWith(base),
    r => {
      foreign.push(r.request().url());
      return r.abort();
    }
  );
  await context.addInitScript(() => {
    if (!localStorage.getItem('travel-map-basemap')) localStorage.setItem('travel-map-basemap', 'plain');
  });
  const fontsOk = () =>
    page.evaluate(async () => {
      await Promise.all(['16px "EB Garamond"', 'italic 600 16px "Playfair Display"', '16px "Courier Prime"'].map(f => document.fonts.load(f, 'Жж Ab')));
      return (
        ['16px "EB Garamond"', 'italic 600 16px "Playfair Display"', '16px "Courier Prime"'].every(f => document.fonts.check(f, 'Ab')) &&
        document.fonts.check('16px "EB Garamond"', 'Жж')
      );
    });
  await page.goto(base);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(fontsOk).toBe(true);
  // модуль Excel сохраняется заранее, при установке
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          for (const k of await caches.keys())
            if (/assets/.test(k)) for (const r of await (await caches.open(k)).keys()) if (/vendor\/xlsx/.test(r.url)) return true;
          return false;
        }),
      { timeout: 15000 }
    )
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => window.__travelMap && __travelMap.allEntries);
  await expect.poll(fontsOk).toBe(true);
  expect(await page.evaluate(() => loadXlsxLib().then(ok => ok && typeof XLSX !== 'undefined'))).toBe(true);
  await context.setOffline(false);
  expect(foreign.filter(u => /fonts\.(googleapis|gstatic)\.com/.test(u))).toEqual([]);
});

test('фрагменты карты: давно не открытые вытесняются первыми — показанный из кэша уходит в конец очереди', async ({ context, page }, info) => {
  test.skip(info.project.name !== 'desktop', 'достаточно одной раскладки');
  await context.route(
    url => !String(url).startsWith(base),
    r => r.abort()
  );
  await context.addInitScript(() => {
    localStorage.setItem('travel-map-basemap', 'plain');
  });
  await page.goto(base);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const order = await page.evaluate(async () => {
    // три фрагмента уже сохранены (сеть в тесте закрыта — кладём сами)
    const name = (await caches.keys()).find(k => /tiles/.test(k)) || 'travel-map-tiles-edit-v1';
    const cache = await caches.open(name);
    const png = await (await fetch('icon-192.png')).blob();
    // необычные номера, чтобы не спутать с фрагментами, которые успела загрузить
    // сама карта (запросы сервис-воркера не перехватываются тестом и в CI идут в сеть)
    const u = n => `https://tile.openstreetmap.org/19/${n}/7777.png`;
    for (const n of [1, 2, 3]) await cache.put(u(n), new Response(png, { headers: { 'Content-Type': 'image/png' } }));
    // карта снова показала первый — он из кэша, без сети
    await new Promise(res => {
      const i = new Image();
      i.onload = i.onerror = res;
      i.src = u(1);
    });
    await new Promise(r => setTimeout(r, 300));
    return (await cache.keys()).map(r => (r.url.match(/\/19\/(\d)\/7777\.png/) || [])[1]).filter(Boolean);
  });
  expect(order).toEqual(['2', '3', '1']);
});

test('без сети: «Подробная» карта из кэша, и после недельного обновления карты тоже', async ({ context, page }, info) => {
  test.skip(info.project.name !== 'desktop', 'достаточно одной раскладки');
  test.setTimeout(120_000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const failed = [];
  page.on('requestfailed', r => failed.push(r.url() + ' ' + (r.failure() || {}).errorText));
  const ofm = r => r.fulfill(openFreeMapMock(r.request().url()));
  await context.route(
    url => !String(url).startsWith(base) && !String(url).startsWith('https://tiles.openfreemap.org/'),
    r => r.abort()
  );
  await context.route('https://tiles.openfreemap.org/**', ofm);
  await context.addInitScript(
    ({ entries, races }) => {
      if (!localStorage.getItem('travel-map-data')) {
        localStorage.setItem('travel-map-data', JSON.stringify({ entries, races, tripMeta: {} }));
        localStorage.setItem('travel-map-basemap', 'vector');
        localStorage.setItem('travel-map-mapview', JSON.stringify({ lat: 55.75, lng: 37.62, z: 7 }));
      }
    },
    { entries: sampleEntries(), races: sampleRaces() }
  );
  const vectorReady = () =>
    page.waitForFunction(
      () => {
        if (typeof basemapMode === 'undefined' || basemapMode !== 'vector' || !vectorLayer || !map.hasLayer(vectorLayer)) return false;
        const ml = vectorLayer.getMaplibreMap();
        return !!ml && ml.isStyleLoaded() && ml.areTilesLoaded();
      },
      null,
      { timeout: 30_000 }
    );
  await page.goto(base);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload(); // теперь страницей управляет сервис-воркер
  await vectorReady();
  // плитки прошли через сервис-воркер и лежат без номера сборки
  const keys = await page.evaluate(async () => {
    for (const k of await caches.keys()) if (/vector-edit/.test(k)) return (await (await caches.open(k)).keys()).map(r => r.url);
    return [];
  });
  expect(keys.some(k => k.includes('/planet/_/'))).toBe(true);
  // при запуске с «Подробной» обычная подложка не грузится вовсе
  expect(failed.filter(u => u.includes('tile.openstreetmap.org'))).toEqual([]);
  expect(keys.some(k => k.includes(VERSION))).toBe(false);
  // на сервере вышла новая недельная сборка карты: описание источника — с новым номером
  setVersion('20261112_001001_pt');
  await page.reload();
  await vectorReady();
  // без сети: стиль, описание, плитки, шрифты — из кэша; на контуры не переключились
  await context.unroute('https://tiles.openfreemap.org/**', ofm);
  await context.route('https://tiles.openfreemap.org/**', r => r.abort());
  await context.setOffline(true);
  const before = ofmRequests.length;
  await page.reload();
  await vectorReady();
  expect(await page.evaluate(() => basemapMode)).toBe('vector');
  expect(ofmRequests.length).toBe(before);
  await context.setOffline(false);
  setVersion(VERSION);
  expect(errors).toEqual([]);
});
