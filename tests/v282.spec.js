// v2.82: если OpenFreeMap перестанет отвечать — обычная карта вместо пустого
// фона, выбор «Подробная» не теряется, несколько часов приложение её не ждёт,
// потом пробует снова (просмотренное и скачанное при ошибке сервиса — из
// хранилища: tests/offline-sw.spec.js)
const { test, expect } = require('@playwright/test');
const { openApp, expectNoErrors } = require('./helpers');
const { openFreeMapMock } = require('./fixtures/openfreemap');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const rasterOk = () => ({ status: 200, contentType: 'image/png', body: PNG });
// «сервис жив» переключается прямо во время теста
const state = { up: true, tilesUp: true };
const hits = []; // все обращения к сервису, в том числе неудачные
const ofm = url => {
  hits.push(url);
  if (!state.up) return { status: 503, body: '' };
  if (!state.tilesUp && /\/planet\/[^/]+\/\d+/.test(url)) return { status: 503, body: '' };
  return openFreeMapMock(url);
};
const mocks = { 'tiles.openfreemap.org': ofm, 'tile.openstreetmap.org': rasterOk, 'tile.opentopomap.org': rasterOk };
const desktopOnly = info => test.skip(info.project.name !== 'desktop', 'достаточно одной раскладки');
const pref = page => page.evaluate(() => ({ base: localStorage.getItem('travel-map-basemap'), down: localStorage.getItem('travel-map-vector-down') }));
const vectorReady = page =>
  page.waitForFunction(() => {
    if (basemapMode !== 'vector' || !vectorLayer || !map.hasLayer(vectorLayer)) return false;
    const ml = vectorLayer.getMaplibreMap();
    return !!ml && ml.isStyleLoaded() && ml.areTilesLoaded();
  });

test.describe('«Подробная» без OpenFreeMap', () => {
  test.beforeEach(() => {
    state.up = true;
    state.tilesUp = true;
  });

  test('сервис не отвечает: обычная карта, выбор сохранён, при запуске не ждём, потом пробуем снова', async ({ page }, info) => {
    desktopOnly(info);
    const { errors } = await openApp(page, { mocks });
    await page.evaluate(() => setBasemap('vector'));
    await vectorReady(page);
    expect((await pref(page)).base).toBe('vector');

    // сервис «упал»
    state.up = false;
    await page.evaluate(() => {
      setBasemap('street');
      setBasemap('vector');
    });
    await page.waitForFunction(() => basemapMode === 'street');
    await expect(page.locator('.toast').last()).toContainText('попробует снова');
    const p = await pref(page);
    expect(p.base).toBe('vector'); // выбор человека не потерян
    expect(Number(p.down)).toBeGreaterThan(0);
    await page.click('#stab-data');
    await expect(page.locator('#offlineMapStatus')).toContainText('не отвечала');

    // перезапуск в течение нескольких часов: сразу обычная, к сервису не ходим
    const before = hits.length;
    await page.reload();
    await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
    await page.waitForTimeout(1200);
    expect(await page.evaluate(() => basemapMode)).toBe('street');
    expect(await page.evaluate(() => !!document.querySelector('script[src*="leaflet-maplibre"]'))).toBe(false);
    expect(hits.length).toBe(before);
    await expect(page.locator('.toast').last()).toContainText('недавно не отвечала');

    // прошло больше шести часов, сервис вернулся — при запуске снова «Подробная», отметка снята
    state.up = true;
    await page.evaluate(() => localStorage.setItem('travel-map-vector-down', String(Date.now() - 7 * 3600 * 1000)));
    await page.reload();
    await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
    await vectorReady(page);
    await expect.poll(async () => (await pref(page)).down).toBeNull();
    await expectNoErrors(errors);
  });

  test('вручную кнопкой можно включить сразу — удачная загрузка снимает отметку', async ({ page }, info) => {
    desktopOnly(info);
    await page.addInitScript(() => {
      localStorage.setItem('travel-map-vector-down', String(Date.now()));
    });
    const { errors } = await openApp(page, { mocks });
    await page.evaluate(() => setBasemap('street'));
    await page.click('#topoToggleBtn'); // обычная → подробная
    await vectorReady(page);
    await expect.poll(async () => (await pref(page)).down).toBeNull();
    await expectNoErrors(errors);
  });

  test('стиль есть, а плитки перестали грузиться — обычная карта, а не пустой фон', async ({ page }, info) => {
    desktopOnly(info);
    const { errors } = await openApp(page, { mocks });
    await page.evaluate(() => setBasemap('vector'));
    await vectorReady(page);
    state.tilesUp = false;
    // уводим карту туда, где плиток ещё не было
    await page.evaluate(() => map.setView([-33.9, 151.2], 9, { animate: false }));
    await page.waitForFunction(() => basemapMode === 'street', null, { timeout: 15_000 });
    await expect(page.locator('.toast').last()).toContainText('перестала отвечать');
    expect((await pref(page)).base).toBe('vector');
    await expectNoErrors(errors);
  });
});
