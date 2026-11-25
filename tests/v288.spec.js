// v2.88: журнал перелётов — маршрут с занятием «перелёт»: аэропорты из
// справочника, дуга большого круга, свои километры («в воздухе»), которые не
// складываются с пройденными; номер рейса друзьям не показывается
const { test, expect } = require('@playwright/test');
const { openApp, expectNoErrors, sampleEntries } = require('./helpers');

const openRouteForm = async (page, info) => {
  if (info.project.name === 'desktop') await page.click('#stab-add');
  else await page.evaluate(() => mnavShow('add'));
  await page.locator('.type-btn[data-type="route"]').click();
  await page.selectOption('#fieldActivity', 'flight');
};
const pickAirport = async (page, side, query, code) => {
  const input = page.locator(side === 'from' ? '#flightFromSearch' : '#flightToSearch');
  await input.fill(query);
  const item = page.locator(`${side === 'from' ? '#flightFromSuggest' : '#flightToSuggest'} [data-airport="${code}"]`);
  await expect(item).toBeVisible();
  await item.dispatchEvent('mousedown');
  await expect(page.locator(side === 'from' ? '#flightFromPicked' : '#flightToPicked')).toContainText(code);
};

test.describe('журнал перелётов', () => {
  test('добавить перелёт: аэропорты по коду и городу, дуга, километры, номер рейса', async ({ page }, info) => {
    const { errors } = await openApp(page);
    await openRouteForm(page, info);
    // источник маршрута (GPX / по городам) для перелёта не нужен
    await expect(page.locator('#flightFields')).toBeVisible();
    await expect(page.locator('#routeSourceBlock')).toBeHidden();
    await pickAirport(page, 'from', 'svo', 'SVO');
    await pickAirport(page, 'to', 'Санкт-Петер', 'LED');
    await expect(page.locator('#flightHint')).toContainText('км по дуге');
    await page.fill('#fieldFlightNo', ' SU  30 ');
    const before = await page.evaluate(() => allEntries.length);
    await page.click('#saveBtn');
    await expect.poll(() => page.evaluate(() => allEntries.length)).toBe(before + 1);
    const e = await page.evaluate(() => {
      const x = allEntries[allEntries.length - 1];
      return { ...x, n: getEntryCoords(x).length };
    });
    expect(e.type).toBe('route');
    expect(e.activity).toBe('flight');
    expect(e.airports).toEqual(['SVO', 'LED']);
    expect(e.flightNo).toBe('SU 30');
    expect(e.name).toBe('Москва — Санкт-Петербург');
    expect(e.distanceKm).toBeGreaterThan(580);
    expect(e.distanceKm).toBeLessThan(620);
    expect(e.n).toBe(65); // дуга, а не две точки
    expect(e.waypointCountryKeys).toEqual(['Russia', 'Russia']);
    // форма очищена
    await expect(page.locator('#flightFromPicked')).toBeEmpty();
    await expectNoErrors(errors);
  });

  test('статистика: километры в воздухе отдельно, наземные маршруты без перелётов', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'достаточно одной раскладки');
    const base = sampleEntries();
    const groundKm = base.filter(e => e.type === 'route' && e.status !== 'wishlist').reduce((s, e) => s + e.distanceKm, 0);
    const longestGround = base.filter(e => e.type === 'route').sort((a, b) => b.distanceKm - a.distanceKm)[0].name;
    const flight = (id, a, b, km, year) => ({
      id,
      type: 'route',
      activity: 'flight',
      name: `${a} — ${b}`,
      year,
      month: 5,
      status: 'visited',
      color: '#4F6A86',
      photos: [],
      airports: [a, b],
      distanceKm: km,
      waypointNames: [a, b],
      waypointCoords: [
        [55.97, 37.38],
        [41.66, 44.95]
      ],
      waypointCountryKeys: ['Russia', 'Georgia'],
      coordsEncoded: '_p~iF~ps|U_ulLnnqC'
    });
    const entries = [...base, flight('f1', 'SVO', 'TBS', 1650, 2024), flight('f2', 'TBS', 'SVO', 1650, 2024), flight('f3', 'SVO', 'NRT', 7500, 2025)];
    const { errors } = await openApp(page, { entries });
    await page.click('#stab-stats');
    const r = await page.evaluate(() => {
      updateFilteredStats();
      updateStats();
      return {
        rows: !document.getElementById('flightStatsRows').hidden,
        flights: document.getElementById('statFlightsF').textContent,
        km: document.getElementById('statFlightKmF').textContent,
        airports: document.getElementById('statAirportsF').textContent,
        longestFlight: document.getElementById('statLongestFlightF').textContent,
        top: document.getElementById('statTopFlightF').textContent,
        longest: document.getElementById('statLongestF').textContent,
        glanceKm: document.getElementById('statKm').textContent
      };
    });
    expect(r.rows).toBe(true);
    expect(r.flights).toBe('3');
    expect(r.km).toMatch(/^10\s800 км/);
    expect(r.airports).toBe('3');
    expect(r.longestFlight).toContain('SVO — NRT');
    expect(r.top).toBe('SVO ↔ TBS · 2 раз');
    // самый длинный маршрут и километры на карте — без перелётов
    expect(r.longest).toContain(longestGround);
    expect(Number(r.glanceKm)).toBe(Math.round(groundKm));
    await expectNoErrors(errors);
  });

  test('правка перелёта: занятие не меняется, номер рейса — да; линия пунктиром', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'достаточно одной раскладки');
    const { errors } = await openApp(page);
    await openRouteForm(page, info);
    await pickAirport(page, 'from', 'NRT', 'NRT');
    await pickAirport(page, 'to', 'SFO', 'SFO');
    await page.click('#saveBtn');
    await expect.poll(() => page.evaluate(() => allEntries.some(e => e.airports && e.airports[1] === 'SFO'))).toBe(true);
    const r = await page.evaluate(() => {
      const e = allEntries.find(x => x.airports && x.airports[1] === 'SFO');
      const c = getEntryCoords(e);
      let jump = 0;
      for (let i = 1; i < c.length; i++) jump = Math.max(jump, Math.abs(c[i][1] - c[i - 1][1]));
      return { id: e.id, jump, dash: layers[e.id] && layers[e.id].options.dashArray };
    });
    // через линию перемены дат — без скачка через весь мир
    expect(r.jump).toBeLessThan(10);
    expect(r.dash).toBe('2,7');
    await page.evaluate(id => startEdit(allEntries.find(e => e.id === id)), r.id);
    await expect(page.locator('#fieldActivity')).toBeDisabled();
    await expect(page.locator('#flightFields')).toBeVisible();
    await expect(page.locator('#flightFromSearch')).toBeHidden();
    await expect(page.locator('#editWaypointsField')).toBeHidden();
    await page.fill('#fieldFlightNo', 'JL 1');
    await page.click('#saveBtn');
    await expect.poll(() => page.evaluate(id => allEntries.find(e => e.id === id).flightNo, r.id)).toBe('JL 1');
    expect(await page.evaluate(id => allEntries.find(e => e.id === id).activity, r.id)).toBe('flight');
    await expect(page.locator('#fieldActivity')).toBeEnabled();
    await expectNoErrors(errors);
  });

  test('без аэропортов не сохраняется; фильтр «Перелёт» есть', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'достаточно одной раскладки');
    const { errors } = await openApp(page);
    await openRouteForm(page, info);
    const before = await page.evaluate(() => allEntries.length);
    await page.click('#saveBtn');
    await expect(page.locator('.toast').last()).toContainText('Выберите аэропорты');
    expect(await page.evaluate(() => allEntries.length)).toBe(before);
    expect(await page.evaluate(() => ACTIVITIES.some(a => a.key === 'flight'))).toBe(true);
    await expectNoErrors(errors);
  });
});

