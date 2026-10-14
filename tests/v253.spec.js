// v2.53: геокодер не отвечает — подсказки из справочника сразу, пересчёт точек не зависает и ничего не стирает
const { test, expect } = require('@playwright/test');
const { openApp, expectNoErrors } = require('./helpers');

test('«висящий» геокодер: замена точки и пересчёт маршрута работают', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'достаточно одной раскладки');
  test.setTimeout(60000);
  const { errors } = await openApp(page);
  await page.route('**/nominatim.openstreetmap.org/**', () => {}); // не отвечаем вовсе
  await page.evaluate(() => startEdit(allEntries.find(e => e.id === 'rt_city')));
  await page.locator('[data-wp-edit="1"]').click();
  await page.fill('#editWaypointSearch', 'Тверь');
  await expect(page.locator('#editWaypointSuggest [data-wp-pick]').first()).toBeVisible({ timeout: 3000 });
  const before = await page.evaluate(() => allEntries.find(e => e.id === 'rt_city').waypointCoords.map(c => c && c.slice()));
  await page.locator('#refreshWaypointsBtn').click();
  await expect(page.locator('#refreshWaypointsBtn')).toBeEnabled({ timeout: 30000 });
  const after = await page.evaluate(() => allEntries.find(e => e.id === 'rt_city').waypointCoords);
  expect(after.every(Boolean)).toBe(true);           // ничего не обнулилось
  expect(after.length).toBe(before.length);
  await expectNoErrors(errors);
});
