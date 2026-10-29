// v2.70: город, записанный в центр области вместо самого города («Мехико» в 58 км
// от столицы): проверка данных находит и переносит, коллекции засчитывают по названию
const { test, expect } = require('@playwright/test');
const { openApp, expectNoErrors } = require('./helpers');

const base = { photos: [], purpose: 'tourism', status: 'visited', color: '#3F5240' };
const DATA = [
  { ...base, id: 'mx', type: 'city', name: 'Мехико', lat: 19.4839, lng: -99.6900, year: 2013, month: 5, countryKey: 'Mexico' }, // центр штата Мехико
  { ...base, id: 'zg', type: 'city', name: 'Москва', lat: 55.99, lng: 37.21, year: 2020, month: 2, countryKey: 'Russia' },       // Зеленоград: окраина мегаполиса — не ошибка
  { ...base, id: 'ok', type: 'city', name: 'Тбилиси', lat: 41.69, lng: 44.80, year: 2023, month: 5, countryKey: 'Georgia' },
  { ...base, id: 'rt', type: 'route', name: 'По Египту', year: 2010, month: 3, color: '#3F5240', activity: 'roadtrip', isEstimated: true,
    coordsEncoded: '', waypointNames: ['Каир', 'Луксор'], waypointCoords: [[30.044, 31.236], [25.42, 32.95]], waypointCountryKeys: ['Egypt', 'Egypt'] } // Луксор — центр мухафазы
];

test('проверка данных: «Город не на своём месте» — находит, переносит в центр, «так и задумано» скрывает', async ({ page }) => {
  const { errors } = await openApp(page, { entries: DATA });
  const off = () => page.evaluate(() => computeDiagnostics().offCenter.map(o => o.name));
  expect((await off()).sort()).toEqual(['Луксор', 'Мехико']);
  await page.evaluate(() => document.getElementById('openDiagnosticsBtn').click());
  const sec = page.locator('#diagnosticsBody');
  await expect(sec).toContainText('Город не на своём месте');
  await expect(sec).toContainText(/Мехико[\s\S]*км от центра города Мехико/);
  // перенос города
  await sec.locator('.diag-row', { hasText: 'Мехико' }).locator('[data-fixcenter]').click();
  await expect.poll(() => page.evaluate(() => { const e = allEntries.find(x => x.id === 'mx'); return [e.name, e.lat, e.lng]; })).toEqual(['Мехико', 19.444, -99.133]);
  // и отмена одним нажатием
  await page.locator('#undoDeleteBtn').click();
  await expect.poll(() => page.evaluate(() => allEntries.find(x => x.id === 'mx').lat)).toBe(19.4839);
  // перенос остановки маршрута — название не меняется
  await page.evaluate(() => { renderDiagnostics(); });
  await sec.locator('.diag-row', { hasText: 'Луксор' }).locator('[data-fixcenter]').click();
  await expect.poll(() => page.evaluate(() => { const e = allEntries.find(x => x.id === 'rt'); return [e.waypointNames[1], Math.round(e.waypointCoords[1][0] * 10) / 10]; })).toEqual(['Луксор', 25.7]);
  // «так и задумано» — больше не показывается
  await page.evaluate(() => renderDiagnostics());
  await sec.locator('.diag-row', { hasText: 'Мехико' }).locator('[data-keepcenter]').click();
  expect(await off()).toEqual([]);
  await expectNoErrors(errors);
});

test('коллекции засчитывают город по названию и стране, даже если точка сдвинута', async ({ page }) => {
  const { errors } = await openApp(page, { entries: DATA });
  const r = await page.evaluate(() => {
    const cols = allCollections(), idx = collectionVisitIndex();
    const st = (id, name) => { const c = cols.find(x => x.id === id); return collectionItemStatus(c.items.find(i => i.name === name), idx); };
    return { mexico: st('cap-Северная Америка', 'Мехико'), ottawa: st('cap-Северная Америка', 'Оттава').got };
  });
  expect(r.mexico).toEqual({ got: true, year: 2013 });
  expect(r.ottawa).toBe(false);
  await expectNoErrors(errors);
});
