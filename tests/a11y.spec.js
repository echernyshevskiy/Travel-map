// Доступность (WCAG 2 A/AA): axe-core проверяет главный экран и все окна меню
// в светлой и тёмной темах — подписи полей, названия кнопок и окон, роли,
// контраст текста. Ошибки уровней «critical» и «serious» роняют тест.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const { openApp, expectNoErrors } = require('./helpers');

// axe внедряется в страницу как скрипт; CSP приложения такой скрипт запретила бы
test.use({ bypassCSP: true });
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const SCREENS = [
  ['главный экран', null], ['все отметки', 'openTableBtn'], ['паспорт', 'openPassportBtn'], ['календарь', 'openCalendarBtn'],
  ['итоги года', 'openRecapBtn'], ['вехи', 'openMilestonesBtn'], ['тип путешественника', 'openTravelerBtn'], ['дневник', 'openDiaryBtn'],
  ['коллекции', 'openCollectionsBtn'], ['год к году', 'openCompareBtn'], ['журнал', 'openChangelogBtn'], ['бег', 'openRunningBtn'],
  ['галерея', 'openGalleryBtn'], ['квиз', 'openQuizBtn'], ['проверка данных', 'openDiagnosticsBtn'], ['импорт', 'openPhotoImportBtn'],
];

for(const theme of ['light', 'dark']){
  test(`доступность: ${theme === 'dark' ? 'тёмная' : 'светлая'} тема — без серьёзных нарушений`, async ({ page }) => {
    const { errors } = await openApp(page, { theme });
    await page.evaluate(AXE);
    const problems = [];
    for(const [name, btn] of SCREENS){
      if(btn){ await page.evaluate(id => document.getElementById(id).click(), btn); await page.waitForTimeout(200); }
      const found = await page.evaluate(async () => {
        const r = await axe.run(document, { resultTypes: ['violations'], runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } });
        return r.violations.filter(v => v.impact === 'critical' || v.impact === 'serious')
          .map(v => `${v.impact} ${v.id}: ${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(', ')}`);
      });
      found.forEach(f => problems.push(`${name} — ${f}`));
      if(btn) await page.evaluate(() => document.querySelectorAll('.modal-overlay').forEach(m => { m.style.display = 'none'; }));
    }
    expect(problems, problems.join('\n')).toEqual([]);
    await expectNoErrors(errors);
  });
}
