// Устойчивость к испорченным и злонамеренным данным в хранилище браузера:
// приложение открывается, все экраны рисуются без исключений, внедрённый код
// не выполняется — и не только благодаря CSP: разметка из данных вообще не
// должна появляться в странице (проверяем экранирование отдельно).
const { test, expect } = require('@playwright/test');
const { openApp, expectNoErrors, encodePolyline } = require('./helpers');
const { brokenData } = require('./fixtures/broken-data');

test('испорченные и вредоносные данные: все экраны работают, код не выполняется', async ({ page }) => {
  const d = brokenData(encodePolyline);
  page.on('dialog', x => x.dismiss());
  const { errors } = await openApp(page, { entries: d.entries, tripMeta: d.tripMeta, races: d.races, allowCsp: true });
  const steps = await page.evaluate(async () => {
    const out = {};
    const run = async (name, f) => { try{ await f(); out[name] = 'ok'; }catch(e){ out[name] = e.message; } };
    await run('список и таблица', () => { renderList(); renderTable(); renderGlance(); });
    await run('карточки', async () => { for(const e of allEntries){ focusEntry(e); } map.closePopup(); });
    await run('проверка данных', () => renderDiagnostics());
    await run('коллекции', () => { renderCollections(); allCollections().forEach(c => { collectionOpenId = c.id; renderCollections(); }); collectionOpenId = null; });
    await run('тип путешественника', () => renderTraveler());
    await run('страницы поездок', () => { [...new Set(allEntries.map(e => e.trip).filter(Boolean))].forEach(t => openTripPage(t)); });
    await run('итоги', () => { ['renderPassport', 'renderGallery', 'renderCalendar', 'renderRecap', 'renderMilestones', 'renderDiary', 'renderCompare', 'renderRaces', 'renderUpcoming', 'renderRunning', 'renderChangelog'].forEach(f => window[f]()); });
    await run('глобус и облёты', async () => {
      globeEnter({ noFlyOut: true }); await new Promise(r => setTimeout(r, 400)); globeDraw();
      for(const e of allEntries){ if(e.type === 'route' || e.trip) globeTourBuild(e.trip ? { trip: e.trip } : e); }
      globeTourStart({ trip: 'Битая' }); await new Promise(r => setTimeout(r, 800)); globeTourStop(); globeExit();
    });
    await run('экспорт', () => { const k = buildKml(), g = buildGpx(); if(/<img|<script/i.test(k + g)) throw new Error('сырой HTML в выгрузке'); });
    await run('поиск', () => localCitySearch('мос', 8));
    return out;
  });
  for(const [name, r] of Object.entries(steps)) expect(r, name).toBe('ok');
  await page.waitForTimeout(500);
  const dom = await page.evaluate(() => ({
    xss: window.__xss || 0,
    jsLinks: [...document.querySelectorAll('a[href]')].filter(a => /^\s*(javascript|data):/i.test(a.getAttribute('href'))).length,
  }));
  expect(dom.xss).toBe(0);
  expect(dom.jsLinks).toBe(0);
  // разметка из данных не попала в страницу как разметка (экранирование работает и без CSP)
  expect(await page.evaluate(() => document.querySelectorAll('img[src="x"], [onerror], [onclick]').length)).toBe(0);
  // битые записи отложены, остальное сохранено очищенным
  const saved = await page.evaluate(() => ({ n: JSON.parse(localStorage.getItem('travel-map-data')).entries.length, q: JSON.parse(localStorage.getItem('travel-map-quarantine') || '[]').length }));
  expect(saved).toEqual({ n: d.entries.length - 4, q: 4 });
  await expectNoErrors(errors.filter(e => !/^CSP:/.test(e)));
});
