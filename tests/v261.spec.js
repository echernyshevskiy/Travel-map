// v2.61: районы и сельсоветы вместо посёлков — поиск берёт имя самого объекта,
// «Проверка данных» предлагает найти посёлок, записанный трек при замене остановки не трогается
const { test, expect } = require('@playwright/test');
const { openApp, expectNoErrors, sampleEntries, encodePolyline } = require('./helpers');

// трек «Несвиж — Мир — Нарочь» с профилем высот, как у загруженного GPX
const track = [];
for(let k = 0; k <= 60; k++){ const t = k / 60; track.push(t < 0.4 ? [53.22 + (53.453 - 53.22) * t / 0.4, 26.68 - 0.21 * t / 0.4] : [53.453 + (54.88 - 53.453) * (t - 0.4) / 0.6, 26.47 + 0.25 * (t - 0.4) / 0.6]); }
const gpxRoute = () => ({ id: 'rt_by', type: 'route', name: 'Потатотур', year: 2024, month: 7, color: '#3F5240', status: 'visited', photos: [], purpose: 'tourism', activity: 'cycling',
  coordsEncoded: encodePolyline(track), distanceKm: 210, elevationGain: 900, durationMin: 600, trackDays: 3, profile: [[0, 200], [100, 230], [210, 160]], isEstimated: false,
  waypointNames: ['Несвиж', 'Мирский сельский Совет', 'Нарочь'], waypointCoords: [[53.22, 26.68], [53.465, 26.494], [54.88, 26.72]], waypointCountryKeys: ['Belarus', 'Belarus', 'Belarus'] });
const nominatim = {
  'nominatim.openstreetmap.org/search': () => ({ contentType: 'application/json', body: JSON.stringify([
    // район (сельсовет) приходит первым — как в настоящем ответе
    { class: 'boundary', type: 'administrative', addresstype: 'municipality', name: 'Мирский сельский Совет', lat: '53.465', lon: '26.494', display_name: 'Мирский сельский Совет, Кореличский район, Гродненская область, Беларусь',
      address: { municipality: 'Мирский сельский Совет', state: 'Гродненская область', country: 'Беларусь', country_code: 'by' } },
    { class: 'place', type: 'town', addresstype: 'town', name: 'Мир', lat: '53.4531', lon: '26.4728', display_name: 'Мир, Мирский сельский Совет, Кореличский район, Гродненская область, Беларусь',
      address: { town: 'Мир', municipality: 'Мирский сельский Совет', state: 'Гродненская область', country: 'Беларусь', country_code: 'by' } },
    { class: 'tourism', type: 'attraction', addresstype: 'tourism', name: 'Мирский замок', lat: '53.451', lon: '26.4727', display_name: 'Мирский замок, Мир, Беларусь',
      address: { tourism: 'Мирский замок', town: 'Мир', state: 'Гродненская область', country: 'Беларусь', country_code: 'by' } },
  ]) }),
};

test('«Проверка данных»: сельсовет заменяется найденным посёлком, трек GPX остаётся прежним, отмена возвращает', async ({ page }) => {
  const { errors } = await openApp(page, { entries: [...sampleEntries(), gpxRoute()], mocks: nominatim });
  const before = await page.evaluate(() => allEntries.find(e => e.id === 'rt_by').coordsEncoded);
  await page.evaluate(() => { renderDiagnostics(); document.getElementById('diagnosticsModal').style.display = 'flex'; });
  const btn = page.locator('[data-findplace^="admin:"]').first();
  await expect(btn).toContainText('Найти населённый пункт');
  await btn.click();
  const row = btn.locator('xpath=ancestor::div[contains(@class,"diag-row")]');
  await expect(row.locator('.diag-find input')).toHaveValue('Мир');
  // посёлок — первым, под своим именем; сельсовет — в конце
  const items = row.locator('.diag-find [data-place-pick]');
  await expect(items.first()).toContainText('Мир — Гродненская область, Беларусь');
  await expect(items.last()).toContainText('Мирский сельский Совет');
  await items.first().click();
  await expect.poll(() => page.evaluate(() => { const e = allEntries.find(x => x.id === 'rt_by'); return [e.waypointNames[1], e.waypointCoords[1], e.waypointCountryKeys[1]]; }))
    .toEqual(['Мир', [53.4531, 26.4728], 'Belarus']);
  expect(await page.evaluate(() => allEntries.find(e => e.id === 'rt_by').coordsEncoded)).toBe(before);
  await expect(page.locator('#diagnosticsBody')).not.toContainText('Мирский сельский Совет');
  await page.evaluate(() => undoLastAction());
  await expect.poll(() => page.evaluate(() => allEntries.find(e => e.id === 'rt_by').waypointNames[1])).toBe('Мирский сельский Совет');
  await expectNoErrors(errors);
});

test('правка маршрута: замена остановки у записанного трека не перестраивает его по дорогам', async ({ page }) => {
  const { errors } = await openApp(page, { entries: [...sampleEntries(), gpxRoute()], mocks: nominatim });
  const before = await page.evaluate(() => { const e = allEntries.find(x => x.id === 'rt_by'); return [e.coordsEncoded, e.distanceKm]; });
  await page.evaluate(() => startEdit(allEntries.find(e => e.id === 'rt_by')));
  await page.locator('[data-wp-edit="1"]').click();
  await page.fill('#editWaypointSearch', 'Мир');
  const first = page.locator('#editWaypointSuggest [data-wp-pick]').first();
  await expect(first).toContainText('Мир — ');
  await first.click();
  await expect.poll(() => page.evaluate(() => allEntries.find(e => e.id === 'rt_by').waypointNames[1])).toBe('Мир');
  expect(await page.evaluate(() => { const e = allEntries.find(x => x.id === 'rt_by'); return [e.coordsEncoded, e.distanceKm]; })).toEqual(before);
  await expectNoErrors(errors);
});

test('название места по координатам — до посёлка, а не сельсовета', async ({ page }) => {
  let asked = '';
  const { errors } = await openApp(page, { mocks: { 'nominatim.openstreetmap.org/reverse': url => { asked = url; return { contentType: 'application/json', body: JSON.stringify({
    address: { hamlet: 'Чох', municipality: 'Чохский сельсовет', county: 'Гунибский район', state: 'Дагестан', country: 'Россия', country_code: 'ru' } }) }; } } });
  const r = await page.evaluate(() => reverseGeocode(42.355, 46.975));
  expect(r.name).toBe('Чох');
  expect(asked).toContain('zoom=14');
  await expectNoErrors(errors);
});

test('без сети: поиск посёлка в «Проверке данных» честно говорит, что ищет только по справочнику городов', async ({ page, context }) => {
  const { errors } = await openApp(page, { entries: [...sampleEntries(), gpxRoute()] });
  await context.setOffline(true);
  await page.evaluate(() => { renderDiagnostics(); document.getElementById('diagnosticsModal').style.display = 'flex'; });
  const btn = page.locator('[data-findplace^="admin:"]').first();
  await btn.click();
  const box = btn.locator('xpath=ancestor::div[contains(@class,"diag-row")]').locator('.diag-find');
  await expect(box).toContainText('Без сети ищу только по встроенному справочнику');
  // город из справочника находится и без сети
  await box.locator('input').fill('Минск');
  await expect(box.locator('[data-place-pick]').first()).toContainText('Минск');
  await expect(box).toContainText('Без сети');
  await context.setOffline(false);
  await expectNoErrors(errors);
});
