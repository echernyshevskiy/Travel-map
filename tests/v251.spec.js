// v2.51: мини-карты маршрутов в поездке, новое окно «Бег»
const { test, expect } = require('@playwright/test');
const { openApp, expectNoErrors } = require('./helpers');

test('страница поездки: маршрут — настоящая мини-карта, без сети — контуры', async ({ page }) => {
  const { errors } = await openApp(page); // тайлы в тестах недоступны — должна включиться подложка из контуров
  const trip = await page.evaluate(() => { const r = allEntries.find(e => e.id === 'rt_gpx'); r.trip = 'Подмосковье'; return r.trip; });
  await page.evaluate(t => openTripPage(t), trip);
  const holder = page.locator('[data-route-map]').first();
  await holder.scrollIntoViewIfNeeded();
  await expect(holder).toHaveClass(/has-map/);
  await expect(holder).toHaveClass(/plain/, { timeout: 8000 });
  expect(await page.evaluate(() => tripMiniMaps.length)).toBeGreaterThan(0);
  await page.locator('#closeTripPageModal').click();
  expect(await page.evaluate(() => tripMiniMaps.length)).toBe(0);
  await expectNoErrors(errors);
});

test('«Бег»: рекорды, медали, прогрессия и календарь', async ({ page }) => {
  const races = [
    { id: 'r1', name: 'Осенний 10', date: '2024-09-15', distanceKm: 10, time: '52:30', place: 300, participants: 1000 },
    { id: 'r2', name: 'Весенний 10', date: '2025-04-20', distanceKm: 10, time: '49:10', place: 150, participants: 1200 },
    { id: 'r3', name: 'Полумарафон', date: '2025-09-01', distanceKm: 21.1, time: '1:49:00', place: 900, participants: 4000 },
    { id: 'r4', name: 'Будущий 5', date: '2099-05-01', distanceKm: 5, status: 'upcoming' }
  ];
  const { errors } = await openApp(page, { races });
  await page.evaluate(() => document.getElementById('openRunningBtn').click());
  const pbs = page.locator('#runPBs .pb-card');
  await expect(pbs).toHaveCount(4);
  await expect(pbs.nth(1)).toContainText('49:10');
  await expect(pbs.nth(1)).toContainText('−3:20 к прошлому');
  await expect(pbs.nth(2)).toContainText('1:49:00');
  await expect(pbs.nth(3)).toContainText('прогноз');
  await expect(page.locator('#runMedals .medal')).toHaveCount(4);
  await expect(page.locator('#runMedals .medal.upcoming')).toHaveCount(1);
  expect(await page.locator('#runProgress circle').count()).toBeGreaterThanOrEqual(3);
  await page.locator('[data-prog="share"]').click();
  await expect(page.locator('#runProgress')).toContainText('обгоняете');
  expect(await page.locator('#runCalendar .rc-y').count()).toBeGreaterThanOrEqual(2);
  await expectNoErrors(errors);
});

test('темп не округляется до «:60»', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'достаточно одной раскладки');
  await openApp(page);
  expect(await page.evaluate(() => formatPace(4 + 59.7 / 60))).toBe('5:00 /км');
});
