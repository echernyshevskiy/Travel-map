// Вёрстка: на телефоне ничего не вылезает за ширину экрана, кнопки карты не
// налезают друг на друга, в тёмной и светлой темах подписи читаемы.
// Раньше проверялось скриптами вручную, по скриншотам.
const { test, expect } = require('@playwright/test');
const { openApp, expectNoErrors, encodePolyline } = require('./helpers');
const { largeData } = require('./fixtures/large-data');

// элементы, вылезающие за правый край окна (без содержимого карты и прокручиваемых областей)
const OVERFLOW = () => {
  const W = document.documentElement.clientWidth, bad = [];
  document.querySelectorAll('body *').forEach(el => {
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    if(!r.width || cs.visibility === 'hidden' || cs.display === 'none') return;
    if(el.closest('.leaflet-pane, .leaflet-control-attribution, [hidden]')) return;
    let p = el.parentElement, scrolls = false;
    while(p && p !== document.body){ const o = getComputedStyle(p); if(/(auto|scroll|hidden)/.test(o.overflowX)){ scrolls = true; break; } p = p.parentElement; }
    if(!scrolls && r.right > W + 1) bad.push((el.id || String(el.className) || el.tagName).slice(0, 40) + ' → ' + Math.round(r.right));
  });
  return { page: document.documentElement.scrollWidth - W, bad: [...new Set(bad)].slice(0, 8) };
};

test('телефон: ни экран карты, ни вкладки, ни окна не шире экрана', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'проверка для телефона');
  const d = largeData(encodePolyline);
  const { errors } = await openApp(page, { entries: d.entries, races: d.races, tripMeta: d.tripMeta });
  const check = async where => { const r = await page.evaluate(OVERFLOW); expect(r.page, `${where}: страница шире экрана`).toBeLessThanOrEqual(0); expect(r.bad, where).toEqual([]); };
  await check('карта');
  for(const tab of ['list', 'filters', 'add', 'more']){
    await page.locator(`[data-mtab-btn="${tab}"]`).click();
    await page.waitForTimeout(250);
    await check('вкладка ' + tab);
  }
  await page.locator('[data-mtab-btn="map"]').click();
  for(const id of ['openPassportBtn', 'openCollectionsBtn', 'openTravelerBtn', 'openRunningBtn', 'openDiagnosticsBtn', 'openRecapBtn', 'openCalendarBtn', 'openQuizBtn']){
    await page.evaluate(id => document.getElementById(id).click(), id);
    await page.waitForTimeout(250);
    await check('окно ' + id);
    await page.evaluate(() => document.querySelectorAll('.modal-overlay').forEach(m => { m.style.display = 'none'; }));
  }
  await page.evaluate(() => openTripPage(allEntries.find(e => e.trip && e.type === 'route').trip));
  await page.waitForTimeout(300);
  await check('страница поездки');
  await expectNoErrors(errors);
});

test('кнопки и плашки на карте не перекрывают друг друга', async ({ page }) => {
  const { errors } = await openApp(page);
  await page.waitForTimeout(400);
  const boxes = await page.evaluate(() => {
    const sel = ['.leaflet-control-zoom', '.compass-rose', '.map-controls', '#mapGlance', '#legend', '#timelineBar', '#mnavBar'];
    return sel.map(s => { const e = document.querySelector(s); if(!e) return null; const cs = getComputedStyle(e); if(cs.display === 'none' || cs.visibility === 'hidden') return null;
      const r = e.getBoundingClientRect(); return r.width && r.height ? { s, l: r.left, t: r.top, r: r.right, b: r.bottom } : null; }).filter(Boolean);
  });
  const hits = [];
  for(let i = 0; i < boxes.length; i++) for(let j = i + 1; j < boxes.length; j++){
    const a = boxes[i], b = boxes[j];
    const ox = Math.min(a.r, b.r) - Math.max(a.l, b.l), oy = Math.min(a.b, b.b) - Math.max(a.t, b.t);
    if(ox > 2 && oy > 2) hits.push(`${a.s} ⨯ ${b.s} (${Math.round(ox)}×${Math.round(oy)})`);
  }
  expect(hits).toEqual([]);
  await expectNoErrors(errors);
});

// контраст по WCAG: относительная яркость цвета текста и ближайшего непрозрачного фона
const CONTRAST = sels => {
  const rgb = s => (s.match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3).map(Number);
  const lum = c => { const [r, g, b] = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  return sels.map(s => {
    const e = document.querySelector(s); if(!e || !e.getBoundingClientRect().width) return null;
    let p = e, bg = 'rgb(255,255,255)';
    while(p){ const c = getComputedStyle(p).backgroundColor; if(c && c !== 'rgba(0, 0, 0, 0)' && !/,\s*0\)$/.test(c)){ bg = c; break; } p = p.parentElement; }
    const a = lum(rgb(getComputedStyle(e).color)), b = lum(rgb(bg));
    return { s, ratio: Math.round((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) * 10) / 10 };
  }).filter(Boolean);
};
for(const theme of ['light', 'dark']){
  test(`подписи читаемы в ${theme === 'dark' ? 'тёмной' : 'светлой'} теме`, async ({ page }) => {
    const { errors } = await openApp(page, { theme });
    await page.waitForTimeout(300);
    const r = await page.evaluate(CONTRAST, ['#timelineYearLabel', '#timelineModeBtn', '#mapFullBtn', '#topoToggleBtn', '.legend-toggle', '.leaflet-control-zoom-in', '#mapGlance', '.mnav-btn']);
    expect(r.length).toBeGreaterThan(4);
    for(const x of r) expect(x.ratio, `${x.s}: контраст ${x.ratio}`).toBeGreaterThanOrEqual(3);
    await expectNoErrors(errors);
  });
}
