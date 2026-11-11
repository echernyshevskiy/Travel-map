// v2.77: шкала размеров текста (B4), цвета и слои через переменные (B5),
// дом в настройках (B6), запуск по этапам (B7), лёгкий список (B8)
const { test, expect } = require('@playwright/test');
const { openApp, expectNoErrors } = require('./helpers');

// Видимый текст мельче 11 px: элементы с собственным текстом, кроме подписей
// на самой карте (масштабируются с картой) и подписей внутри SVG-рисунков.
const tinyText = page =>
  page.evaluate(() => {
    const out = [];
    const skip = el => el.closest('svg, canvas, .leaflet-marker-pane, .leaflet-tooltip-pane, .ml-label, .ml-sea, #globeWrap');
    for (const el of document.querySelectorAll('body *')) {
      if (skip(el)) continue;
      const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
      if (!own) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || +cs.opacity === 0) continue;
      const fs = parseFloat(cs.fontSize);
      if (fs < 10.95)
        out.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${[...el.classList].join('.')} ${fs}px «${el.textContent.trim().slice(0, 30)}»`);
    }
    return out;
  });

test.describe('B4: шкала размеров текста', () => {
  test('на стартовом экране и в основных окнах нет текста мельче 11 px', async ({ page }, info) => {
    test.setTimeout(90_000);
    const { errors } = await openApp(page);
    await page.waitForTimeout(400);
    expect(await tinyText(page), 'стартовый экран').toEqual([]);
    if (info.project.name === 'desktop') {
      for (const tab of ['list', 'stats', 'filters', 'data']) {
        await page.click('#stab-' + tab);
        expect(await tinyText(page), 'вкладка ' + tab).toEqual([]);
      }
    } else {
      for (const tab of ['list', 'filters', 'add', 'more']) {
        await page.evaluate(t => mnavShow(t), tab);
        await page.waitForTimeout(300);
        expect(await tinyText(page), 'вкладка ' + tab).toEqual([]);
      }
      await page.evaluate(() => mnavShow('map'));
    }
    for (const id of ['openPassportBtn', 'openTableBtn', 'openDiagnosticsBtn', 'openRecapBtn', 'openCollectionsBtn', 'openRunningBtn', 'openMilestonesBtn']) {
      await page.evaluate(id => document.getElementById(id).click(), id);
      await page.waitForTimeout(350);
      expect(await tinyText(page), id).toEqual([]);
      await page.keyboard.press('Escape');
    }
    await expectNoErrors(errors);
  });
});
