// Подробные границы: подгружаются при приближении и сбрасываются на обзоре мира
const { test, expect } = require('@playwright/test');
const { openApp, expectNoErrors } = require('./helpers');

const countPts = (page, key) => page.evaluate(k => {
  const g = Object.values(layers).find(x => x.__countryKey === k);
  let n = 0, tier = null;
  const walk = a => { if(a && a.lat !== undefined) n++; else if(Array.isArray(a)) a.forEach(walk); };
  g.eachLayer(l => { walk(l.getLatLngs()); tier = l.__detailTier || null; });
  return { n, tier };
}, key);

for(const build of ['edit', 'friends']){
  test(`${build}: Грузия при приближении — подробная граница, на обзоре — лёгкая`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop' && build === 'friends', 'достаточно одной раскладки');
    const requested = [];
    page.on('request', r => { if(r.url().includes('/borders/')) requested.push(r.url()); });
    const { errors } = await openApp(page, { build });
    const coarse = await countPts(page, 'Georgia');
    expect(coarse.tier).toBeNull();
    await page.evaluate(() => { map.setView([42.2, 43.5], 6, { animate: false }); });
    await expect.poll(() => countPts(page, 'Georgia').then(r => r.tier)).toBe('m');
    await page.evaluate(() => { map.setView([42.2, 43.5], 8, { animate: false }); });
    await expect.poll(() => countPts(page, 'Georgia').then(r => r.tier)).toBe('f');
    const fine = await countPts(page, 'Georgia');
    expect(fine.n).toBeGreaterThan(coarse.n * 5);
    // файлы берутся из общей папки в корне — и для версии для друзей
    expect(requested.some(u => /\/borders\/f\/\d+\.json\?v=\d+$/.test(u))).toBe(true);
    expect(requested.every(u => !u.includes('/friends/borders/'))).toBe(true);
    await page.evaluate(() => { map.setView([30, 20], 3, { animate: false }); });
    expect((await countPts(page, 'Georgia')).tier).toBeNull();
    await expectNoErrors(errors);
  });
}

test('нет файлов границ — остаются лёгкие контуры, без ошибок', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'достаточно одной раскладки');
  const { errors } = await openApp(page);
  await page.route('**/borders/**', r => r.fulfill({ status: 404, body: '' }));
  await page.evaluate(() => { map.setView([42.2, 43.5], 8, { animate: false }); });
  await page.waitForTimeout(800);
  expect((await countPts(page, 'Georgia')).tier).toBeNull();
  await expectNoErrors(errors);
});
