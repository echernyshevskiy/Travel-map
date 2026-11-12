// v2.79: подложка «Подробная» — векторная карта OpenFreeMap с русскими
// подписями (D1); скачивание района для работы без сети
const { test, expect } = require('@playwright/test');
const { openApp, expectNoErrors } = require('./helpers');
const { openFreeMapMock, requests, VERSION } = require('./fixtures/openfreemap');

// обычная подложка и рельеф тоже «работают» — иначе после сбоя их плиток
// приложение само переключится на контуры и спутает проверки
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const rasterOk = () => ({ status: 200, contentType: 'image/png', body: PNG });
const mocks = { 'tiles.openfreemap.org': openFreeMapMock, 'tile.openstreetmap.org': rasterOk, 'tile.opentopomap.org': rasterOk };
const vectorReady = page =>
  page.waitForFunction(() => {
    if (basemapMode !== 'vector' || !vectorLayer || !map.hasLayer(vectorLayer)) return false;
    const ml = vectorLayer.getMaplibreMap();
    return !!ml && ml.isStyleLoaded() && ml.areTilesLoaded();
  });
const toVector = async page => {
  await page.evaluate(() => setBasemap('vector'));
  await vectorReady(page);
};

test.describe('D1: подложка «Подробная»', () => {
  test('кнопка подложки по кругу: обычная → подробная → рельеф → контуры', async ({ page }) => {
    const { errors } = await openApp(page, { mocks });
    await page.evaluate(() => setBasemap('street'));
    const seen = [];
    for (let k = 0; k < 4; k++) {
      await page.click('#topoToggleBtn');
      seen.push(await page.evaluate(() => basemapMode));
    }
    expect(seen).toEqual(['vector', 'topo', 'plain', 'street']);
    await expect(page.locator('#topoToggleBtn')).toHaveText('🗺 Обычная');
    await expectNoErrors(errors);
  });

  test('карта рисуется, подписи — по-русски, указаны источники, выбор запоминается', async ({ page }) => {
    const { errors } = await openApp(page, { mocks });
    await toVector(page);
    await expect(page.locator('#topoToggleBtn')).toHaveText('🧭 Подробная');
    await expect(page.locator('.leaflet-gl-layer canvas, canvas.maplibregl-canvas').first()).toBeVisible();
    const tf = await page.evaluate(
      () =>
        vectorLayer
          .getMaplibreMap()
          .getStyle()
          .layers.find(l => l.id === 'label_city').layout['text-field']
    );
    expect(tf).toEqual(['coalesce', ['get', 'name:ru'], ['get', 'name:latin'], ['get', 'name']]);
    await expect(page.locator('.leaflet-control-attribution')).toContainText('OpenFreeMap');
    await expect(page.locator('.leaflet-control-attribution')).toContainText('OpenStreetMap');
    // плитки запрашивались с номером сборки карты
    expect(requests.some(u => u.includes(`/planet/${VERSION}/`))).toBe(true);
    // метки записей — над подложкой и кликабельны, как раньше
    expect(await page.locator('.leaflet-overlay-pane path, .leaflet-marker-icon').count()).toBeGreaterThan(0);
    // перезапуск — подложка та же
    await page.reload();
    await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
    await vectorReady(page);
    await expectNoErrors(errors);
  });

  test('тёмная тема — тёмный стиль карты', async ({ page }) => {
    const { errors } = await openApp(page, { mocks });
    await toVector(page);
    await page.evaluate(() => applyTheme('dark'));
    await page.waitForFunction(() => vectorStyleTheme === 'dark' && vectorLayer.getMaplibreMap().getStyle().name === 'dark');
    await page.evaluate(() => applyTheme('light'));
    await page.waitForFunction(() => vectorLayer.getMaplibreMap().getStyle().name === 'liberty');
    await expectNoErrors(errors);
  });

  test('сервис недоступен — включается обычная подложка и объяснение', async ({ page }) => {
    const { errors } = await openApp(page, { mocks: { ...mocks, 'tiles.openfreemap.org': () => ({ status: 503, body: '' }) } });
    await page.evaluate(() => setBasemap('vector'));
    await page.waitForFunction(() => basemapMode === 'street');
    await expect(page.locator('.toast').last()).toContainText('Подробная карта сейчас недоступна');
    await expectNoErrors(errors);
  });

  test('без WebGL — обычная подложка и понятное сообщение', async ({ page }) => {
    await page.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        return /webgl/.test(type) ? null : orig.call(this, type, ...rest);
      };
    });
    const { errors } = await openApp(page, { mocks });
    await page.evaluate(() => setBasemap('vector'));
    await page.waitForFunction(() => basemapMode === 'street');
    await expect(page.locator('.toast').last()).toContainText('нет WebGL');
    await expectNoErrors(errors);
  });

  test('библиотека грузится только при выборе подложки', async ({ page }) => {
    const loaded = [];
    page.on('request', r => {
      if (r.url().includes('/vendor/maplibre')) loaded.push(r.url());
    });
    const { errors } = await openApp(page, { mocks });
    await page.waitForTimeout(500);
    expect(loaded).toEqual([]);
    await toVector(page);
    expect(loaded.some(u => u.endsWith('maplibre-gl.mjs'))).toBe(true);
    await expectNoErrors(errors);
  });

  test('«Карта без сети»: скачать видимый район, лимиты соблюдены, удалить', async ({ page }, info) => {
    test.setTimeout(90_000);
    const { errors } = await openApp(page, { mocks });
    await toVector(page);
    await page.evaluate(() => map.setView([55.75, 37.62], 13, { animate: false }));
    await vectorReady(page);
    if (info.project.name === 'desktop') await page.click('#stab-data');
    else await page.evaluate(() => mnavShow('more'));
    await page.locator('#offlineMapSection').scrollIntoViewIfNeeded();
    const before = requests.length;
    await page.click('#offlineMapDownloadBtn');
    await expect(page.locator('#offlineMapStatus')).toContainText('Скачано:', { timeout: 60_000 });
    const tiles = requests.slice(before).filter(u => /\/planet\/[^/]+\/\d+\/\d+\/\d+\.pbf/.test(u));
    expect(tiles.length).toBeGreaterThan(20);
    expect(tiles.length).toBeLessThanOrEqual(3000);
    // в хранилище — плитки без номера сборки, шрифты подписей с кириллицей, стили обеих тем
    const keys = await page.evaluate(async () => (await (await caches.open('travel-map-vector-saved-v1')).keys()).map(r => r.url));
    expect(keys.some(k => k.includes('/planet/_/14/'))).toBe(true);
    expect(keys.some(k => k.includes(VERSION))).toBe(false);
    expect(keys.some(k => k.includes('/fonts/') && k.includes('1024-1279'))).toBe(true);
    expect(keys.some(k => k.endsWith('/styles/dark'))).toBe(true);
    await expect(page.locator('#offlineMapClearBtn')).toBeVisible();
    await page.click('#offlineMapClearBtn');
    await expect(page.locator('#offlineMapStatus')).toContainText('Ничего не скачано');
    expect(await page.evaluate(async () => await caches.has('travel-map-vector-saved-v1'))).toBe(false);
    await expectNoErrors(errors);
  });

  test('скачивание недоступно, пока не включена «Подробная»', async ({ page }, info) => {
    const { errors } = await openApp(page, { mocks });
    if (info.project.name === 'desktop') await page.click('#stab-data');
    else await page.evaluate(() => mnavShow('more'));
    await expect(page.locator('#offlineMapDownloadBtn')).toBeDisabled();
    await expect(page.locator('#offlineMapStatus')).toContainText('Включите «Подробную»');
    await expectNoErrors(errors);
  });
});
