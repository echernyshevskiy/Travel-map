// v2.74: меню «Ещё» по группам и короткая проверка данных (A4);
// короткая форма добавления (A5); вкладки в боковой панели и поиск в шапке (A6)
const { test, expect } = require('@playwright/test');
const { openApp, expectNoErrors } = require('./helpers');

const visibleOverlays = page => page.evaluate(() => [...document.querySelectorAll('.modal-overlay, .story-overlay')]
  .filter(m => m.style.display && m.style.display !== 'none').map(m => m.id));

// выдуманные записи без единого замечания проверки
const base = { photos: [], purpose: 'tourism', status: 'visited' };
const CLEAN = [
  { ...base, id: 'c_ge', type: 'country', name: 'Грузия', year: 2023, month: 5, countryKey: 'Georgia', color: '#A6592E', trip: 'Кавказ 2023' },
  { ...base, id: 'ci_tb', type: 'city', name: 'Тбилиси', year: 2023, month: 5, lat: 41.6941, lng: 44.8337, countryKey: 'Georgia', color: '#3F5240', trip: 'Кавказ 2023' },
];

test.describe('A4: меню «Ещё» и проверка данных', () => {
  test('«Ещё»: три группы, все кнопки на месте и открывают свои окна', async ({ page }, info) => {
    test.skip(info.project.name !== 'phone', 'вкладка «Ещё» есть только на телефоне');
    const { errors } = await openApp(page);
    await page.click('[data-mtab-btn="more"]');
    const slot = page.locator('#moreActionsSlot');
    await expect(slot.locator('.more-group-title')).toHaveText(['Данные', 'Итоги', 'Фото, квиз и бег']);
    // число кнопок прежнее: 6 кнопок шапки + 10 пунктов «Итогов» (выпадающая кнопка «Итоги ▾» скрыта)
    const ids = await slot.locator('button.header-btn:visible, button.header-menu-item:visible').evaluateAll(bs => bs.map(b => b.id));
    expect(ids.sort()).toEqual(['exportSnapshotBtn', 'openCalendarBtn', 'openChangelogBtn', 'openCollectionsBtn', 'openCompareBtn',
      'openDiagnosticsBtn', 'openDiaryBtn', 'openGalleryBtn', 'openMilestonesBtn', 'openPassportBtn', 'openPhotoImportBtn',
      'openQuizBtn', 'openRecapBtn', 'openRunningBtn', 'openTableBtn', 'openTravelerBtn']);
    // группы идут по порядку: каждая кнопка ниже своего подзаголовка и выше следующего
    const tops = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#moreActionsSlot .more-group-title, #moreActionsSlot button')]
      .map(el => [el.id, el.getBoundingClientRect().top])));
    for(const id of ['openTableBtn', 'openPhotoImportBtn', 'openDiagnosticsBtn', 'openChangelogBtn']) expect(tops[id]).toBeGreaterThan(tops.moreGroupData), expect(tops[id]).toBeLessThan(tops.moreGroupSummary);
    for(const id of ['openPassportBtn', 'openRecapBtn', 'exportSnapshotBtn']) expect(tops[id]).toBeGreaterThan(tops.moreGroupSummary), expect(tops[id]).toBeLessThan(tops.moreGroupOther);
    for(const id of ['openGalleryBtn', 'openQuizBtn', 'openRunningBtn']) expect(tops[id]).toBeGreaterThan(tops.moreGroupOther);
    // каждая кнопка открывает окно
    for(const id of ids){
      if(!(await page.locator('#' + id).isVisible())) await page.click('[data-mtab-btn="more"]');
      if(id === 'exportSnapshotBtn'){
        // «Снимок» не окно, а картинка для Stories — проверяем, что она скачивается
        const dl = page.waitForEvent('download');
        await page.locator('#' + id).click();
        expect((await dl).suggestedFilename()).toMatch(/\.png$/);
        continue;
      }
      await page.locator('#' + id).click();
      await expect.poll(() => visibleOverlays(page), { message: id }).not.toEqual([]);
      await page.keyboard.press('Escape');
      await expect.poll(() => visibleOverlays(page), { message: id }).toEqual([]);
    }
    await expectNoErrors(errors);
  });

  test('на компьютере подзаголовков групп не видно, шапка прежняя', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop');
    const { errors } = await openApp(page);
    await expect(page.locator('.more-group-title:visible')).toHaveCount(0);
    await expect(page.locator('header #openSummaryMenu')).toBeVisible();
    await expectNoErrors(errors);
  });

  test('проверка данных: при чистых данных пустых разделов нет', async ({ page }) => {
    const { errors } = await openApp(page, { entries: CLEAN, races: [] });
    await page.evaluate(() => document.getElementById('openDiagnosticsBtn').click());
    const body = page.locator('#diagnosticsBody');
    await expect(body.locator('#diagCleanSummary')).toBeVisible();
    await expect(body.locator('.diag-section:not(.diag-clean)')).toHaveCount(0);
    await expect(body).toContainText('Замечаний нет');
    await expect(body.locator('#diagCleanSummary summary')).toContainText(/Без замечаний: \d+ провер/);
    // список проверок без находок раскрывается
    await body.locator('#diagCleanSummary summary').click();
    await expect(body.locator('.diag-clean-list li').first()).toBeVisible();
    await expectNoErrors(errors);
  });

  test('проверка данных: при одной проблеме виден только её раздел', async ({ page }) => {
    // город есть, а страны за этот год нет
    const entries = [...CLEAN, { ...base, id: 'ci_bt', type: 'city', name: 'Батуми', year: 2024, month: 8, lat: 41.6168, lng: 41.6367, countryKey: 'Georgia', color: '#3F5240', trip: 'Батуми 2024' }];
    const { errors } = await openApp(page, { entries, races: [] });
    await page.evaluate(() => document.getElementById('openDiagnosticsBtn').click());
    const body = page.locator('#diagnosticsBody');
    const sections = body.locator('.diag-section:not(.diag-clean) .diag-section-title');
    await expect(sections).toHaveCount(1);
    await expect(sections).toContainText('страна за этот год не отмечена');
    await expect(body).toContainText('Батуми');
    await expect(body).not.toContainText('Замечаний нет');
    await expect(body.locator('#diagCleanSummary')).toBeVisible();
    await expectNoErrors(errors);
  });
});
