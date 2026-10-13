// v2.47: квиз по регионам, разрывы GPX, слияние по полям, срок токена, кэш геокодера, ярлыки
const { test, expect } = require('@playwright/test');
const { openApp, expectNoErrors, encodePolyline } = require('./helpers');

test('«Где это?» по регионам России: контуры, попадание, выход', async ({ page }) => {
  const { errors } = await openApp(page);
  await page.evaluate(() => document.getElementById('openQuizBtn').click());
  await page.locator('[data-qmode="ruregion"]').click();
  await expect(page.locator('[data-qset]')).toHaveCount(3); // все / где был / где не был
  await page.locator('#quizStartBtn').click();
  await expect(page.locator('#quizMapPanel')).toBeVisible();
  expect(await page.evaluate(() => document.querySelectorAll('#map path.quiz-base').length)).toBeGreaterThan(80);
  const xy = await page.evaluate(() => {
    const k = quizState.queue[0], r = RU_REGIONS.find(x => x.name === k);
    // точка заведомо внутри региона: ближайший к центру узел сетки 25×25
    const b = quizBounds(k), c = b.getCenter();
    let at = null, best = Infinity;
    for(let i = 1; i < 25; i++) for(let j = 1; j < 25; j++){
      const lat = b.getSouth() + (b.getNorth() - b.getSouth()) * i / 25, lng = b.getWest() + (b.getEast() - b.getWest()) * j / 25;
      const d = (lat - c.lat) ** 2 + (lng - c.lng) ** 2;
      if(d < best && pointInGeometry([lat, lng], r.geometry)){ best = d; at = L.latLng(lat, lng); }
    }
    map.fitBounds(quizBounds(k), { animate: false });
    const pt = map.latLngToContainerPoint(at), box = document.getElementById('map').getBoundingClientRect();
    return [box.left + pt.x, box.top + pt.y];
  });
  await page.mouse.click(xy[0], xy[1]);
  await expect(page.locator('#quizMapFeedback')).toContainText('Верно');
  // панель не закрывает кнопки масштаба
  const overlap = await page.evaluate(() => {
    const a = document.querySelector('.leaflet-control-zoom').getBoundingClientRect(), b = document.getElementById('quizMapPanel').getBoundingClientRect();
    return !(a.right <= b.left || a.bottom <= b.top || b.bottom <= a.top || b.right <= a.left);
  });
  expect(overlap).toBe(false);
  await page.locator('#quizMapExit2').click();
  expect(await page.evaluate(() => document.querySelectorAll('#map path.quiz-base').length)).toBe(0);
  await expectNoErrors(errors);
});

test('трек с разрывами: куски на карте, в GPX и KML', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'достаточно одной раскладки');
  const a = [], b = [];
  for(let i = 0; i < 20; i++){ a.push([55.70 + i * 0.002, 37.50 + i * 0.002]); b.push([55.90 + i * 0.002, 37.90 + i * 0.002]); }
  const entry = { id: 'gaps', type: 'route', name: 'Трек с разрывом', year: 2025, status: 'visited', color: '#3F5240', countryKey: 'Russia',
    activity: 'hiking', coordsEncoded: encodePolyline([...a, ...b]), segBreaks: [20], photos: [] };
  const { errors } = await openApp(page, { entries: [entry] });
  const r = await page.evaluate(() => {
    const e = allEntries[0];
    const gpx = buildGpx().xml, kml = buildKml().xml;
    return { segs: entrySegments(e).length, gpxSegs: (gpx.match(/<trkseg>/g) || []).length, kmlLines: (kml.match(/<LineString>/g) || []).length };
  });
  expect(r).toEqual({ segs: 2, gpxSegs: 2, kmlLines: 2 });
  await expectNoErrors(errors);
});

test('слияние по полям: заметка с одного устройства и год с другого не затирают друг друга', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'достаточно одной раскладки');
  await openApp(page);
  const r = await page.evaluate(() => {
    const base = { id: 'x', type: 'city', name: 'Казань', year: 2019, updatedAt: 100 };
    const phone = { ...base, notes: 'с телефона', updatedAt: 200, fieldTimes: { notes: 200 }, ftBase: 100 };
    const laptop = { ...base, year: 2021, updatedAt: 300, fieldTimes: { year: 300 }, ftBase: 100 };
    const m1 = mergeFields(phone, laptop), m2 = mergeFields(laptop, phone);
    const sameField = mergeFields({ ...base, name: 'A', updatedAt: 200, fieldTimes: { name: 200 }, ftBase: 100 },
                                  { ...base, name: 'B', updatedAt: 300, fieldTimes: { name: 300 }, ftBase: 100 });
    return { m1: [m1.notes, m1.year, m1.name], m2: [m2.notes, m2.year], same: sameField.name, at: m1.updatedAt };
  });
  expect(r.m1).toEqual(['с телефона', 2021, 'Казань']);
  expect(r.m2).toEqual(['с телефона', 2021]);
  expect(r.same).toBe('B');
  expect(r.at).toBe(300);
});

