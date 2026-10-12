// Нижние вкладки на телефоне
const { test, expect } = require('@playwright/test');
const { openApp, expectNoErrors } = require('./helpers');

test.beforeEach(async ({}, info) => { test.skip(info.project.name !== 'phone', 'только для телефона'); });

test('вкладки открывают свои разделы, карта на весь экран', async ({ page }) => {
  const { errors } = await openApp(page);
  await expect(page.locator('#mnavBar')).toBeVisible();
  await expect(page.locator('#sidebar')).toBeHidden();
  const h = await page.evaluate(() => document.getElementById('map').getBoundingClientRect().height / innerHeight);
  expect(h).toBeGreaterThan(0.8);
  const cases = { list: '#entryList', filters: '#yearChips', add: '#addEntrySection', more: '#openTableBtn' };
  for(const [tab, sel] of Object.entries(cases)){
    await page.locator(`[data-mtab-btn="${tab}"]`).click();
    await expect(page.locator(sel)).toBeVisible();
  }
  await page.locator('#mnavCloseBtn').click();
  await expect(page.locator('#sidebar')).toBeHidden();
  await expectNoErrors(errors);
});

test('из списка — к записи на карте; «Назад» закрывает панель', async ({ page }) => {
  await openApp(page);
  await page.locator('[data-mtab-btn="list"]').click();
  await page.locator('#entryList .entry-main').first().click();
  await expect(page.locator('#sidebar')).toBeHidden();
  await expect(page.locator('.leaflet-popup')).toBeVisible();
  await page.locator('[data-mtab-btn="filters"]').click();
  await expect(page.locator('#yearChips')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#sidebar')).toBeHidden();
});

test('правка открывает форму во вкладке', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => startEdit(allEntries.find(e => e.id === 'rt_city')));
  await expect(page.locator('#mnavSheetTitle')).toHaveText('Правка отметки');
  await expect(page.locator('#fieldActivity')).toBeVisible();
});
