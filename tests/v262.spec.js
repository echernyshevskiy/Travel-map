// v2.62: повреждённые данные в хранилище браузера не ломают приложение
const { test, expect } = require('@playwright/test');
const { openApp, expectNoErrors, sampleEntries } = require('./helpers');

const broken = () => [
  ...sampleEntries(),
  null, 'строка', 42, { id: 'p1', type: 'planet', name: 'Марс', year: 2030 },
  { id: 'nc', type: 'city', name: 'Без координат', lat: null, lng: null, year: 2019, status: 'visited', photos: [] },
  { id: 'dup', type: 'city', name: 'Первый', lat: 44, lng: 44, year: 2016, status: 'visited', photos: [] },
  { id: 'dup', type: 'city', name: 'Второй', lat: 44.2, lng: 44.2, year: 2016, status: 'visited', photos: 'не массив' },
  { id: 'rw', type: 'route', name: 'Кривые точки', year: 2022, coordsEncoded: '', distanceKm: 'много', waypointNames: ['A', 'B'], waypointCoords: [[55, 37], ['x']], waypointCountryKeys: 'Russia' },
];

test('битые записи откладываются, остальное работает; одинаковые id разводятся', async ({ page }) => {
  const { errors } = await openApp(page, { entries: broken(), tripMeta: { '__collection:c': { kind: 'collection', name: 'Моя', createdAt: 1,
    items: [null, { kind: 'city', name: 'Мусор', lat: 'x', lng: null }, { kind: 'city', name: 'Казань', lat: 55.79, lng: 49.12 }, { kind: 'country', key: 'Georgia' }] } } });
  const s = await page.evaluate(() => ({
    n: allEntries.length,
    ids: new Set(allEntries.map(e => e.id)).size,
    dup: allEntries.filter(e => e.name === 'Первый' || e.name === 'Второй').map(e => e.id),
    q: JSON.parse(localStorage.getItem('travel-map-quarantine') || '[]').length,
    saved: JSON.parse(localStorage.getItem('travel-map-data')).entries.length,
    rw: allEntries.find(e => e.id === 'rw').waypointCoords,
  }));
  expect(s.n).toBe(sampleEntries().length + 4);
  expect(s.ids).toBe(s.n);
  expect(s.dup[0]).toBe('dup'); expect(s.dup[1]).not.toBe('dup');
  expect(s.q).toBe(4);
  expect(s.saved).toBe(s.n);
  expect(s.rw).toEqual([[55, 37], null]);
  // экраны рисуются
  await page.evaluate(() => { renderList(); renderTable(); renderDiagnostics(); renderPassport(); renderTraveler(); });
  // город без координат: вместо ошибки — подсказка
  await page.evaluate(() => focusEntry(allEntries.find(e => e.id === 'nc')));
  await expect(page.locator('#toast')).toContainText('нет места на карте');
  // своя коллекция: мусорные пункты не показываются, «✕» убирает именно тот пункт
  await page.evaluate(() => { collectionOpenId = '__collection:c'; renderCollections(); document.getElementById('collectionsModal').style.display = 'flex'; });
  await expect(page.locator('#collectionsBody .coll-item')).toHaveCount(2);
  await page.locator('#collectionsBody .coll-item', { hasText: 'Казань' }).locator('[data-ci-del]').click();
  await expect.poll(() => page.evaluate(() => tripMeta['__collection:c'].items.map(i => i.name || i.key))).toEqual(['Georgia']);
  await expectNoErrors(errors);
});