test('версия для друзей: коды аэропортов видны, номер рейса — нет', async ({}, info) => {
  test.skip(info.project.name !== 'desktop', 'достаточно одной раскладки');
  const fs = require('fs'),
    os = require('os'),
    path = require('path');
  const { execFileSync } = require('child_process');
  const { ROOT, readBaked } = require('./helpers');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'friends-'));
  const dataFile = path.join(tmp, 'data.json'),
    out = path.join(tmp, 'friends', 'index.html');
  const f = { ...sampleEntries().find(e => e.type === 'route'), id: 'fl1', activity: 'flight', airports: ['SVO', 'LED'], flightNo: 'SU 1234', year: 2024 };
  fs.writeFileSync(dataFile, JSON.stringify({ entries: [...sampleEntries(), f] }));
  const log = execFileSync('node', [
    path.join(ROOT, 'scripts/build-friends.mjs'),
    '--src',
    path.join(ROOT, 'index.html'),
    '--out',
    out,
    '--data',
    dataFile
  ]).toString();
  const html = fs.readFileSync(out, 'utf8');
  const baked = readBaked(html).entries.find(e => e.id === 'fl1');
  expect(baked.airports).toEqual(['SVO', 'LED']);
  expect('flightNo' in baked).toBe(false);
  expect(html).not.toContain('SU 1234');
  expect(log).not.toContain('Не опубликованы незнакомые поля');
});

test('поиск аэропорта: по городу сначала крупные аэропорты этого города', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'достаточно одной раскладки');
  await openApp(page);
  const codes = await page.evaluate(async () => {
    await loadAirports();
    return { mos: searchAirports('мос').map(a => a.code), tok: searchAirports('Токио').map(a => a.code), code: searchAirports('led')[0].code };
  });
  expect(codes.mos.slice(0, 3).sort()).toEqual(['DME', 'SVO', 'VKO']);
  expect(codes.tok.slice(0, 2).sort()).toEqual(['HND', 'NRT']);
  expect(codes.code).toBe('LED');
});
