// Правка записей: нужные поля видны, замена точки перестраивает маршрут
const { test, expect } = require('@playwright/test');
const { openApp, json, expectNoErrors } = require('./helpers');

const NOVGOROD = { display_name: 'Великий Новгород, Россия', lat: '58.52', lon: '31.27', name: 'Великий Новгород',
  address: { city: 'Великий Новгород', country: 'Россия', country_code: 'ru' }, type: 'city', class: 'place', addresstype: 'city' };

test('правка маршрута открывает поля маршрута, тип не меняется', async ({ page }) => {
  const { errors } = await openApp(page);
  await page.evaluate(() => startEdit(allEntries.find(e => e.id === 'rt_city')));
  expect(await page.evaluate(() => currentType)).toBe('route');
  await expect(page.locator('#fieldActivity')).toBeVisible();
  await expect(page.locator('[data-wp-edit="1"]')).toBeVisible();
  await expect(page.locator('#routeSourceBlock')).toBeHidden();
  await page.locator('.type-btn[data-type="city"]').click();
  expect(await page.evaluate(() => currentType)).toBe('route');
  await page.locator('#cancelEditBtn').click();
  await expect(page.locator('#routeSourceBlock')).toBeVisible();
  await expectNoErrors(errors);
});

test('правка города показывает страну города', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => startEdit(allEntries.find(e => e.id === 'ci_kz')));
  await expect(page.locator('#fieldCityCountry')).toBeVisible();
  await expect(page.locator('#fieldCityCountry')).toHaveValue('Russia');
});

test('замена точки перестраивает линию и километраж, «Отменить» возвращает', async ({ page }) => {
  const { errors } = await openApp(page, { mocks: { 'nominatim': json([NOVGOROD]) } }); // OSRM недоступен → по прямой
  const line = () => page.evaluate(() => layers['rt_city'].getLatLngs().map(p => [+p.lat.toFixed(2), +p.lng.toFixed(2)]));
  expect(await line()).toContainEqual([56.86, 35.9]);
  await page.evaluate(() => startEdit(allEntries.find(e => e.id === 'rt_city')));
  await page.locator('[data-wp-edit="1"]').click();
  await page.locator('#editWaypointSearch').fill('Новгород');
  await page.locator('#editWaypointSuggest .suggest-item').first().click();
  await expect.poll(line).toContainEqual([58.52, 31.27]);
  const e = await page.evaluate(() => allEntries.find(x => x.id === 'rt_city'));
  expect(e.waypointNames[1]).toBe('Великий Новгород');
  expect(e.isEstimated).toBe(true);
  expect(Math.round(e.distanceKm)).not.toBe(640);
  await page.locator('#undoDeleteBtn').click();
  await expect.poll(line).toContainEqual([56.86, 35.9]);
  await expectNoErrors(errors);
});
