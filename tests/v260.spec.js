// v2.60: облёт поездки, дуги из дома, регионы России, двойное касание,
// подсказка при наведении и клавиатура на глобусе; чистка названий остановок
const { test, expect } = require('@playwright/test');
const { openApp, expectNoErrors } = require('./helpers');

const enter = async page => { await page.click('#globeToggleBtn'); await expect(page.locator('#globeCanvas')).toBeVisible(); await page.waitForTimeout(150); };
const screenAt = (page, ll) => page.evaluate(ll => { const p = globe.proj(ll), r = globe.canvas.getBoundingClientRect(); return { x: r.left + p[0], y: r.top + p[1] }; }, ll);

test('облёт: из карточки маршрута — шар летит по маршруту, остановки загораются, в конце пауза', async ({ page }) => {
  const { errors } = await openApp(page);
  await page.evaluate(() => focusEntry(allEntries.find(e => e.id === 'rt_city')));
  await expect(page.locator('.leaflet-popup [data-tour-entry]')).toBeVisible();
  await page.click('.leaflet-popup [data-tour-entry]');
  await expect.poll(() => page.evaluate(() => globe.active && globeTour.active)).toBe(true);
  await expect(page.locator('.globe-tour')).toContainText('Москва — Санкт-Петербург');
  expect(await page.evaluate(() => globeTour.stops.map(s => s.name))).toEqual(['Москва', 'Тверь', 'Санкт-Петербург']);
  // ускоряем: длительность — полсекунды
  await page.evaluate(() => { globeTour.dur = 600; });
  await expect.poll(() => page.evaluate(() => globeTour.t), { timeout: 8000 }).toBe(1);
  await expect(page.locator('.globe-tour')).toContainText('Санкт-Петербург');
  await expect(page.locator('.globe-tour .gtour-play')).toHaveText('↻');
  // повтор и пауза кнопкой, жестом на шаре — тоже пауза
  await page.click('.globe-tour .gtour-play');
  expect(await page.evaluate(() => globeTour.paused)).toBe(false);
  const box = await page.locator('#globeCanvas').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.7); await page.mouse.down(); await page.mouse.up();
  expect(await page.evaluate(() => globeTour.paused)).toBe(true);
  await page.click('.globe-tour .gtour-x');
  await expect(page.locator('.globe-tour')).toBeHidden();
  expect(await page.evaluate(() => globeTour.active)).toBe(false);
  await expectNoErrors(errors);
});

test('облёт всей поездки со страницы поездки', async ({ page }) => {
  const { errors } = await openApp(page);
  await page.evaluate(() => openTripPage('Кавказ 2023'));
  await page.click('#tripPageModal [data-tour-trip]');
  await expect(page.locator('#tripPageModal')).toBeHidden();
  await expect.poll(() => page.evaluate(() => globeTour.active && globeTour.title)).toBe('Кавказ 2023');
  expect(await page.evaluate(() => globeTour.stops.map(s => s.name))).toEqual(['Тбилиси']);
  await expectNoErrors(errors);
});

