// Экспорт в KML и чтение HEIC при импорте фото
const { test, expect } = require('@playwright/test');
const path = require('path');
const { openApp, expectNoErrors } = require('./helpers');

test.beforeEach(async ({}, info) => { test.skip(info.project.name !== 'desktop', 'достаточно одной раскладки'); });

test('KML: страны, регионы, города, маршруты и планы', async ({ page }) => {
  const { errors } = await openApp(page);
  const r = await page.evaluate(() => {
    const { xml, counts } = buildKml();
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const folders = {};
    doc.querySelectorAll('Folder').forEach(f => { folders[f.querySelector('name').textContent] = f.querySelectorAll('Placemark').length; });
    const coordsOk = [...doc.querySelectorAll('coordinates')].every(c => c.textContent.trim().split(/\s+/).every(t => {
      const [lng, lat] = t.split(',').map(Number); return lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90; }));
    return { counts, folders, parseError: !!doc.querySelector('parsererror'), coordsOk };
  });
  expect(r.parseError).toBe(false);
  expect(r.coordsOk).toBe(true);
  expect(r.folders['Страны']).toBe(2);           // Грузия, Армения
  expect(r.folders['Маршруты']).toBe(2);
  expect(r.folders['Планы']).toBe(1);            // Япония
  expect(r.folders['Регионы России']).toBeGreaterThanOrEqual(4);
  const download = page.waitForEvent('download');
  await page.evaluate(() => document.getElementById('exportKmlBtn').click());
  expect((await download).suggestedFilename()).toMatch(/\.kml$/);
  await expectNoErrors(errors);
});

test('HEIC: дата и координаты читаются', async ({ page }) => {
  const { errors } = await openApp(page, { entries: [] });
  await page.evaluate(() => document.getElementById('openPhotoImportBtn').click());
  await page.setInputFiles('#photoInput', path.join(__dirname, 'fixtures', 'heic-tbilisi.heic'));
  await expect.poll(() => page.evaluate(() => photoClusters.length)).toBe(1);
  const c = await page.evaluate(() => photoClusters[0]);
  expect(c.from).toMatchObject({ year: 2024, month: 7, day: 14 });
  expect(c.lat).toBeCloseTo(41.69, 1);
  expect(c.lng).toBeCloseTo(44.80, 1);
  await expectNoErrors(errors);
});
