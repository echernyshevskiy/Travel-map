// Регионы России и тепловая карта
const { test, expect } = require('@playwright/test');
const { openApp, expectNoErrors } = require('./helpers');

test('регионы считаются по городам и остановкам маршрутов', async ({ page }) => {
  const { errors } = await openApp(page);
  const r = await page.evaluate(() => ({ visited: [...ruRegionsState.visited.keys()].sort(), passed: [...ruRegionsState.passed] }));
  // Москва, Тверь, Петербург (остановки), Казань, Сочи (берег — ближайший регион)
  expect(r.visited).toEqual(['Краснодарский край', 'Москва', 'Санкт-Петербург', 'Тверская область', 'Татарстан'].sort());
  expect(r.passed).toContain('Московская область'); // только трек похода
  await expect(page.locator('#statRuRegionsF')).toContainText('5 из');
  await page.evaluate(() => document.getElementById('ruRegionsChip').click());
  expect(await page.evaluate(() => map.hasLayer(ruRegionsLayer))).toBe(false);
  await expectNoErrors(errors);
});

test('тепловая карта и исследованные квадраты', async ({ page }) => {
  const { errors } = await openApp(page);
  const n = await page.evaluate(() => heatTiles.size);
  expect(n).toBeGreaterThan(5); // поход; маршрут «по прямой» не учитывается
  expect(await page.evaluate(() => [...heatTiles].length === squaresOfRoute(allEntries.find(e => e.id === 'rt_gpx')).size)).toBe(true);
  await page.evaluate(() => document.getElementById('heatChip').click());
  await page.evaluate(() => { map.setView([56.0, 37.21], 11, { animate: false }); });
  await expect.poll(() => page.evaluate(() => squaresLayer ? squaresLayer.getLayers().length : 0)).toBeGreaterThan(0);
  await expectNoErrors(errors);
});
