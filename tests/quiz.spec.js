// Квиз: варианты ответов, раунд и марафон, «Где это?», рекорды
const { test, expect } = require('@playwright/test');
const { openApp, expectNoErrors } = require('./helpers');

async function answer(page, correct){
  const [k, opts] = await page.evaluate(() => [quizState.queue[quizState.i], quizState.options]);
  const i = correct ? opts.indexOf(k) : opts.findIndex(o => o !== k);
  await page.locator(`#quizBody [data-qopt="${i}"]`).click();
}

test('раунд «флаг → страна»: 10 вопросов, счёт и рекорд', async ({ page }) => {
  const { errors } = await openApp(page);
  await page.evaluate(() => document.getElementById('openQuizBtn').click());
  await page.locator('#quizStartBtn').click();
  for(let n = 0; n < 10; n++){
    await answer(page, n < 8);
    await page.locator('#quizNextBtn').click();
  }
  await expect(page.locator('.quiz-score')).toHaveText('8 из 10');
  await expect(page.locator('.quiz-badge')).toBeVisible();
  expect(await page.evaluate(() => quizStore().records['flag|round|world'].best)).toBe(8);
  await expectNoErrors(errors);
});

test('варианты: четыре разных, без похожих флагов, правильный среди них', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'достаточно одной раскладки');
  await openApp(page);
  const bad = await page.evaluate(() => {
    let bad = 0;
    for(const mode of ['flag', 'capital', 'country']){
      for(const k of quizPool(mode, 'world')){
        const o = quizOptions(mode, k);
        const labels = o.map(x => mode === 'capital' ? quizCapital(x) : COUNTRY_RU[x]);
        if(new Set(labels).size !== 4 || !o.includes(k)) bad++;
        if(mode === 'flag' && o.some(x => x !== k && quizLookalikes(k).has(x))) bad++;
      }
    }
    return bad;
  });
  expect(bad).toBe(0);
  // территории и частично признанные в квиз не входят, «Монако — столица чего?» не спрашиваем
  const pools = await page.evaluate(() => ({ world: quizPool('flag', 'world'), country: quizPool('country', 'world') }));
  expect(pools.world).toHaveLength(194);
  for(const k of ['Greenland', 'Kosovo', 'Taiwan', 'Puerto Rico']) expect(pools.world).not.toContain(k);
  expect(pools.country).not.toContain('Monaco');
});

test('марафон заканчивается на первой ошибке', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => document.getElementById('openQuizBtn').click());
  await page.locator('[data-qmode="capital"]').click();
  await page.locator('[data-qformat="marathon"]').click();
  await page.locator('#quizStartBtn').click();
  for(let n = 0; n < 3; n++){ await answer(page, true); await page.locator('#quizNextBtn').click(); }
  await answer(page, false);
  await expect(page.locator('#quizNextBtn')).toHaveText('Итог →');
  await page.locator('#quizNextBtn').click();
  await expect(page.locator('.quiz-score')).toHaveText('3');
});

test('«Где это?»: чистая карта, попадание и промах, выход возвращает карту', async ({ page }) => {
  const { errors } = await openApp(page);
  await page.evaluate(() => { tileFallbackDone = true; setBasemap('street'); document.getElementById('openQuizBtn').click(); });
  await page.locator('[data-qmode="map"]').click();
  await page.locator('[data-qset="Южная Америка"]').click();
  await page.locator('#quizStartBtn').click();
  await expect(page.locator('#quizMapPanel')).toBeVisible();
  expect(await page.evaluate(() => basemapMode)).toBe('plain'); // без подписей стран
  const click = async ll => {
    const box = await page.locator('#map').boundingBox();
    const pt = await page.evaluate(ll => { const p = map.latLngToContainerPoint(ll); return [p.x, p.y]; }, ll);
    await page.mouse.click(box.x + pt[0], box.y + pt[1]);
  };
  const target = await page.evaluate(() => { const k = quizState.queue[0]; const a = countryAnchor(k, countryBounds(k)); return [a.lat, a.lng]; });
  await click(target);
  await expect(page.locator('#quizMapFeedback')).toContainText('Верно');
  await page.locator('#quizMapNext').click();
  await page.locator('#quizMapSkip').click();
  await expect(page.locator('#quizMapFeedback')).toContainText('Вот где');
  await page.locator('#quizMapExit2').click();
  await expect(page.locator('#quizMapPanel')).toBeHidden();
  expect(await page.evaluate(() => [basemapMode, document.getElementById('map').classList.contains('quiz-clean')])).toEqual(['street', false]);
  await expectNoErrors(errors);
});

test('мелкая страна засчитывается в радиусе 150 км', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'достаточно одной раскладки');
  await openApp(page);
  const r = await page.evaluate(() => [
    quizDistanceKm(L.latLng(44.8, 8.5), 'Monaco') <= (quizCountryAreaKm2('Monaco') < QUIZ_SMALL_KM2 ? 150 : 30),
    quizDistanceKm(L.latLng(-12, -78.5), 'Peru') <= (quizCountryAreaKm2('Peru') < QUIZ_SMALL_KM2 ? 150 : 30)
  ]);
  expect(r).toEqual([true, false]);
});

test('квиз есть и в версии для друзей', async ({ page }) => {
  const { errors } = await openApp(page, { build: 'friends' });
  await page.evaluate(() => document.getElementById('openQuizBtn').click());
  await expect(page.locator('[data-qset="visited"]')).toContainText('Где был автор');
  await page.locator('#quizStartBtn').click();
  await expect(page.locator('.quiz-flag')).toBeVisible();
  await expectNoErrors(errors);
});
