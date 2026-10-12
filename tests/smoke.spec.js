// Обе сборки открываются без ошибок, и все разделы открываются
const { test, expect } = require('@playwright/test');
const { openApp, expectNoErrors } = require('./helpers');

const BUTTONS = ['openTableBtn','openPassportBtn','openCalendarBtn','openRecapBtn','openMilestonesBtn','openDiaryBtn',
  'openCompareBtn','openChangelogBtn','openRunningBtn','openGalleryBtn','openDiagnosticsBtn','openPhotoImportBtn'];

for(const build of ['edit', 'friends']){
  test(`${build}: загрузка и все разделы без ошибок`, async ({ page }) => {
    const { errors } = await openApp(page, { build });
    await expect(page.locator('#map .leaflet-pane').first()).toBeAttached();
    for(const id of BUTTONS){
      await page.evaluate(id => { const b = document.getElementById(id); if(b) b.click(); }, id);
      await page.keyboard.press('Escape');
    }
    // попапы всех записей и страницы поездок
    await page.evaluate(() => Object.values(layers).forEach(l => { try{ l.openPopup && l.openPopup(); }catch(e){} }));
    await page.evaluate(() => [...new Set(allEntries.map(e => e.trip).filter(Boolean))].forEach(t => openTripPage(t)));
    await page.evaluate(() => document.getElementById('timelinePlayBtn').click());
    await page.waitForTimeout(600);
    await expectNoErrors(errors);
  });
}

test('версия для друзей: только просмотр', async ({ page }) => {
  await openApp(page, { build: 'friends' });
  expect(await page.evaluate(() => READ_ONLY)).toBe(true);
  await expect(page.locator('#addEntrySection')).toBeHidden();
});
