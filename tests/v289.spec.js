// v2.89: «Хочу посетить» → «Я был»: раньше менялся только статус, и у записи
// оставался год из планов. Теперь окно спрашивает год, месяц, день и поездку;
// отметку можно отменить.
const { test, expect } = require('@playwright/test');
const { openApp, expectNoErrors } = require('./helpers');

const jp = page => page.evaluate(() => JSON.parse(JSON.stringify(allEntries.find(e => e.id === 'c_jp'))));

test.describe('План → «Я был»', () => {
  test('из карточки на карте: окно «когда», дата, сезон, поездка; «Отменить» возвращает план', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'достаточно одной раскладки');
    const { errors } = await openApp(page);
    const before = await jp(page);
    expect(before.status).toBe('wishlist');
    expect(before.year).toBe(2027);
    // кнопка в карточке отметки
    await page.evaluate(() => {
      const e = allEntries.find(x => x.id === 'c_jp');
      L.popup().setLatLng([36, 138]).setContent(buildPopup(e)).openOn(map);
    });
    await page.click('[data-popup-act="upgrade"]');
    await expect(page.locator('#visitedModal')).toBeVisible();
    await expect(page.locator('#visitedSummary')).toContainText('Япония');
    // по умолчанию — текущий год и месяц
    expect(await page.inputValue('#visitedYear')).toBe(String(new Date().getFullYear()));
    expect(await page.inputValue('#visitedMonth')).toBe(String(new Date().getMonth() + 1));
    await page.fill('#visitedDate', '2025-04-03');
    await page.fill('#visitedTrip', 'Япония весной');
    await page.click('#visitedApply');
    await expect(page.locator('#visitedModal')).toBeHidden();
    const after = await jp(page);
    expect(after).toMatchObject({ status: 'visited', year: 2025, month: 4, dateFrom: '2025-04-03', season: 'spring', trip: 'Япония весной' });
    expect(after.tripOrder).toBeGreaterThan(0);
    // в хранилище — тоже
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('travel-map-data')).entries.find(e => e.id === 'c_jp').status)).toBe('visited');
    // «Отменить» в подсказке
    await page.click('#undoDeleteBtn');
    await expect.poll(async () => (await jp(page)).status).toBe('wishlist');
    const back = await jp(page);
    expect(back.year).toBe(2027);
    expect(back.dateFrom).toBeUndefined();
    expect(back.trip).toBeUndefined();
    await expectNoErrors(errors);
  });

  test('из списка: только год, месяц «не помню»; отмена окна ничего не меняет', async ({ page }, info) => {
    const { errors } = await openApp(page);
    if (info.project.name === 'desktop') await page.click('#stab-list');
    else await page.evaluate(() => mnavShow('list'));
    const btn = page.locator('.entry-row:has-text("Япония") [data-act="visit"]');
    await btn.click();
    await page.click('#visitedCancel');
    await expect(page.locator('#visitedModal')).toBeHidden();
    expect((await jp(page)).status).toBe('wishlist');
    await btn.click();
    await page.fill('#visitedYear', '2019');
    await page.selectOption('#visitedMonth', '');
    await page.click('#visitedApply');
    await expect.poll(async () => (await jp(page)).status).toBe('visited');
    const e = await jp(page);
    expect(e.year).toBe(2019);
    expect(e.month).toBeUndefined();
    await expectNoErrors(errors);
  });

  test('в таблице — несколько сразу, с тем же окном', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'достаточно одной раскладки');
    const { errors } = await openApp(page);
    await page.evaluate(() => {
      allEntries.push({ id: 'c_pe', type: 'country', countryKey: 'Peru', name: 'Перу', status: 'wishlist', year: 2030, color: '#A6592E', photos: [] });
      selectedIds.clear();
      selectedIds.add('c_jp');
      selectedIds.add('c_pe');
      document.getElementById('bulkApplyVisited').click();
    });
    await expect(page.locator('#visitedTitle')).toHaveText('Отметить посещёнными: 2');
    await page.fill('#visitedYear', '2024');
    await page.click('#visitedApply');
    await expect
      .poll(() => page.evaluate(() => allEntries.filter(e => ['c_jp', 'c_pe'].includes(e.id) && e.status === 'visited' && e.year === 2024).length))
      .toBe(2);
    await expectNoErrors(errors);
  });
});
