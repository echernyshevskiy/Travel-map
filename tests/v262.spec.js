// v2.62: повреждённые данные в хранилище браузера не ломают приложение
const { test, expect } = require('@playwright/test');
const { openApp, expectNoErrors, sampleEntries } = require('./helpers');

const broken = () => [
  ...sampleEntries(),
  null, 'строка', 42, { id: 'p1', type: 'planet', name: 'Марс', year: 2030 },
  { id: 'nc', type: 'city', name: 'Без координат', lat: null, lng: null, year: 2019, status: 'visited', photos: [] },
  { id: 'dup', type: 'city', name: 'Первый', lat: 44, lng: 44, year: 2016, status: 'visited', photos: [] },
  { id: 'dup', type: 'city', name: 'Второй', lat: 44.2, lng: 44.2, year: 2016, status: 'visited', photos: 'не массив' },
  { id: 'rw', type: 'route', name: 'Кривые точки', year: 2022, coordsEncoded: '', distanceKm: 'много', waypointNames: ['A', 'B'], waypointCoords: [[55, 37], ['x']], waypointCountryKeys: 'Russia' },
];

test('битые записи откладываются, остальное работает; одинаковые id разводятся', async ({ page }) => {
  const { errors } = await openApp(page, { entries: broken(), tripMeta: { '__collection:c': { kind: 'collection', name: 'Моя', createdAt: 1,
    items: [null, { kind: 'city', name: 'Мусор', lat: 'x', lng: null }, { kind: 'city', name: 'Казань', lat: 55.79, lng: 49.12 }, { kind: 'country', key: 'Georgia' }] } } });
  const s = await page.evaluate(() => ({
    n: allEntries.length,
    ids: new Set(allEntries.map(e => e.id)).size,
    dup: allEntries.filter(e => e.name === 'Первый' || e.name === 'Второй').map(e => e.id),
    q: JSON.parse(localStorage.getItem('travel-map-quarantine') || '[]').length,
    saved: JSON.parse(localStorage.getItem('travel-map-data')).entries.length,
    rw: allEntries.find(e => e.id === 'rw').waypointCoords,
  }));
  expect(s.n).toBe(sampleEntries().length + 4);
  expect(s.ids).toBe(s.n);
  expect(s.dup[0]).toBe('dup'); expect(s.dup[1]).not.toBe('dup');
  expect(s.q).toBe(4);
  expect(s.saved).toBe(s.n);
  expect(s.rw).toEqual([[55, 37], null]);
  // экраны рисуются
  await page.evaluate(() => { renderList(); renderTable(); renderDiagnostics(); renderPassport(); renderTraveler(); });
  // город без координат: вместо ошибки — подсказка
  await page.evaluate(() => focusEntry(allEntries.find(e => e.id === 'nc')));
  await expect(page.locator('#toast')).toContainText('нет места на карте');
  // своя коллекция: мусорные пункты не показываются, «✕» убирает именно тот пункт
  await page.evaluate(() => { collectionOpenId = '__collection:c'; renderCollections(); document.getElementById('collectionsModal').style.display = 'flex'; });
  await expect(page.locator('#collectionsBody .coll-item')).toHaveCount(2);
  await page.locator('#collectionsBody .coll-item', { hasText: 'Казань' }).locator('[data-ci-del]').click();
  await expect.poll(() => page.evaluate(() => tripMeta['__collection:c'].items.map(i => i.name || i.key))).toEqual(['Georgia']);
  await expectNoErrors(errors);
});
