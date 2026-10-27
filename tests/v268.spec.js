// v2.68: моря и океаны — статистика, вехи, значки, итоги года, коллекции, подписи «своих» морей
const { test, expect } = require('@playwright/test');
const { openApp, expectNoErrors } = require('./helpers');

const base = { photos: [], purpose: 'tourism', status: 'visited', color: '#3F5240' };
const city = (id, name, lat, lng, year, month, extra = {}) => ({ ...base, id, type: 'city', name, lat, lng, year, month, ...extra });
const SEA_DATA = [
  city('s1', 'Сочи', 43.585, 39.723, 2019, 7),
  city('s2', 'Анапа', 44.89, 37.32, 2019, 7),                            // то же море в том же месяце — один визит
  city('s3', 'Сочи', 43.585, 39.723, 2021, 8),
  city('s4', 'Сплит', 43.51, 16.44, 2022, 6, { trip: 'Балканы' }),       // Адриатическое — и Средиземное
  city('s5', 'Будва', 42.29, 18.84, 2022, 6, { trip: 'Балканы' }),
  city('s6', 'Пальма', 39.57, 2.65, 2023, 5),                           // остров в Балеарском море
  city('s7', 'Таллин', 59.437, 24.745, 2024, 3),                        // Финский залив → Балтийское
  city('s8', 'Лиссабон', 38.72, -9.14, 2024, 9),                        // берег океана
  city('s9', 'Москва', 55.756, 37.617, 2024, 1),                        // не у моря
  city('s10', 'Владивосток', 43.12, 131.89, 2026, 1, { status: 'wishlist' }) // планы не считаются
];

test('статистика: моря и океаны, топ по визитам, моря России, всё по океанам', async ({ page }) => {
  const { errors } = await openApp(page, { entries: SEA_DATA });
  await page.evaluate(() => { mnavShow('list'); document.querySelector('[data-lsw="stats"]').click(); });
  await expect(page.locator('#statSeasF')).toHaveText('5');       // Чёрное, Адриатическое, Средиземное, Балеарское, Балтийское
  await expect(page.locator('#statOceansF')).toHaveText('1 из 5');
  const top = await page.locator('#topSeasList .top-item').allInnerTexts();
  expect(top.join('|')).toMatch(/Чёрное море\s+2 визита/);
  expect(top.join('|')).toMatch(/Средиземное море\s+2 визита/);       // Балканы (одна поездка) + Пальма
  expect(top.join('|')).not.toMatch(/Японское/);
  await expect(page.locator('#seaStats .continent-pct')).toHaveText('2/13'); // Чёрное и Балтийское
  await page.locator('details.sea-all > summary').click();
  const all = await page.locator('details.sea-all').innerText();
  expect(all).toMatch(/атлантический океан/i);
  expect(all).toMatch(/Балтийское море[\s\S]*Таллин[\s\S]*Финский залив/);
  expect(all).toMatch(/Средиземное море[\s\S]*Адриатическое море/);
  await expectNoErrors(errors);
});

test('статистика морей учитывает фильтр по году', async ({ page }) => {
  const { errors } = await openApp(page, { entries: SEA_DATA });
  await page.evaluate(() => { const s = document.querySelector('#yearFilters input[value="2024"], [data-year="2024"]'); if(s) s.click(); });
  const n = await page.evaluate(() => { const v = allEntries.filter(e => e.year === 2024); renderSeaStats(v); return document.getElementById('statSeasF').textContent; });
  expect(n).toBe('1'); // в 2024 — только Балтийское (и океан)
  await expectNoErrors(errors);
});

test('вехи, значок, итоги года и коллекции знают про моря', async ({ page }) => {
  const { errors } = await openApp(page, { entries: SEA_DATA });
  const r = await page.evaluate(() => {
    const ms = computeMilestones();
    renderRecap && (document.getElementById('recapYear').innerHTML = '<option value="2024">2024</option>', document.getElementById('recapYear').value = '2024', renderRecap());
    const cols = allCollections(), idx = collectionVisitIndex();
    const prog = id => { const c = cols.find(x => x.id === id); const p = collectionProgress(c, idx); return [p.got, p.total]; };
    return { titles: ms.reached.filter(m => m.kind === 'море' || m.kind === 'океан').map(m => m.title), seas: ms.seas,
      badges: computeBadges().map(b => b.title), recap: document.getElementById('recapBody').innerText, ru: prog('seas-ru'), world: prog('seas-world') };
  });
  expect(r.titles).toContain('1-е море — Чёрное море (Сочи)');
  expect(r.titles).toContain('5-е море — Балтийское море (Таллин)');
  expect(r.titles).toContain('1-й океан — Атлантический океан (Лиссабон)');
  expect(r.seas).toBe(5);
  expect(r.badges).toContain('Мореход');
  expect(r.recap).toMatch(/Моря и океаны[\s\S]*Балтийское море \(впервые\)/);
  expect(r.ru).toEqual([2, 13]);
  expect(r.world[0]).toBe(6);
  expect(r.world[1]).toBeGreaterThan(70);
  await expectNoErrors(errors);
});

test('на «Контурах» моря, где вы были, подписаны жирнее; правка данных сразу видна', async ({ page }) => {
  const { errors } = await openApp(page, { entries: SEA_DATA });
  await page.evaluate(() => { map.setView([44, 30], 5, { animate: false }); renderMapLabels(); });
  const cls = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.map-label.ml-sea')].map(el => [el.innerText.replace(/\s+/g, ' ').trim(), el.classList.contains('ml-visited')])));
  let c = await cls();
  expect(c['Чёрное море']).toBe(true);
  expect(Object.entries(c).some(([k, v]) => !v), JSON.stringify(c)).toBe(true);
  // удалили все приморские города — подпись Чёрного моря снова обычная
  await page.evaluate(() => { allEntries = allEntries.filter(e => !['s1', 's2', 's3'].includes(e.id)); rebuildAll(); renderMapLabels(); });
  c = await cls();
  expect(c['Чёрное море']).toBe(false);
  await expectNoErrors(errors);
});

test('коллекция «Моря России» открывается, моря без кнопки «в планы»', async ({ page }) => {
  const { errors } = await openApp(page, { entries: SEA_DATA });
  await page.evaluate(() => document.getElementById('openCollectionsBtn').click());
  await page.evaluate(() => { collectionOpenId = 'seas-ru'; renderCollections(); });
  const body = page.locator('#collectionsModal');
  await expect(body).toContainText('Чёрное море');
  await expect(body.locator('.coll-item.got')).toHaveCount(2);
  await expect(body.locator('[data-ci-plan]')).toHaveCount(0);
  await body.locator('.coll-item', { hasText: 'Каспийское море' }).locator('[data-ci-map]').click();
  await expect.poll(() => page.evaluate(() => map.getZoom())).toBe(5);
  await expectNoErrors(errors);
});