test('дуги из дома: переключатель, запоминается', async ({ page }) => {
  const { errors } = await openApp(page);
  await expect(page.locator('#globeArcsBtn')).toBeHidden();        // только в режиме шара
  await enter(page);
  await expect(page.locator('#globeArcsBtn')).toBeVisible();
  await expect(page.locator('#globeArcsBtn')).toHaveClass(/active/);
  // пиксель на дуге Москва → Грузия чуть выше середины пути — цвета дуги, после выключения — нет
  const probe = () => page.evaluate(() => {
    globe.proj.rotate([-41, -48, 0]); globe.proj.scale(globeFitScale() * 2); globe.moving = false; globeDraw();
    const home = [37.6173, 55.7558], to = globeLabelPoint('Georgia', getCountryGeometry('Georgia'));
    const ll = d3interp(home, to, 0.5);
    const q = globe.projFull(ll), [cx, cy] = globe.proj.translate(), s = globe.proj.scale();
    const ang = globeAngle(home, to), h = (0.05 + 0.3 * ang / Math.PI);
    const x = cx + (q[0] - cx) * (1 + h), y = cy + (q[1] - cy) * (1 + h);
    const d = globe.dpr, px = globe.ctx.getImageData(Math.round(x * d), Math.round(y * d), 1, 1).data;
    return [px[0], px[1], px[2]];
    function d3interp(a, b, t){ const A = a.map(v => v * Math.PI / 180), B = b.map(v => v * Math.PI / 180);
      const v = ([l, p]) => [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)];
      const va = v(A), vb = v(B), w = Math.acos(va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]);
      const k1 = Math.sin((1 - t) * w) / Math.sin(w), k2 = Math.sin(t * w) / Math.sin(w);
      const r = va.map((x, i) => k1 * x + k2 * vb[i]);
      return [Math.atan2(r[1], r[0]) * 180 / Math.PI, Math.asin(r[2]) * 180 / Math.PI]; }
  });
  const on = await probe();
  await page.click('#globeArcsBtn');
  const off = await probe();
  expect(Math.abs(on[0] - off[0]) + Math.abs(on[1] - off[1]) + Math.abs(on[2] - off[2])).toBeGreaterThan(30);
  await page.reload();
  await page.waitForFunction(() => window.__travelMap && globe.active);
  await expect(page.locator('#globeArcsBtn')).not.toHaveClass(/active/);
  await expectNoErrors(errors);
});

test('двойное касание по стране приближает к ней', async ({ page }) => {
  const { errors } = await openApp(page);
  await enter(page);
  await page.evaluate(() => { globe.proj.rotate([-40, -45, 0]); globe.proj.scale(globeFitScale() * 1.5); globe.moving = false; globeDraw(); });
  const s0 = await page.evaluate(() => globe.proj.scale());
  const pt = await screenAt(page, [43.4, 42.2]);
  await page.mouse.click(pt.x, pt.y); await page.waitForTimeout(80); await page.mouse.click(pt.x, pt.y);
  await expect.poll(() => page.evaluate(() => !globe.flight)).toBe(true);
  const st = await page.evaluate(() => ({ s: globe.proj.scale(), c: globeCenter(), tip: globe.tip.style.display }));
  expect(st.s).toBeGreaterThan(s0 * 1.2);
  expect(st.c.lng).toBeGreaterThan(41); expect(st.c.lng).toBeLessThan(46.5);
  expect(st.c.lat).toBeGreaterThan(40.5); expect(st.c.lat).toBeLessThan(43.8);
  expect(st.tip).toBe('none');
  await expectNoErrors(errors);
});

test('на ПК: название под курсором и клавиатура', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'мышь и клавиатура — на ПК');
  const { errors } = await openApp(page);
  await enter(page);
  await page.evaluate(() => { globe.proj.rotate([-43, -42, 0]); globe.proj.scale(globeFitScale() * 4); globe.moving = false; globeDraw(); });
  const pt = await screenAt(page, [42.6, 42.2]);
  await page.mouse.move(pt.x - 30, pt.y); await page.mouse.move(pt.x, pt.y, { steps: 3 });
  await expect(page.locator('.globe-hover')).toContainText('Грузия');
  const r0 = await page.evaluate(() => globe.proj.rotate()[0]);
  await page.keyboard.press('ArrowLeft');
  expect(await page.evaluate(() => globe.proj.rotate()[0])).toBeGreaterThan(r0);
  const s0 = await page.evaluate(() => globe.proj.scale());
  await page.keyboard.press('-');
  await expect.poll(() => page.evaluate(() => globe.proj.scale())).toBeLessThan(s0);
  await expectNoErrors(errors);
});