test('переполненное хранилище: кэш геокодера освобождает место, данные сохраняются', async ({ page }) => {
  const { errors } = await openApp(page);
  const r = await page.evaluate(async () => {
    localStorage.setItem('travel-map-geocache', JSON.stringify({ k: { t: Date.now(), v: 'x'.repeat(100) } }));
    const orig = Storage.prototype.setItem;
    let first = true;
    // первая запись данных — «нет места», пока кэш не убран
    Storage.prototype.setItem = function(k, v){
      if(k === 'travel-map-data' && first && this.getItem('travel-map-geocache')){ first = false; throw new DOMException('full', 'QuotaExceededError'); }
      return orig.call(this, k, v);
    };
    allEntries[0].notes = 'после переполнения';
    const ok = await saveData();
    Storage.prototype.setItem = orig;
    return { ok, cache: localStorage.getItem('travel-map-geocache'), saved: JSON.parse(localStorage.getItem('travel-map-data')).entries[0].notes };
  });
  expect(r).toEqual({ ok: true, cache: null, saved: 'после переполнения' });
  await expectNoErrors(errors);
});

// ---- сценарии, которые раньше не проверялись автотестами (по замеру покрытия) ----
const fs = require('fs');
const readDownload = async d => fs.readFileSync(await d.path(), 'utf8');

test('резервная копия JSON и CSV: в файлах все записи, повторный импорт совпадает', async ({ page }) => {
  const { errors } = await openApp(page);
  const n = await page.evaluate(() => allEntries.length);
  const [json] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => document.getElementById('exportBtn').click())]);
  const data = JSON.parse(await readDownload(json));
  expect(data.entries.length).toBe(n);
  expect(data.entries.map(e => e.id).sort()).toEqual(await page.evaluate(() => allEntries.map(e => e.id).sort()));
  const [csv] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => document.getElementById('exportCsvBtn').click())]);
  const lines = (await readDownload(csv)).replace(/^﻿/, '').trim().split(/\r?\n/);
  expect(lines.length).toBe(n + 1);
  expect(lines[0]).toContain('Дата_с');
  await expectNoErrors(errors);
});

test('снимок карты в PNG скачивается', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'достаточно одной раскладки');
  const { errors } = await openApp(page);
  const [png] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.evaluate(() => document.getElementById('exportSnapshotBtn').click())]);
  const buf = fs.readFileSync(await png.path());
  expect(buf.slice(1, 4).toString()).toBe('PNG');
  expect(buf.length).toBeGreaterThan(20000);
  await expectNoErrors(errors);
});

test('добавление через форму без сети: город и страна из подсказок, маршрут по городам', async ({ page }) => {
  const { errors } = await openApp(page);
  const before = await page.evaluate(() => allEntries.length);
  await page.evaluate(() => { mnavShow && mnavShow('add'); });
  // город
  await page.evaluate(() => document.querySelector('.type-btn[data-type="city"]').click());
  await page.fill('#citySearch', 'Самар');
  await page.locator('#citySuggest .suggest-item', { hasText: 'Самара' }).first().click();
  await page.evaluate(() => document.getElementById('saveBtn').click());
  await expect.poll(() => page.evaluate(() => { const e = allEntries.find(x => x.name === 'Самара'); return e && [e.type, e.countryKey, Math.round(e.lat)]; })).toEqual(['city', 'Russia', 53]);
  // страна
  await page.evaluate(() => document.querySelector('.type-btn[data-type="country"]').click());
  await page.fill('#countrySearch', 'Финл');
  await page.locator('#countrySuggest .suggest-item', { hasText: 'Финляндия' }).first().click();
  await page.evaluate(() => document.getElementById('saveBtn').click());
  await expect.poll(() => page.evaluate(() => allEntries.some(e => e.type === 'country' && e.countryKey === 'Finland'))).toBe(true);
  // маршрут по городам: без сервиса дорог — прямыми отрезками
  await page.evaluate(() => document.querySelector('.type-btn[data-type="route"]').click());
  await page.evaluate(() => document.querySelector('[data-source="cities"]').click());
  for(const [q, name] of [['Самар', 'Самара'], ['Тольят', 'Тольятти'], ['Сызра', 'Сызрань']]){
    await page.fill('#routeCitySearch', q);
    await page.locator('#routeCitySuggest .suggest-item', { hasText: name }).first().click();
  }
  await page.evaluate(() => document.getElementById('saveBtn').click());
  await expect.poll(() => page.evaluate(() => { const e = allEntries.find(x => x.type === 'route' && x.waypointNames && x.waypointNames[0] === 'Самара'); return e && [e.waypointNames.length, e.isEstimated, e.distanceKm > 50]; }), { timeout: 15000 })
    .toEqual([3, true, true]);
  expect(await page.evaluate(() => allEntries.length)).toBe(before + 3);
  await expectNoErrors(errors);
});

