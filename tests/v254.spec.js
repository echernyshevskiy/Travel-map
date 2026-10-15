// v2.54: коллекции и импорт истории Google Maps
const { test, expect } = require('@playwright/test');
const path = require('path');
const { openApp, expectNoErrors } = require('./helpers');

test('коллекции: прогресс, детали, своя коллекция сохраняется в данных', async ({ page }) => {
  const { errors } = await openApp(page);
  page.on('dialog', d => d.accept());
  await page.evaluate(() => document.getElementById('openCollectionsBtn').click());
  await expect(page.locator('.coll-card')).not.toHaveCount(0);
  // в тестовых данных есть Казань — один из миллионников
  await page.locator('[data-coll="ru-millions"]').click();
  await expect(page.locator('.coll-item.got')).toContainText(['Казань']);
  await page.locator('#collBack').click();
  await page.fill('#collNewName', 'Кавказ');
  await page.locator('#collNewBtn').click();
  await page.fill('#collAddInput', 'Тбилиси');
  await page.locator('#collAddSuggest [data-ca]').first().click();
  await expect(page.locator('.coll-item')).toHaveCount(1);
  await expect(page.locator('.coll-item.got')).toHaveCount(1); // Тбилиси уже отмечен
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('travel-map-data')).tripMeta);
  const key = Object.keys(stored).find(k => k.startsWith('__collection:'));
  expect(stored[key].name).toBe('Кавказ');
  expect(stored[key].items[0].name).toBe('Тбилиси');
  await page.locator('#collMapBtn').click();
  await expect(page.locator('#collectionChip')).toContainText('Кавказ');
  await expectNoErrors(errors);
});

test('коллекции в версии для друзей — только просмотр', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'достаточно одной раскладки');
  const { errors } = await openApp(page, { build: 'friends' });
  await page.evaluate(() => document.getElementById('openCollectionsBtn').click());
  await expect(page.locator('.coll-card').first()).toBeVisible();
  await expect(page.locator('#collNewBtn')).toHaveCount(0);
  await expectNoErrors(errors);
});

for(const [file, label] of [['timeline-android.json', 'Android'], ['timeline-ios.json', 'iPhone'], ['timeline-takeout.json', 'Takeout']]){
  test(`импорт Google Maps (${label}): поездки, страны, добавление`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop' && label !== 'Android', 'раскладку проверяем на одном формате');
    const { errors } = await openApp(page, { entries: [] });
    await page.evaluate(() => document.getElementById('openPhotoImportBtn').click());
    await page.locator('[data-imp-tab="gtl"]').click();
    await page.setInputFiles('#gtlInput', path.join(__dirname, 'fixtures', file));
    await expect(page.locator('.gtl-trip')).toHaveCount(2);
    await expect(page.locator('#gtlStatus')).toContainText('поездок вне дома: 2');
    await expect(page.locator('.gtl-trip').first()).toContainText('Грузия — страна');
    await page.locator('#gtlApply').click();
    const added = await page.evaluate(() => allEntries.map(e => `${e.type}:${e.name}:${e.year}-${e.month}`).sort());
    expect(added).toEqual(['city:Казань:2024-5', 'city:Тбилиси:2024-9', 'country:Грузия:2024-9']);
    // повторно то же не предлагается: осталась только Грузия с безымянным местом (Местиа без сети)
    await expect(page.locator('.gtl-trip')).toHaveCount(1);
    await expect(page.locator('#gtlResults')).not.toContainText('Казань');
    await expectNoErrors(errors);
  });
}