test('регионы России на шаре — по переключателю слоя', async ({ page }) => {
  const { errors } = await openApp(page);
  await enter(page);
  const fill = () => page.evaluate(() => {
    globe.proj.rotate([-49.1, -55.8, 0]); globe.proj.scale(globeFitScale() * 3); globe.moving = false; globeDraw();
    const p = globe.proj([50.2, 55.4]), d = globe.dpr;   // Татарстан (Казань отмечена), в стороне от точки города
    return [...globe.ctx.getImageData(Math.round(p[0] * d), Math.round(p[1] * d), 1, 1).data].slice(0, 3);
  });
  const on = await fill();
  await page.evaluate(() => document.getElementById('ruRegionsChip').click());
  const off = await fill();
  expect(on[2] - on[0]).toBeGreaterThan(off[2] - off[0]);   // посещённый регион — с серо-синей заливкой
  await expectNoErrors(errors);
});

test('служебные слова в названиях остановок не показываются; «Проверка данных» их находит', async ({ page }) => {
  const wp = [[-34.05, 19.30], [-33.96, 22.46], [-34.0, 25.0]];
  const { encodePolyline, sampleEntries } = require('./helpers');
  const entries = [...sampleEntries(), { id: 'rt_za', type: 'route', name: 'Юг Африки', year: 2019, month: 1, color: '#3F5240', status: 'visited', photos: [], purpose: 'tourism',
    coordsEncoded: encodePolyline(wp), distanceKm: 600, isEstimated: true,
    waypointNames: ['Theewaterskloof Local Municipality', 'Джордж', 'Kouga Local Municipality'], waypointCoords: wp, waypointCountryKeys: ['South Africa', 'South Africa', 'South Africa'] }];
  const { errors } = await openApp(page, { entries });
  await page.evaluate(() => focusEntry(allEntries.find(e => e.id === 'rt_za')));
  await expect(page.locator('.leaflet-popup-content')).toContainText('через: Theewaterskloof → Джордж → Kouga');
  await page.evaluate(() => { map.closePopup(); renderDiagnostics(); document.getElementById('diagnosticsModal').style.display = 'flex'; });
  await expect(page.locator('#diagnosticsBody')).toContainText('Район вместо города');
  const btn = page.locator('[data-fixadmin-idx]').first();
  await expect(btn).toContainText('Сократить до «Theewaterskloof»');
  await btn.click();
  await expect.poll(() => page.evaluate(() => allEntries.find(e => e.id === 'rt_za').waypointNames[0])).toBe('Theewaterskloof');
  // отмена возвращает прежнее название (снимок — копия, а не ссылка на массив)
  await page.evaluate(() => undoLastAction());
  await expect.poll(() => page.evaluate(() => allEntries.find(e => e.id === 'rt_za').waypointNames[0])).toBe('Theewaterskloof Local Municipality');
  await expectNoErrors(errors);
});

test('точные даты: необязательны, подставляют год и месяц, видны в карточке и на странице поездки', async ({ page }) => {
  const { errors } = await openApp(page);
  // правим Тбилиси: открываем точные даты, ставим 12–18 мая 2023
  await page.evaluate(() => startEdit(allEntries.find(e => e.id === 'ci_tb')));
  await expect(page.locator('#exactDatesFields')).toBeHidden();
  await page.click('#exactDatesToggle');
  await page.fill('#fieldDateFrom', '2023-05-12');
  await page.dispatchEvent('#fieldDateFrom', 'change');
  await page.fill('#fieldDateTo', '2023-05-18');
  expect(await page.inputValue('#fieldYear')).toBe('2023');
  expect(await page.inputValue('#fieldMonth')).toBe('5');
  await page.evaluate(() => document.getElementById('saveBtn').click());
  await expect.poll(() => page.evaluate(() => { const e = allEntries.find(x => x.id === 'ci_tb'); return [e.dateFrom, e.dateTo, e.year, e.month]; }))
    .toEqual(['2023-05-12', '2023-05-18', 2023, 5]);
  await page.evaluate(() => focusEntry(allEntries.find(e => e.id === 'ci_tb')));
  await expect(page.locator('.leaflet-popup-content')).toContainText('12–18 мая 2023');
  await page.evaluate(() => { map.closePopup(); openTripPage('Кавказ 2023'); });
  await expect(page.locator('#tripPageBody .tp-period')).toHaveText('12–18 мая 2023');
  await expect(page.locator('#tripPageBody .tp-stats')).toContainText('7');
  // повторная правка: поля раскрыты и заполнены; «убрать» — даты стираются, месяц остаётся
  await page.evaluate(() => { document.getElementById('tripPageModal').style.display = 'none'; startEdit(allEntries.find(e => e.id === 'ci_tb')); });
  await expect(page.locator('#exactDatesFields')).toBeVisible();
  expect(await page.inputValue('#fieldDateTo')).toBe('2023-05-18');
  await page.click('#exactDatesToggle');
  await page.evaluate(() => document.getElementById('saveBtn').click());
  await expect.poll(() => page.evaluate(() => { const e = allEntries.find(x => x.id === 'ci_tb'); return [e.dateFrom || null, e.month]; })).toEqual([null, 5]);
  await expectNoErrors(errors);
});

