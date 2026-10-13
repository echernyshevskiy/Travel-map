// Поиск по всей карте, справочник городов без сети, флаги, кнопки карты
const { test, expect } = require('@playwright/test');
const { openApp, expectNoErrors } = require('./helpers');

async function openSearch(page, info){
  if(info.project.name === 'phone') await page.locator('[data-mtab-btn="list"]').click();
}

test('страна мира: из поиска — на карту с карточкой', async ({ page }, info) => {
  const { errors } = await openApp(page);
  await openSearch(page, info);
  await page.fill('#globalSearch', 'Перу');
  await expect(page.locator('#worldSuggest')).toContainText('Лима');
  await page.locator('#worldSuggest [data-ws]').first().click();
  await expect(page.locator('.leaflet-popup')).toContainText('Перу');
  await expectNoErrors(errors);
});

test('город мира без сети: карточка и «Хочу посетить»', async ({ page, context }, info) => {
  const { errors } = await openApp(page);
  await context.setOffline(true);
  await openSearch(page, info);
  await page.fill('#globalSearch', 'Кельн');           // «е» вместо «ё» тоже находит
  await expect(page.locator('#worldSuggest')).toContainText('Кёльн');
  await page.locator('#worldSuggest [data-ws]').first().click();
  await expect(page.locator('.leaflet-popup')).toContainText('Германия');
  await page.locator('.leaflet-popup [data-ws-act="wish"]').click();
  await expect.poll(() => page.evaluate(() => allEntries.filter(e => e.name === 'Кёльн' && e.status === 'wishlist' && e.countryKey === 'Germany').length)).toBe(1);
  await expectNoErrors(errors);
});

test('форма добавления города без сети берёт справочник', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'desktop', 'достаточно одной раскладки');
  await openApp(page);
  await context.setOffline(true);
  await page.locator('.type-btn[data-type="city"]').click();
  await page.fill('#citySearch', 'Казан');
  await page.locator('#citySuggest .suggest-item').first().click();
  expect(await page.evaluate(() => [pendingCityName, document.getElementById('fieldCityCountry').value])).toEqual(['Казань', 'Russia']);
});

test('шрифт флагов подключается, когда система их не рисует', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'достаточно одной раскладки');
  // имитация Windows: проверка рисования флага «проваливается»
  await page.addInitScript(() => {
    const g = HTMLCanvasElement.prototype.getContext; let first = true;
    HTMLCanvasElement.prototype.getContext = function(){ if(first){ first = false; return null; } return g.apply(this, arguments); };
  });
  await openApp(page);
  expect(await page.evaluate(() => window.FLAG_FONT_NEEDED)).toBe(true);
  await expect.poll(() => page.evaluate(() => document.fonts.check('16px "Twemoji Country Flags"', '🇬🇪'))).toBe(true);
});

test('кнопка темы — на карте, подпись карты не наезжает на таймлайн', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('.map-controls #themeToggleBtn')).toBeVisible();
  await page.locator('#themeToggleBtn').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.evaluate(() => { tileFallbackDone = true; setBasemap('street'); });
  const [a, t] = await page.evaluate(() => [document.querySelector('.leaflet-control-attribution').getBoundingClientRect().toJSON(),
                                           document.getElementById('timelineBar').getBoundingClientRect().toJSON()]);
  expect(a.top >= t.bottom - 0.5 || a.right <= t.left || a.bottom <= t.top).toBe(true);
});
