// v2.52: маршрут кликается поверх страны, остановки маршрутов точками, визит в месяц — один, карточка страны компактная
const { test, expect } = require('@playwright/test');
const { openApp, expectNoErrors } = require('./helpers');

test('нажатие на маршрут внутри России открывает маршрут, а не карточку страны', async ({ page }) => {
  const { errors } = await openApp(page);
  const xy = await page.evaluate(() => {
    const l = layers['rt_city'];
    map.fitBounds(l.getBounds(), { animate: false });
    const ll = l.getLatLngs(); const p = ll[Math.floor(ll.length / 2)];
    const pt = map.latLngToContainerPoint(p), r = document.getElementById('map').getBoundingClientRect();
    return [r.left + pt.x + 3, r.top + pt.y + 3]; // чуть мимо линии — в пределах запаса
  });
  await page.waitForTimeout(400);
  await page.mouse.click(xy[0], xy[1]);
  await expect(page.locator('.leaflet-popup-content')).toContainText('Москва — Санкт-Петербург');
  await expect(page.locator('.leaflet-popup-content .cpop')).toHaveCount(0);
  await expectNoErrors(errors);
});

test('остановки маршрута — точками, без дублей с отметками городов', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'достаточно одной раскладки');
  const { errors } = await openApp(page);
  // у маршрута Москва → Тверь → Санкт-Петербург; Москва, Тверь и Петербург есть и отдельными городами?
  const r = await page.evaluate(() => {
    const own = new Set(allEntries.filter(e => e.type === 'city').map(e => e.name.toLowerCase()));
    const expected = allEntries.filter(e => e.type === 'route' && e.waypointNames).flatMap(e => e.waypointNames).filter(n => !own.has(n.toLowerCase()));
    return { stops: routeStopsLayer.getLayers().length, expected: new Set(expected.map(n => n.toLowerCase())).size };
  });
  expect(r.stops).toBe(r.expected);
  await expectNoErrors(errors);
});

test('город отдельной отметкой и остановкой маршрута в одном месяце — один визит', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'достаточно одной раскладки');
  await openApp(page);
  const n = await page.evaluate(() => {
    const v = [
      { name: 'Тверь', year: 2025, month: 6, trip: 'А' }, { name: 'тверь', year: 2025, month: 6, trip: 'А' },
      { name: 'Тверь', year: 2025, month: 7, trip: 'А' }, { name: 'Тверь', year: 2024, month: null, trip: 'Б' },
      { name: 'Тверь', year: 2024, month: null, trip: 'Б' }
    ];
    return uniqueCityVisits(v).length;
  });
  expect(n).toBe(3);
});

test('карточка страны: не больше шести поездок сразу, остальные по «ещё»', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'достаточно одной раскладки');
  const entries = Array.from({ length: 9 }, (_, i) => ({ id: 'g' + i, type: 'city', name: 'Город' + i, year: 2015 + i, month: 5, lat: 41.7, lng: 44.8 + i * 0.01,
    countryKey: 'Georgia', status: 'visited', color: '#3F5240', photos: [], trip: 'Поездка ' + (2015 + i) }));
  const { errors } = await openApp(page, { entries });
  await page.evaluate(() => { cpopOpen.trips = true; openCountryPopup('Georgia', L.latLng(41.7, 44.8)); });
  await expect(page.locator('.cpop-trip[data-cpop-trip]:visible')).toHaveCount(6);
  await expect(page.locator('.cpop-trip[data-cpop-trip]').first()).toHaveText('Поездка 2023'); // свежие сверху
  await page.locator('[data-cpop-act="moretrips"]').click();
  await expect(page.locator('.cpop-trip[data-cpop-trip]:visible')).toHaveCount(9);
  await expectNoErrors(errors);
});

test('в «Где это?» маршруты, остановки и тепловая карта скрыты', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'достаточно одной раскладки');
  const { errors } = await openApp(page);
  await page.evaluate(() => document.getElementById('openQuizBtn').click());
  await page.locator('[data-qmode="map"]').click();
  await page.locator('#quizStartBtn').click();
  await expect(page.locator('#quizMapPanel')).toBeVisible();
  const d = await page.evaluate(() => ['routePane', 'heatPane'].map(p => getComputedStyle(map.getPane(p)).display));
  expect(d).toEqual(['none', 'none']);
  await expectNoErrors(errors);
});