test('точные даты: неверные из импорта отбрасываются', async ({ page }) => {
  const { sampleEntries } = require('./helpers');
  const entries = sampleEntries().map(e => e.id === 'ci_kz' ? { ...e, dateFrom: '2022-07-40', dateTo: '2022-07-10' } : e.id === 'ci_so' ? { ...e, dateFrom: '2021-08-05', dateTo: '2021-08-01' } : e);
  const { errors } = await openApp(page, { entries });
  const r = await page.evaluate(() => ['ci_kz', 'ci_so'].map(id => { const e = allEntries.find(x => x.id === id); return [e.dateFrom || null, e.dateTo || null]; }));
  expect(r).toEqual([[null, null], ['2021-08-05', null]]);
  await expectNoErrors(errors);
});

test('GPX с временем: точные даты похода подставляются сами', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'достаточно одной раскладки');
  const { errors } = await openApp(page);
  // двухдневный поход под Хабаровском: старт 21:30 UTC = 07:30 следующего дня по местному
  const pts = [[48.48, 135.08, '2024-08-09T21:30:00Z'], [48.50, 135.10, '2024-08-10T08:00:00Z'], [48.52, 135.12, '2024-08-10T22:10:00Z']];
  const gpx = '<?xml version="1.0"?><gpx><trk><trkseg>' + pts.map(([la, lo, t]) => `<trkpt lat="${la}" lon="${lo}"><ele>100</ele><time>${t}</time></trkpt>`).join('') + '</trkseg></trk></gpx>';
  await page.click('.type-btn[data-type="route"]');
  await page.setInputFiles('#gpxInput', { name: 'pohod.gpx', mimeType: 'application/gpx+xml', buffer: Buffer.from(gpx) });
  await expect(page.locator('#fileDrop')).toContainText('pohod');
  await page.evaluate(() => document.getElementById('saveBtn').click());
  await expect.poll(() => page.evaluate(() => { const e = allEntries.find(x => x.name === 'pohod'); return e ? [e.dateFrom, e.dateTo, e.year, e.month] : null; }))
    .toEqual(['2024-08-10', '2024-08-11', 2024, 8]);
  await expectNoErrors(errors);
});

test('тип путешественника: открывается из «Итогов», показывает образ, шкалы и факты', async ({ page }) => {
  const { errors } = await openApp(page);
  await page.evaluate(() => document.getElementById('openTravelerBtn').click());
  await expect(page.locator('#travelerModal')).toBeVisible();
  await expect(page.locator('#travelerBody .tt-title')).not.toBeEmpty();
  await expect(page.locator('#travelerBody .tt-axis')).toHaveCount(5);
  await expect(page.locator('#travelerBody .tt-facts')).toContainText('за границей');
  // положения на шкалах — в пределах 0–100 %
  const lefts = await page.$$eval('#travelerBody .tt-track i', els => els.map(e => parseFloat(e.style.left)));
  lefts.forEach(v => { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(100); });
  await expectNoErrors(errors);
});

