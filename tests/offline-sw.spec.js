// Настоящий сервис-воркер без сети: приложение открывается из кэша, подробные
// границы, загруженные один раз, показываются и офлайн. Остальные тесты
// сервис-воркер отключают (он ходил бы в сеть мимо перехвата запросов), поэтому
// здесь — свой маленький веб-сервер из папки репозитория.
const { test, expect } = require('@playwright/test');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { ROOT, sampleEntries, sampleRaces } = require('./helpers');

test.use({ serviceWorkers: 'allow' });

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
let server, base;
test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    let rel = decodeURIComponent(req.url.split(/[?#]/)[0]);
    if(rel.endsWith('/')) rel += 'index.html';
    const file = path.join(ROOT, rel);
    if(!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()){ res.writeHead(404); return res.end(); }
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
  await context.route(url => !String(url).startsWith(base), r => r.abort());
  await context.addInitScript(({ entries, races }) => {
    if(!localStorage.getItem('travel-map-data')){
      localStorage.setItem('travel-map-data', JSON.stringify({ entries, races, tripMeta: {} }));
      localStorage.setItem('travel-map-basemap', 'plain');
    }
  }, { entries: sampleEntries(), races: sampleRaces() });
  const ready = () => page.waitForFunction(() => window.__travelMap && __travelMap.allEntries && __travelMap.allEntries.length > 0);
  await page.goto(base);
  await ready();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload(); // теперь страницей управляет сервис-воркер
  await ready();
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  // подробные границы Грузии: загрузка с сервера и сохранение в кэше
  const tier = () => page.evaluate(() => { let t = null; plainBaseLayer.eachLayer(l => { if(l.feature.properties.name === 'Georgia') t = l.__detailTier || null; }); return t; });
  await page.evaluate(() => map.setView([42.2, 43.5], 8, { animate: false }));
  await expect.poll(tier, { timeout: 15000 }).not.toBeNull();
  const cached = await page.evaluate(async () => { const out = {}; for(const k of await caches.keys()) out[k] = (await (await caches.open(k)).keys()).length; return out; });
  expect(Object.entries(cached).some(([k, n]) => /shell/.test(k) && n > 0), JSON.stringify(cached)).toBe(true);
  expect(Object.entries(cached).some(([k, n]) => /borders/.test(k) && n > 0), JSON.stringify(cached)).toBe(true);
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
  await context.route(url => !String(url).startsWith(base), r => r.abort());
  // как в Chrome на Windows: флаг-эмодзи системой не рисуется
  await context.addInitScript(() => {
    const g = HTMLCanvasElement.prototype.getContext; let first = true;
    HTMLCanvasElement.prototype.getContext = function(){ if(first){ first = false; return null; } return g.apply(this, arguments); };
    if(!localStorage.getItem('travel-map-data')) localStorage.setItem('travel-map-basemap', 'plain');
  });
  const flagOk = () => page.evaluate(async () => { await document.fonts.load('16px "Twemoji Country Flags"', '🇬🇪'); return document.fonts.check('16px "Twemoji Country Flags"', '🇬🇪'); });
  await page.goto(base);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect.poll(flagOk).toBe(true);
  const cached = await page.evaluate(async () => { for(const k of await caches.keys()) if(/assets/.test(k)) return (await (await caches.open(k)).keys()).map(r => r.url); return []; });
  expect(cached.some(u => /fonts\/flags\.woff2\?v=/.test(u)), JSON.stringify(cached)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect.poll(flagOk).toBe(true);
  await context.setOffline(false);
});
