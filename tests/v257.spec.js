// v2.57: приложению больше не нужны глобальные имена. У обычного посетителя на
// window только один объект __travelMap; кнопки в карточке на карте и заглушка
// для сломанного фото работают через addEventListener, а не onclick в разметке.
const { test, expect } = require('@playwright/test');
const { openApp, sampleEntries, expectNoErrors } = require('./helpers');

function entries(){
  const base = { photos: [], purpose: 'tourism', status: 'visited', countryKey: 'Russia', color: '#3F5240', year: 2024, month: 5 };
  return [
    ...sampleEntries(),
    { ...base, id: 'ci_ph', type: 'city', name: 'Ярославль', lat: 57.63, lng: 39.87, photos: ['https://photos.test/broken.jpg'] },
    { ...base, id: 'ci_wl', type: 'city', name: 'Кострома', lat: 57.77, lng: 40.93, status: 'wishlist', year: 2027 },
  ];
}

// как у обычного посетителя: браузер не под автоматизацией
async function openAsVisitor(page, opts){
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  return openApp(page, opts);
}
const popupOf = (page, id) => page.evaluate(id => {
  const tm = window.__travelMap;
  tm.focusEntry(tm.allEntries.find(e => e.id === id));
}, id);

test('у посетителя имена приложения не попадают на window', async ({ page }) => {
  const { errors } = await openAsVisitor(page, { entries: entries() });
  const seen = await page.evaluate(() => ({
    webdriver: navigator.webdriver,
    globals: ['allEntries', 'deleteEntry', 'upgradeToVisited', 'photoFailed', 'haversine', 'rebuildAll'].filter(k => k in window),
    hook: typeof window.__travelMap,
    entries: window.__travelMap.allEntries.length,
    enumerableHook: Object.keys(window).includes('__travelMap'),
  }));
  expect(seen).toEqual({ webdriver: false, globals: [], hook: 'object', entries: entries().length, enumerableHook: false });
  await expectNoErrors(errors);
});

test('сломанное фото в карточке заменяется заглушкой', async ({ page }) => {
  const { errors } = await openAsVisitor(page, { entries: entries() });
  await popupOf(page, 'ci_ph');
  await expect(page.locator('.leaflet-popup .img-failed')).toHaveText('фото не открывается');
  await expect(page.locator('.leaflet-popup img[data-photo]')).toHaveCount(0);
  await expectNoErrors(errors);
});

test('заглушка появляется и для картинки, сломавшейся до вставки в документ', async ({ page }) => {
  const { errors } = await openAsVisitor(page, { entries: entries() });
  const ok = await page.evaluate(async () => {
    const box = document.createElement('div');
    box.innerHTML = '<img data-photo src="https://photos.test/also-broken.jpg">';
    const img = box.firstChild;
    await new Promise(r => { img.addEventListener('error', r, { once: true }); });
    document.body.appendChild(box);
    await new Promise(r => setTimeout(r, 50));
    const res = !!box.querySelector('.img-failed') && !box.querySelector('img');
    box.remove();
    return res;
  });
  expect(ok).toBe(true);
  await expectNoErrors(errors);
});

test('кнопки в карточке: «отметить как посещённое» и «удалить»', async ({ page }) => {
  const { errors } = await openAsVisitor(page, { entries: entries() });
  await popupOf(page, 'ci_wl');
  await page.locator('.leaflet-popup [data-popup-act="upgrade"]').click();
  await expect.poll(() => page.evaluate(() => window.__travelMap.allEntries.find(e => e.id === 'ci_wl').status)).toBe('visited');
  await expect(page.locator('.leaflet-popup')).toHaveCount(0); // карточка закрывается (с короткой анимацией)

  await popupOf(page, 'ci_ph');
  await page.locator('.leaflet-popup [data-popup-act="delete"]').click();
  await expect.poll(() => page.evaluate(() => window.__travelMap.allEntries.some(e => e.id === 'ci_ph'))).toBe(false);
  await expect(page.locator('.leaflet-popup')).toHaveCount(0);
  await expectNoErrors(errors);
});