test('коллекция «Всемирное наследие ЮНЕСКО»: весь список, страны, поиск, «в планы»', async ({ page }) => {
  const { errors } = await openApp(page);
  await page.evaluate(() => document.getElementById('openCollectionsBtn').click());
  const card = page.locator('[data-coll="unesco"]');
  await expect(card).toContainText('Всемирное наследие ЮНЕСКО');
  const total = await page.evaluate(() => unescoCollection().items.length);
  expect(total).toBeGreaterThan(1200);
  await expect(card).toContainText(`из ${total}`);
  await card.click();
  // Россия (дом, есть собранные) раскрыта сразу: Казанский кремль — по отметке «Казань» 2022
  const ru = page.locator('details.coll-cc[open]').first();
  await expect(ru.locator('summary')).toContainText('Россия');
  await expect(ru.locator('.coll-item.got', { hasText: 'Казанского кремля' })).toContainText('2022');
  // Московский Кремль — по остановке маршрута «Москва»
  await expect(ru.locator('.coll-item.got', { hasText: 'Московский Кремль' })).toBeVisible();
  // свёрнутые страны рисуются при раскрытии
  const fr = page.locator('details.coll-cc', { hasText: 'Франция' });
  expect(await fr.locator('.coll-item').count()).toBe(0);
  await fr.locator('summary').click();
  await expect(fr.locator('.coll-item.got', { hasText: 'берега Сены' })).toContainText('2019');
  // поиск по названию; ссылка на описание; «в планы»
  await page.fill('#collSearch', 'мачу');
  const mp = page.locator('#collSearchRes .coll-item', { hasText: 'Мачу-Пикчу' });
  await expect(mp).toBeVisible();
  await expect(page.locator('#collGroups')).toBeHidden();
  await expect(mp.locator('a')).toHaveAttribute('href', 'https://whc.unesco.org/ru/list/274/');
  await mp.locator('[data-ci-plan]').click();
  await expect.poll(() => page.evaluate(() => { const e = allEntries.find(x => x.name.includes('Мачу-Пикчу')); return e && [e.status, e.type, e.countryKey]; }))
    .toEqual(['wishlist', 'city', 'Peru']);
  // поиск по стране
  await page.fill('#collSearch', 'перу');
  expect(await page.locator('#collSearchRes .coll-item').count()).toBeGreaterThan(10);
  await page.fill('#collSearch', '');
  await expect(page.locator('#collGroups')).toBeVisible();
  await expectNoErrors(errors);
});

test('коллекция ЮНЕСКО считается быстро и на большом архиве', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'достаточно одной раскладки');
  const { errors } = await openApp(page);
  const ms = await page.evaluate(() => {
    // 2000 городов и 300 треков по 3000 точек по всей Европе
    let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for(let i = 0; i < 2000; i++) allEntries.push({ id: 'pc' + i, type: 'city', name: 'Г' + i, year: 2020, lat: 36 + rnd() * 30, lng: -10 + rnd() * 50, status: 'visited', photos: [] });
    for(let i = 0; i < 300; i++){
      let la = 36 + rnd() * 30, lo = -10 + rnd() * 50; const pts = [];
      for(let j = 0; j < 3000; j++){ la += (rnd() - 0.5) * 0.02; lo += (rnd() - 0.5) * 0.02; pts.push([la, lo]); }
      allEntries.push({ id: 'pr' + i, type: 'route', name: 'Т' + i, year: 2021, coordsEncoded: encodePolyline(pts), status: 'visited', photos: [] });
    }
    const t = performance.now();
    const idx = collectionVisitIndex();
    const p = collectionProgress(allCollections().find(c => c.id === 'unesco'), idx);
    return [performance.now() - t, p.got];
  });
  expect(ms[1]).toBeGreaterThan(50);
  expect(ms[0]).toBeLessThan(1500);
  await expectNoErrors(errors);
});
