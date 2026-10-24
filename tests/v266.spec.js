// v2.66: сценарии, которые раньше не проверялись автотестами —
// добавление поездки из фотографий, «Что здесь?» в карточке страны, полноэкранная карта
const { test, expect } = require('@playwright/test');
const path = require('path');
const { openApp, expectNoErrors } = require('./helpers');

test('импорт из фото: найденная поездка добавляется городом, отменяется одним нажатием', async ({ page }) => {
  // название места — «из сети» (подменённый ответ геокодера)
  const { errors } = await openApp(page, { entries: [], mocks: { 'nominatim.openstreetmap.org/reverse': () => ({ contentType: 'application/json',
    body: JSON.stringify({ address: { city: 'Тбилиси', country: 'Грузия', country_code: 'ge' } }) }) } });
  await page.evaluate(() => document.getElementById('openPhotoImportBtn').click());
  await page.setInputFiles('#photoInput', path.join(__dirname, 'fixtures', 'heic-tbilisi.heic'));
  await expect(page.locator('[data-photo-name="0"]')).toHaveValue('Тбилиси');
  await expect(page.locator('[data-photo-pick="0"]')).toBeChecked();
  await page.click('#photoApplyBtn');
  await expect.poll(() => page.evaluate(() => { const e = allEntries.find(x => x.name === 'Тбилиси'); return e && [e.type, e.year, e.month, e.countryKey, Math.round(e.lat)]; }))
    .toEqual(['city', 2024, 7, 'Georgia', 42]);
  await expect(page.locator('#photoImportModal')).toBeHidden();
  await expect(page.locator('#toast')).toContainText('Добавлено записей: 1');
  await page.locator('#undoDeleteBtn').click();
  await expect.poll(() => page.evaluate(() => allEntries.length)).toBe(0);
  await expectNoErrors(errors);
});

test('импорт из фото: снятая галочка и пустое название — ничего не добавляется', async ({ page }) => {
  const { errors } = await openApp(page, { entries: [] });
  await page.evaluate(() => document.getElementById('openPhotoImportBtn').click());
  await page.setInputFiles('#photoInput', path.join(__dirname, 'fixtures', 'heic-tbilisi.heic'));
  await expect(page.locator('[data-photo-pick="0"]')).toBeVisible();
  await page.locator('[data-photo-pick="0"]').uncheck();
  await page.click('#photoApplyBtn');
  await expect(page.locator('#toast')).toContainText('Не отмечено ни одной поездки');
  expect(await page.evaluate(() => allEntries.length)).toBe(0);
  await expectNoErrors(errors);
});

test('«Что здесь?» в карточке страны: название места и «+ добавить как город»', async ({ page }) => {
  let asked = '';
  const { errors } = await openApp(page, { mocks: { 'nominatim.openstreetmap.org/reverse': url => { asked = url; return { contentType: 'application/json',
    body: JSON.stringify({ address: { village: 'Степанцминда', country: 'Грузия', country_code: 'ge' } }) }; } } });
  await page.evaluate(() => openCountryPopup('Georgia', L.latLng(42.66, 44.64)));
  await page.locator('[data-cpop-act="where"]').click();
  await expect(page.locator('#cpopPlace')).toContainText('Степанцминда');
  expect(asked).toContain('lat=42.66');
  await page.locator('[data-cpop-place-add]').click();
  await expect(page.locator('#fieldName')).toHaveValue('Степанцминда');
  expect(await page.inputValue('#fieldCityCountry')).toBe('Georgia');
  await expectNoErrors(errors);
});

test('«Что здесь?» без сети — справочник городов, а не ошибка', async ({ page, context }) => {
  const { errors } = await openApp(page);
  await context.setOffline(true);
  await page.evaluate(() => openCountryPopup('Georgia', L.latLng(41.70, 44.79)));
  await page.locator('[data-cpop-act="where"]').click();
  await expect(page.locator('#cpopPlace')).toContainText('Тбилиси');
  await context.setOffline(false);
  await expectNoErrors(errors);
});

test('полноэкранная карта: кнопка и Esc, карта занимает всё окно', async ({ page }) => {
  const { errors } = await openApp(page);
  const size = () => page.evaluate(() => { const s = map.getSize(); return [s.x, s.y, innerWidth, innerHeight]; });
  await page.click('#mapFullBtn');
  await expect(page.locator('body')).toHaveClass(/map-full/);
  await expect(page.locator('#mapFullBtn')).toHaveAttribute('aria-label', 'Свернуть карту обратно');
  await expect.poll(async () => { const [w, h, W, H] = await size(); return Math.abs(w - W) <= 2 && Math.abs(h - H) <= 2; }).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('body')).not.toHaveClass(/map-full/);
  await expect(page.locator('#mapFullBtn')).toHaveAttribute('aria-label', 'Развернуть карту на весь экран');
  // и снова кнопкой
  await page.click('#mapFullBtn'); await page.click('#mapFullBtn');
  await expect(page.locator('body')).not.toHaveClass(/map-full/);
  await expectNoErrors(errors);
});
