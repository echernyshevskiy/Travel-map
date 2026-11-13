// v2.81: исправления по внешнему аудиту (E1) — профиль высоты не теряется,
// импорт можно отменить, нечитаемые данные не затираются, карантин не
// считается кэшем, честная дата в GPX, CSV без формул, частичное скачивание
// района называется частичным
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openApp, expectNoErrors, sampleEntries } = require('./helpers');
const { openFreeMapMock } = require('./fixtures/openfreemap');

const desktopOnly = info => test.skip(info.project.name !== 'desktop', 'достаточно одной раскладки');

const withProfile = () => sampleEntries().map(e => (e.id === 'rt_gpx' ? { ...e, profile: [180, 210, 260, 230, 200], dateFrom: '2024-08-17' } : e));

test.describe('E1: исправления доверия', () => {
  test('профиль высоты переживает перезагрузку: график и высоты в GPX', async ({ page }, info) => {
    desktopOnly(info);
    const { errors } = await openApp(page, { entries: withProfile() });
    const check = () =>
      page.evaluate(() => {
        const e = allEntries.find(x => x.id === 'rt_gpx');
        return { profile: e.profile, popup: buildPopup(e).includes('<svg'), ele: (buildGpx().xml.match(/<ele>/g) || []).length };
      });
    const before = await check();
    expect(before.profile).toEqual([180, 210, 260, 230, 200]);
    // приложение само сохраняет данные — после перезагрузки профиль на месте
    await page.evaluate(() => saveData());
    await page.reload();
    await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
    const after = await check();
    expect(after.profile).toEqual([180, 210, 260, 230, 200]);
    expect(after.popup).toBe(true);
    expect(after.ele).toBeGreaterThan(10);
    await expectNoErrors(errors);
  });

  test('GPX: время — только при известном дне', async ({ page }, info) => {
    desktopOnly(info);
    const { errors } = await openApp(page, { entries: withProfile() });
    const gpx = await page.evaluate(() => buildGpx().xml);
    expect(gpx).toContain('<time>2024-08-17T12:00:00Z</time>');
    // у остальных записей известны только месяц и год — выдуманного «1-го числа» нет
    expect(gpx).not.toMatch(/-01T12:00:00Z/);
    await expectNoErrors(errors);
  });

  test('CSV: текст, похожий на формулу, не станет формулой', async ({ page }, info) => {
    desktopOnly(info);
    const entries = sampleEntries();
    entries[0].name = '=1+1';
    entries[1].notes = '@SUM(A1)';
    const { errors } = await openApp(page, { entries });
    const csv = await page.evaluate(() => toCSV(entriesToRows()));
    expect(csv).toContain("'=1+1");
    expect(csv).toContain("'@SUM(A1)");
    expect(csv).not.toMatch(/,=1\+1/);
    await expectNoErrors(errors);
  });

  test('JSON-копия скачивается, даже если мест нет, а старты есть', async ({ page }, info) => {
    desktopOnly(info);
    const { errors } = await openApp(page, { entries: [] });
    expect(await page.evaluate(() => races.length)).toBeGreaterThan(0);
    await page.click('#stab-data');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#exportBtn')]);
    const data = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
    expect(data.races.length).toBeGreaterThan(0);
    await expectNoErrors(errors);
  });

  test('импорт: «Отмена» ничего не меняет, «Добавить» и «Заменить» — как написано', async ({ page }, info) => {
    const file = path.join(os.tmpdir(), `import-${info.project.name}.json`);
    const imported = [
      {
        id: 'imp1',
        type: 'city',
        name: 'Тромсё',
        year: 2025,
        month: 2,
        lat: 69.65,
        lng: 18.96,
        countryKey: 'Norway',
        status: 'visited',
        color: '#3F5240',
        photos: []
      },
      // эта уже есть — при добавлении не продублируется
      sampleEntries()[0]
    ];
    fs.writeFileSync(file, JSON.stringify({ entries: imported }));
    const { errors } = await openApp(page);
    const n0 = await page.evaluate(() => allEntries.length);
    const stored = () => page.evaluate(() => localStorage.getItem('travel-map-data'));
    const s0 = await stored();

    await page.setInputFiles('#importInput', file);
    await expect(page.locator('#importModeModal')).toBeVisible();
    await expect(page.locator('#importModeSummary')).toContainText('новых — 1, уже есть у вас — 1');
    await page.click('#importModeCancel');
    await expect(page.locator('#importModeModal')).toBeHidden();
    expect(await page.evaluate(() => allEntries.length)).toBe(n0);
    expect(await stored()).toBe(s0);

    // крестик — тоже отмена
    await page.setInputFiles('#importInput', file);
    await page.click('#closeImportModeModal');
    expect(await stored()).toBe(s0);

    await page.setInputFiles('#importInput', file);
    await page.click('#importModeAdd');
    await expect.poll(() => page.evaluate(() => allEntries.length)).toBe(n0 + 1);

    await page.setInputFiles('#importInput', file);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#importModeReplace')]);
    expect(dl.suggestedFilename()).toContain('before-import');
    await expect.poll(() => page.evaluate(() => allEntries.map(e => e.id).sort())).toEqual(['c_ge', 'imp1']);
    await expectNoErrors(errors);
  });

  test('нечитаемые данные: копия отложена, предупреждение, исходник не затирается', async ({ page }, info) => {
    desktopOnly(info);
    const broken = '{"entries":[{"id":"x","type":"city","name":"Обрез';
    await page.addInitScript(b => {
      if (!sessionStorage.getItem('__broken')) {
        sessionStorage.setItem('__broken', '1');
        // помощник openApp кладёт свои данные следом — подменяем их обрезанной строкой
        const orig = Storage.prototype.setItem;
        Storage.prototype.setItem = function (k, v) {
          return orig.call(this, k, k === 'travel-map-data' ? b : v);
        };
        setTimeout(() => (Storage.prototype.setItem = orig), 0);
      }
    }, broken);
    const { errors } = await openApp(page);
    expect(await page.evaluate(() => localStorage.getItem('travel-map-data'))).toBe(broken);
    await expect(page.locator('#dataRescue')).toBeVisible();
    await expect(page.locator('#dataRescue')).toContainText('не читаются');
    expect(await page.evaluate(() => localStorage.getItem('travel-map-data-unreadable'))).toBe(broken);
    // новая запись сохраняется, а отложенная копия остаётся
    await page.evaluate(async () => {
      allEntries.push({ id: 'n1', type: 'city', name: 'Новгород', year: 2026, lat: 58.52, lng: 31.27, countryKey: 'Russia', status: 'visited', photos: [] });
      await saveData();
    });
    expect(await page.evaluate(() => localStorage.getItem('travel-map-data-unreadable'))).toBe(broken);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#dataRescue button:has-text("Скачать копию")')]);
    expect(fs.readFileSync(await dl.path(), 'utf8')).toBe(broken);
    await expectNoErrors(errors);
  });

  test('переполнение хранилища: кэш геокодера очищается, карантин — нет', async ({ page }, info) => {
    desktopOnly(info);
    const { errors } = await openApp(page);
    const r = await page.evaluate(async () => {
      localStorage.setItem('travel-map-quarantine', JSON.stringify([{ at: 1, item: { id: 'q1' } }]));
      localStorage.setItem(GEO_CACHE_KEY, '{}');
      const orig = Storage.prototype.setItem;
      let thrown = false;
      Storage.prototype.setItem = function (k, v) {
        if (k === 'travel-map-data' && !thrown) {
          thrown = true;
          throw new DOMException('full', 'QuotaExceededError');
        }
        return orig.call(this, k, v);
      };
      try {
        return { ok: await saveData(), q: localStorage.getItem('travel-map-quarantine'), geo: localStorage.getItem(GEO_CACHE_KEY) };
      } finally {
        Storage.prototype.setItem = orig;
      }
    });
    expect(r.ok).toBe(true);
    expect(r.q).toContain('q1');
    expect(r.geo).toBeNull();
    await expectNoErrors(errors);
  });

  test('«Карта без сети»: повтор не удваивает объём, упор в предел — «частично»', async ({ page }, info) => {
    desktopOnly(info);
    test.setTimeout(90_000);
    const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    const rasterOk = () => ({ status: 200, contentType: 'image/png', body: PNG });
    const mocks = { 'tiles.openfreemap.org': openFreeMapMock, 'tile.openstreetmap.org': rasterOk, 'tile.opentopomap.org': rasterOk };
    const { errors } = await openApp(page, { mocks });
    await page.evaluate(() => setBasemap('vector'));
    await page.waitForFunction(() => vectorLayer && vectorLayer.getMaplibreMap() && vectorLayer.getMaplibreMap().isStyleLoaded());
    await page.evaluate(() => map.setView([55.75, 37.62], 13, { animate: false }));
    await page.click('#stab-data');
    const meta = () => page.evaluate(() => JSON.parse(localStorage.getItem('travel-map-offline-map')));
    await page.click('#offlineMapDownloadBtn');
    await expect(page.locator('#offlineMapStatus')).toContainText('Скачано:', { timeout: 60_000 });
    const first = await meta();
    expect(first.bytes).toBeGreaterThan(0);
    await page.click('#offlineMapDownloadBtn');
    await expect(page.locator('.toast').last()).toContainText('Район сохранён', { timeout: 60_000 });
    expect((await meta()).bytes).toBe(first.bytes);

    await page.click('#offlineMapClearBtn');
    await page.evaluate(() => (OFFLINE_MAX_BYTES = 4000));
    await page.click('#offlineMapDownloadBtn');
    await expect(page.locator('.toast').last()).toContainText('Сохранено частично', { timeout: 60_000 });
    await expect(page.locator('#offlineMapStatus')).toContainText('частично');
    await expectNoErrors(errors);
  });
});