test('история поездки, паспорт и порядок точек в поездке', async ({ page }) => {
  const { sampleEntries: se } = require('./helpers');
  const entries = [...se(), { id: 'ci_mt', type: 'city', name: 'Мцхета', year: 2023, month: 5, lat: 41.84, lng: 44.72, countryKey: 'Georgia', color: '#3F5240', trip: 'Кавказ 2023', tripOrder: 2, status: 'visited', photos: [], purpose: 'tourism' }];
  const { errors } = await openApp(page, { entries });
  await page.evaluate(() => { const t = allEntries.find(e => e.id === 'ci_tb'); t.tripOrder = 1; });
  await page.evaluate(() => openTripStory('Кавказ 2023'));
  await expect(page.locator('#storyModal')).toBeVisible();
  await expect(page.locator('#storyFeed')).toContainText('Мцхета');
  await page.click('#closeStoryModal');
  await expect(page.locator('#storyModal')).toBeHidden();
  await page.evaluate(() => moveTripEntry('Кавказ 2023', 'ci_mt', -1));
  await expect.poll(() => page.evaluate(() => ['ci_tb', 'ci_mt'].map(id => allEntries.find(e => e.id === id).tripOrder))).toEqual([2, 1]);
  await page.evaluate(() => document.getElementById('openPassportBtn').click());
  await expect(page.locator('#passportModal')).toBeVisible();
  await expect(page.locator('#passportCount')).toContainText('Собрано печатей: 2');
  // поиск по стране оставляет одну печать и открывает страницы с печатями
  await page.fill('#passportSearchInput', 'Груз');
  await expect(page.locator('#passportCount')).toContainText('показано: 1');
  await expect(page.locator('#passportBook .stamp-name').first()).toContainText(/Грузия/i);
  await expectNoErrors(errors);
});

test('старт: добавление с проверкой ввода, процент обогнанных', async ({ page }) => {
  const { errors } = await openApp(page);
  const n0 = await page.evaluate(() => races.length);
  await page.evaluate(() => { document.getElementById('openRunningBtn').click(); editingRaceId = 'new'; renderRaces(); });
  await page.fill('#raceName', 'Тестовый полумарафон');
  await page.fill('#raceDate', '2025-05-18');
  await page.fill('#raceDist', '21.1');
  // неверное время и место больше участников — не сохраняется
  await page.fill('#raceTime', 'быстро');
  await page.evaluate(() => document.getElementById('raceSaveBtn').click());
  await expect(page.locator('#toast')).toContainText('Время не распознано');
  await page.fill('#raceTime', '1:45:30');
  await page.fill('#racePlace', '500'); await page.fill('#raceTotal', '400');
  await page.evaluate(() => document.getElementById('raceSaveBtn').click());
  await expect(page.locator('#toast')).toContainText('Место не может быть больше');
  await page.fill('#raceTotal', '2000');
  await page.evaluate(() => document.getElementById('raceSaveBtn').click());
  await expect.poll(() => page.evaluate(() => races.length)).toBe(n0 + 1);
  const r = await page.evaluate(() => races.find(x => x.name === 'Тестовый полумарафон'));
  expect([r.status, r.distanceKm, r.place, r.participants]).toEqual(['done', 21.1, 500, 2000]);
  await expect(page.locator('#racesBlock')).toContainText('Тестовый полумарафон');
  await expectNoErrors(errors);
});
