// v2.50: сводка на карте, «Записи / Статистика», топ-5 регионов, название GPX, цвет по умолчанию
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { openApp, expectNoErrors } = require('./helpers');

test('сводка на карте: цифры, сворачивается и запоминает состояние', async ({ page }, info) => {
  const { errors } = await openApp(page);
  const card = page.locator('#mapGlance');
  await expect(card).toBeVisible();
  // на телефоне по умолчанию свёрнута, на ПК развёрнута
  const collapsed = await card.evaluate(c => c.classList.contains('collapsed'));
  expect(collapsed).toBe(info.project.name === 'phone');
  await expect(page.locator(collapsed ? '#mapGlanceCompact' : '#mapGlanceFull')).toContainText('8');
  await card.click();
  expect(await card.evaluate(c => c.classList.contains('collapsed'))).toBe(!collapsed);
  await page.reload();
  expect(await page.locator('#mapGlance').evaluate(c => c.classList.contains('collapsed'))).toBe(!collapsed);
  await expectNoErrors(errors);
});

test('телефон: список и статистика — на разных вкладках', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'переключатель только в мобильной раскладке');
  const { errors } = await openApp(page);
  await page.locator('[data-mtab-btn="list"]').click();
  await expect(page.locator('#listSwitch')).toBeVisible();
  await expect(page.locator('#entryList')).toBeVisible();
  await expect(page.locator('#mnavStatsSection')).toBeHidden();
  await page.locator('[data-lsw="stats"]').click();
  await expect(page.locator('#mnavStatsSection')).toBeVisible();
  await expect(page.locator('#entryList')).toBeHidden();
  await expectNoErrors(errors);
});

test('регионы России: только топ-5 по визитам', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'достаточно одной раскладки');
  const city = (id, name, lat, lng, month) => ({ id, type: 'city', name, year: 2024, month, lat, lng, countryKey: 'Russia', status: 'visited', color: '#3F5240', photos: [] });
  const entries = [
    // три разных месяца — три визита (в одном месяце считались бы одним)
    city('a1', 'Казань', 55.79, 49.12, 3), city('a2', 'Казань', 55.79, 49.12, 5), city('a3', 'Казань', 55.79, 49.12, 7),
    city('b1', 'Сочи', 43.6, 39.73), city('b2', 'Анапа', 44.89, 37.32),
    city('c1', 'Тверь', 56.86, 35.9), city('d1', 'Псков', 57.82, 28.33), city('e1', 'Пермь', 58.0, 56.25),
    city('f1', 'Омск', 54.99, 73.37), city('g1', 'Томск', 56.48, 84.95)
  ];
  const { errors } = await openApp(page, { entries });
  const items = page.locator('#ruRegionsList .top-item');
  await expect(items).toHaveCount(5);
  await expect(items.first()).toContainText('Татарстан');
  await expect(items.first()).toContainText('3');
  await expect(items.nth(1)).toContainText('Краснодарский край');
  await expect(page.locator('#ruRegionsList')).toContainText('Всего: 7 из 84');
  await expectNoErrors(errors);
});

test('GPX: заданное название без имени файла, несколько файлов — с номером', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'достаточно одной раскладки');
  const { errors } = await openApp(page, { entries: [] });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gpx-'));
  const gpx = (la) => `<?xml version="1.0"?><gpx><trk><trkseg><trkpt lat="${la}" lon="37.6"/><trkpt lat="${la + 0.01}" lon="37.61"/><trkpt lat="${la + 0.02}" lon="37.63"/></trkseg></trk></gpx>`;
  const f1 = path.join(dir, 'Morning_Run_2026-10-01.gpx'), f2 = path.join(dir, 'Evening_Run.gpx');
  fs.writeFileSync(f1, gpx(55.7)); fs.writeFileSync(f2, gpx(55.8));
  await page.locator('.type-btn[data-type="route"]').click();
  await page.setInputFiles('#gpxInput', f1);
  await expect.poll(() => page.evaluate(() => pendingGpxList.length)).toBe(1);
  await page.fill('#fieldName', 'Пробежка в парке');
  await page.locator('#saveBtn').click();
  await expect.poll(() => page.evaluate(() => allEntries.map(e => e.name))).toEqual(['Пробежка в парке']);
  await page.setInputFiles('#gpxInput', [f1, f2]);
  await expect.poll(() => page.evaluate(() => pendingGpxList.length)).toBe(2);
  await page.fill('#fieldName', 'Забег');
  await page.locator('#saveBtn').click();
  await expect.poll(() => page.evaluate(() => allEntries.map(e => e.name).sort())).toEqual(['Забег (1)', 'Забег (2)', 'Пробежка в парке']);
  await expectNoErrors(errors);
});

test('палитра: есть «по умолчанию» для своего типа, к нему можно вернуться при правке', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'достаточно одной раскладки');
  const { errors } = await openApp(page);
  await page.locator('.type-btn[data-type="city"]').click();
  const def = page.locator('.color-sw.is-default');
  await expect(def).toHaveAttribute('data-color', '#3F5240');
  await expect(def).toHaveAttribute('aria-checked', 'true');
  // правка записи со своим цветом: кнопка по умолчанию возвращает базовый
  await page.evaluate(() => { const e = allEntries.find(x => x.type === 'country' && x.status !== 'wishlist'); e.color = '#7A3E5A'; startEdit(e); });
  expect(await page.inputValue('#fieldColor')).toBe('#7a3e5a');
  await expect(page.locator('.color-sw.is-default')).toHaveAttribute('data-color', '#A6592E');
  await expect(page.locator('.color-sw.is-default')).toHaveAttribute('aria-checked', 'false');
  await page.locator('.color-sw.is-default').click();
  expect(await page.inputValue('#fieldColor')).toBe('#a6592e');
  await expectNoErrors(errors);
});
