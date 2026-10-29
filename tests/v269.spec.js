// v2.69: контуры встроены компактно, шрифт флагов — отдельным файлом,
// навигация по статистике, моря на картинке «Год в путешествиях»
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { openApp, expectNoErrors, ROOT } = require('./helpers');

test('собранный файл: шрифт флагов не вшит, лежит рядом и совпадает с исходным', async ({}, info) => {
  test.skip(info.project.name !== 'desktop', 'проверка файла');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  expect(html).not.toContain('font/woff2;base64');
  expect(html).toMatch(/var FLAG_FONT_URL = 'fonts\/flags\.woff2\?v=[0-9a-f]{8}'/);
  expect(fs.readFileSync(path.join(ROOT, 'fonts/flags.woff2')).equals(fs.readFileSync(path.join(ROOT, 'src/assets/flags.woff2')))).toBe(true);
  expect(html).not.toContain('"type":"FeatureCollection","features":[{"type":"Feature","properties":{"name":"Afghanistan"}');
});

test('контуры стран и регионов в приложении — те же, что в исходных файлах', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'достаточно одной раскладки');
  const { errors } = await openApp(page);
  const [c, r] = await page.evaluate(() => [JSON.stringify(COUNTRIES_GEOJSON.features.map(f => [f.properties, f.geometry])), JSON.stringify(RU_REGIONS_GEOJSON.features.map(f => [f.properties, f.geometry]))]);
  const src = f => JSON.stringify(JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data', f), 'utf8')).features.map(x => [x.properties, x.geometry]));
  expect(c === src('countries.min.json')).toBe(true);
  expect(r === src('ru_regions.json')).toBe(true);
  // и работает как раньше: страна по точке, регион по точке
  expect(await page.evaluate(() => findCountryFeature({ lat: 41.69, lng: 44.8 }).properties.name)).toBe('Georgia');
  await expectNoErrors(errors);
});

test('статистика: строка разделов прокручивает к разделу, «Свернуть всё» запоминается', async ({ page }) => {
  const { errors } = await openApp(page);
  await page.evaluate(() => { mnavShow('list'); document.querySelector('[data-lsw="stats"]').click(); });
  const nav = page.locator('.stats-nav');
  await expect(nav).toBeVisible();
  await expect(nav.locator('[data-sn]')).toHaveCount(9);
  // строка не под шапкой листа и не под переключателем «Записи / Статистика»
  const overlap = await page.evaluate(() => { const n = document.querySelector('.stats-nav').getBoundingClientRect(), s = document.getElementById('listSwitch');
    if(!s || getComputedStyle(s).display === 'none') return false; const r = s.getBoundingClientRect(); return n.top < r.bottom - 1 && n.bottom > r.top + 1; });
  expect(overlap).toBe(false);
  await nav.locator('[data-sn]', { hasText: 'Сезоны' }).click();
  await expect.poll(() => page.evaluate(() => { const t = [...document.querySelectorAll('#mnavStatsSection > .section-title')].find(x => x.textContent.trim().startsWith('Сезонность'));
    return Math.abs(t.getBoundingClientRect().top - document.querySelector('.stats-nav').getBoundingClientRect().bottom) < 12; }), { timeout: 4000 }).toBe(true);
  await expect(nav.locator('[data-sn].on')).toHaveText('Сезоны');
  await nav.locator('[data-sn]', { hasText: 'Моря' }).click();
  await expect(nav.locator('[data-sn].on')).toHaveText('Моря', { timeout: 4000 });
  // свёрнутый раздел раскрывается при переходе
  await nav.locator('[data-sn-all]').click();
  await expect(nav.locator('[data-sn-all]')).toHaveText('Развернуть всё');
  expect(await page.evaluate(() => [...document.querySelectorAll('#mnavStatsSection > .section-title')].every(t => t.classList.contains('collapsed')))).toBe(true);
  await nav.locator('[data-sn]', { hasText: 'Города' }).click();
  await expect(page.locator('#topCitiesList')).toBeVisible();
  await expect(nav.locator('[data-sn-all]')).toHaveText('Свернуть всё');
  await page.reload();
  await page.waitForFunction(() => window.__travelMap && __travelMap.allEntries);
  expect(await page.evaluate(() => { const t = [...document.querySelectorAll('#mnavStatsSection > .section-title')]; return [t.find(x => /городов/.test(x.textContent)).classList.contains('collapsed'), t.find(x => /Сезонность/.test(x.textContent)).classList.contains('collapsed')]; })).toEqual([false, true]);
  await expectNoErrors(errors);
});

test('картинка «Год в путешествиях»: строка морей, впервые увиденные — первыми', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'достаточно одной раскладки');
  const base = { photos: [], purpose: 'tourism', status: 'visited', color: '#3F5240' };
  const entries = [
    { ...base, id: 'a', type: 'city', name: 'Сочи', lat: 43.585, lng: 39.723, year: 2023, month: 7 },
    { ...base, id: 'b', type: 'city', name: 'Сочи', lat: 43.585, lng: 39.723, year: 2024, month: 7 },
    { ...base, id: 'c', type: 'city', name: 'Таллин', lat: 59.437, lng: 24.745, year: 2024, month: 3 }
  ];
  const { errors } = await openApp(page, { entries });
  await page.evaluate(() => {
    window.__texts = [];
    const f = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function(t){ window.__texts.push(String(t)); return f.apply(this, arguments); };
    document.getElementById('openRecapBtn').click();
    const s = document.getElementById('recapYear'); s.value = '2024'; s.dispatchEvent(new Event('change'));
  });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#recapDownload')]);
  const png = fs.readFileSync(await dl.path());
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  const texts = await page.evaluate(() => window.__texts);
  expect(texts).toContain('МОРЯ И ОКЕАНЫ · 2, ВПЕРВЫЕ 1');
  expect(texts).toContain('Балтийское, Чёрное');
  await expectNoErrors(errors);
});
