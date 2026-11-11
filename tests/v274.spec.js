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

test.describe('A5: короткая форма добавления', () => {
  const openForm = async (page, info) => { if(info.project.name === 'phone') await page.click('[data-mtab-btn="add"]'); };
  const inView = page => page.evaluate(() => {
    const r = document.getElementById('saveBtn').getBoundingClientRect();
    const h = window.visualViewport ? window.visualViewport.height : innerHeight;
    const bar = document.getElementById('mnavBar');
    const limit = bar && bar.offsetParent ? Math.min(h, bar.getBoundingClientRect().top) : h;
    return r.height > 0 && r.top >= 0 && r.bottom <= limit + 0.5;
  });

  test('новая форма — «Город», лишнее под «Подробнее», «Сохранить» на экране', async ({ page }, info) => {
    const { errors } = await openApp(page);
    await openForm(page, info);
    expect(await page.evaluate(() => currentType)).toBe('city');
    await expect(page.locator('.type-btn[data-type="city"]')).toHaveClass(/active/);
    await expect(page.locator('#citySearch')).toBeVisible();
    await expect(page.locator('#fieldYear')).toBeVisible();
    for(const id of ['fieldName', 'fieldNotes', 'fieldTrip', 'fieldPhoto', 'fieldPurpose']) await expect(page.locator('#' + id)).toBeHidden();
    await expect(page.locator('#formMoreToggle')).toHaveAttribute('aria-expanded', 'false');
    expect(await inView(page)).toBe(true);
    // «Подробнее» раскрыто — кнопка всё равно на экране, без прокрутки
    await page.click('#formMoreToggle');
    await expect(page.locator('#fieldNotes')).toBeVisible();
    expect(await inView(page)).toBe(true);
    // мало места по высоте (открытая клавиатура) — кнопка остаётся видна
    const vp = page.viewportSize();
    await page.setViewportSize({ width: vp.width, height: Math.round(vp.height * 0.55) });
    await page.waitForTimeout(150);
    expect(await inView(page)).toBe(true);
    await expectNoErrors(errors);
  });

  test('город за три действия: название, подсказка, «Сохранить»', async ({ page, context }, info) => {
    const { errors } = await openApp(page, { entries: [] });
    await openForm(page, info);
    await context.setOffline(true); // подсказки из встроенного справочника
    await page.fill('#citySearch', 'Казан');
    await page.locator('#citySuggest .suggest-item').first().click();
    await page.click('#saveBtn');
    await expect.poll(() => page.evaluate(() => allEntries.map(e => [e.type, e.name, e.countryKey, e.year]))).toEqual([['city', 'Казань', 'Russia', new Date().getFullYear()]]);
    await expectNoErrors(errors);
  });

  test('правка записи с заметкой: «Подробнее» раскрыто, заметка видна; без лишнего — свёрнуто', async ({ page }) => {
    const { errors } = await openApp(page);
    await page.evaluate(() => startEdit(allEntries.find(e => e.id === 'c_ge'))); // у Грузии заметка и поездка
    await expect(page.locator('#formMoreToggle')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#fieldNotes')).toBeVisible();
    await expect(page.locator('#fieldNotes')).toHaveValue('Хинкали и горы');
    await expect(page.locator('#fieldName')).toHaveValue('Грузия');
    await page.click('#cancelEditBtn');
    await page.evaluate(() => startEdit(allEntries.find(e => e.id === 'ci_kz'))); // ничего дополнительного
    await expect(page.locator('#formMoreToggle')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#fieldName')).toBeVisible(); // название при правке видно всегда
    await expect(page.locator('#fieldName')).toHaveValue('Казань');
    await page.click('#cancelEditBtn');
    await expect(page.locator('#fieldName')).toBeHidden();
    await expectNoErrors(errors);
  });

  test('все прежние поля доступны и сохраняются: заполнить всё → сохранить → открыть → сравнить', async ({ page, context }, info) => {
    test.skip(info.project.name !== 'desktop', 'достаточно одной раскладки');
    const { errors } = await openApp(page, { entries: [] });
    await context.setOffline(true);
    await page.fill('#citySearch', 'Казан');
    await page.locator('#citySuggest .suggest-item').first().click();
    await page.click('[data-status="wishlist"]');
    await page.fill('#fieldYear', '2027');
    await page.selectOption('#fieldMonth', '6');
    await page.click('#formMoreToggle');
    const values = {
      fieldName: 'Казань летом', fieldTrip: 'Волга 2027', fieldPhoto: 'https://example.com/a\nhttps://example.com/b',
      fieldInstagram: 'https://www.instagram.com/p/abc/', fieldMapLink: 'https://maps.example.com/x', fieldDocLink: 'https://docs.example.com/y',
      fieldNotes: 'Выдуманная заметка',
    };
    for(const [id, v] of Object.entries(values)) await page.fill('#' + id, v);
    await page.selectOption('#fieldPurpose', 'sport');
    await page.selectOption('#fieldCompany', 'group');
    await page.selectOption('#fieldCommunity', 'route_community');
    await page.selectOption('#fieldSeason', 'autumn');
    await page.selectOption('#fieldCityCountry', 'Russia');
    await page.check('#fieldFavorite');
    await page.check('#fieldHidden');
    await page.evaluate(() => setFieldColor('#7a3e5a'));
    await page.click('#saveBtn');
    await expect.poll(() => page.evaluate(() => allEntries.length)).toBe(1);
    const e = await page.evaluate(() => allEntries[0]);
    expect(e).toMatchObject({ type: 'city', name: 'Казань летом', status: 'wishlist', year: 2027, month: 6, trip: 'Волга 2027',
      photos: ['https://example.com/a', 'https://example.com/b'], instagramUrl: values.fieldInstagram, mapLinkUrl: values.fieldMapLink,
      docLinkUrl: values.fieldDocLink, notes: values.fieldNotes, purpose: 'sport', company: 'group', community: 'route_community',
      season: 'autumn', countryKey: 'Russia', favorite: true, hidden: true, color: '#7a3e5a' });
    // открыть на правку — всё на месте
    await page.evaluate(() => startEdit(allEntries[0]));
    await expect(page.locator('#formMoreToggle')).toHaveAttribute('aria-expanded', 'true');
    for(const [id, v] of Object.entries(values)) await expect(page.locator('#' + id)).toHaveValue(v);
    await expect(page.locator('#fieldPurpose')).toHaveValue('sport');
    await expect(page.locator('#fieldCommunity')).toHaveValue('route_community');
    await expect(page.locator('#fieldSeason')).toHaveValue('autumn');
    await expect(page.locator('#fieldMonth')).toHaveValue('6');
    await expect(page.locator('#fieldFavorite')).toBeChecked();
    await expect(page.locator('#fieldHidden')).toBeChecked();
    await expect(page.locator('[data-status="wishlist"]')).toHaveClass(/active/);
    expect(await page.inputValue('#fieldColor')).toBe('#7a3e5a');
    await expectNoErrors(errors);
  });

  test('правый щелчок по карте → «Добавить здесь» → форма с выбранным местом', async ({ page, context }, info) => {
    test.skip(info.project.name !== 'desktop', 'долгое нажатие на телефоне браузер превращает в то же событие');
    const { errors } = await openApp(page, { entries: [] });
    await context.setOffline(true);
    await page.evaluate(() => map.setView([55.79, 49.12], 9, { animate: false }));
    await page.waitForTimeout(200);
    const box = await page.locator('#map').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
    await page.locator('#addHereBtn').click();
    await expect(page.locator('#citySelectedTag')).toContainText('Казань');
    await page.click('#saveBtn');
    await expect.poll(() => page.evaluate(() => allEntries.map(e => [e.type, e.name, e.countryKey]))).toEqual([['city', 'Казань', 'Russia']]);
    const e = await page.evaluate(() => allEntries[0]);
    expect(Math.abs(e.lat - 55.79)).toBeLessThan(0.3);
    await expectNoErrors(errors);
  });

  test('в версии для друзей «Добавить здесь» нет', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop');
    const { errors } = await openApp(page, { build: 'friends' });
    const box = await page.locator('#map').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
    await page.waitForTimeout(200);
    await expect(page.locator('#addHereBtn')).toHaveCount(0);
    await expectNoErrors(errors);
  });
});