test('срок токена: разбор формата GitHub и предупреждение за две недели', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'достаточно одной раскладки');
  await openApp(page);
  const parsed = await page.evaluate(() => [
    new Date(parseTokenExpiry('2026-11-01 00:00:00 UTC')).toISOString(),
    new Date(parseTokenExpiry('2026-11-01 00:00:00 -0700')).toISOString(),
    isNaN(parseTokenExpiry('мусор'))
  ]);
  expect(parsed).toEqual(['2026-11-01T00:00:00.000Z', '2026-11-01T07:00:00.000Z', true]);
  await page.evaluate(() => {
    localStorage.setItem('travel-map-sync', JSON.stringify({ repo: 'a/b', token: 'github_pat_x', lastSyncAt: Date.now(),
      tokenExpires: new Date(Date.now() + 5 * 86400000).toISOString() }));
    renderSyncStatus();
  });
  await expect(page.locator('#syncStatus')).toContainText('пора создать новый');
  await expect(page.locator('#syncStatus')).toHaveClass(/warn/);
  await expect(page.locator('#syncReplaceTokenBtn')).toBeAttached();
});

test('геокодер: без сети название места берётся из справочника, ответы кэшируются', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'достаточно одной раскладки');
  let calls = 0;
  await openApp(page, { mocks: { 'nominatim.openstreetmap.org/reverse': () => { calls++; return { status: 200, contentType: 'application/json',
    body: JSON.stringify({ address: { city: 'Тестоград', country: 'Россия', country_code: 'ru' } }) }; } } });
  const r = await page.evaluate(async () => {
    const a = await reverseGeocode(56.1, 40.4);
    const b = await reverseGeocode(56.1, 40.4);
    Object.defineProperty(navigator, 'onLine', { get: () => false, configurable: true });
    const off = await reverseGeocode(55.75, 37.62);
    return [a && a.name, b && b.name, off && off.name];
  });
  expect(r).toEqual(['Тестоград', 'Тестоград', 'Москва']);
  expect(calls).toBe(1);
});

test('ярлыки на иконке: ?action=quiz открывает квиз, ?action=add — форму', async ({ page }) => {
  const { errors } = await openApp(page);
  await page.goto(page.url().split('?')[0] + '?action=quiz');
  await expect(page.locator('#quizModal')).toBeVisible();
  expect(page.url()).not.toContain('action=');
  await page.goto(page.url().split('?')[0] + '?action=add');
  await page.waitForTimeout(600);
  const shown = await page.evaluate(() => mnavOn() ? mnavTab === 'add'
    : document.getElementById('addEntrySection').getBoundingClientRect().top < 200);
  expect(shown).toBe(true);
  await expectNoErrors(errors);
});

test('в версии для друзей нет журнала изменений и полосы загрузки фото не видно', async ({ page }) => {
  const { errors } = await openApp(page, { build: 'friends' });
  await expect(page.locator('#openChangelogBtn')).toBeHidden();
  await expect(page.locator('#photoProgress')).toBeHidden();
  await expectNoErrors(errors);
});

test('контурная карта подписана: страны, города, регионы; в квизе подписей нет', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'достаточно одной раскладки');
  const { errors } = await openApp(page);
  await page.evaluate(() => { map.setView([56, 38], 6, { animate: false }); renderMapLabels(); });
  const n = await page.evaluate(() => ['ml-country', 'ml-region', 'ml-city'].map(c => document.querySelectorAll('.' + c).length));
  expect(n[0]).toBeGreaterThan(0); expect(n[1]).toBeGreaterThan(5); expect(n[2]).toBeGreaterThan(5);
  expect(await page.evaluate(() => [...document.querySelectorAll('.ml-city')].some(e => e.textContent === 'Московская'))).toBe(false);
  await page.evaluate(() => { tileFallbackDone = true; setBasemap('street'); });
  expect(await page.evaluate(() => document.querySelectorAll('.map-label').length)).toBe(0);
  await expectNoErrors(errors);
});
