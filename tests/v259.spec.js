// v2.59: режим «Глобус» — шар на холсте, вращение, приближение с передачей
// плоской карте, нажатия с переходом к карточке, фильтры и ползунок лет.
const { test, expect } = require('@playwright/test');
const { openApp, expectNoErrors } = require('./helpers');

const enter = async page => {
  await page.click('#globeToggleBtn');
  await expect(page.locator('#globeCanvas')).toBeVisible();
  await page.waitForTimeout(150);
};
// пиксель холста в точке [lng, lat] (на видимой стороне)
const pixelAt = (page, ll) => page.evaluate(ll => {
  globe.moving = false; globeDraw();
  const p = globe.proj(ll), c = globe.canvas, d = globe.dpr;
  return [...c.getContext('2d').getImageData(Math.round(p[0] * d), Math.round(p[1] * d), 1, 1).data].slice(0, 3);
}, ll);
const screenAt = (page, ll) => page.evaluate(ll => {
  const p = globe.proj(ll), r = globe.canvas.getBoundingClientRect();
  return { x: r.left + p[0], y: r.top + p[1] };
}, ll);

test('кнопка включает шар и возвращает карту; режим запоминается', async ({ page }) => {
  const { errors } = await openApp(page);
  await expect(page.locator('#globeToggleBtn')).toHaveText('🌍 Глобус');
  await enter(page);
  await expect(page.locator('body')).toHaveClass(/globe-mode/);
  await expect(page.locator('#globeToggleBtn')).toHaveText('🗺 Карта');
  await expect(page.locator('.leaflet-control-zoom')).toBeHidden();
  await expect(page.locator('#topoToggleBtn')).toBeHidden();
  // после перезапуска приложение открывается на шаре
  await page.reload();
  await page.waitForFunction(() => window.__travelMap && globe.active === true);
  await page.waitForTimeout(800); // стартовые перемещения карты не должны выбивать из шара
  expect(await page.evaluate(() => globe.active)).toBe(true);
  await page.click('#globeToggleBtn');
  await expect(page.locator('#globeCanvas')).toBeHidden();
  await expect(page.locator('.leaflet-control-zoom')).toBeVisible();
  await expectNoErrors(errors);
});

test('море — море, суша — суша: контуры не выворачиваются наизнанку', async ({ page }) => {
  const { errors } = await openApp(page);
  await enter(page);
  await page.evaluate(() => { globe.proj.rotate([30, -5, 0]); globe.proj.scale(globeFitScale()); });
  const sea = await pixelAt(page, [-30, 5]);       // середина Атлантики
  const land = await pixelAt(page, [20, 5]);       // Центральная Африка
  expect(sea[2]).toBeGreaterThan(sea[0]);          // голубоватое
  expect(land[0]).toBeGreaterThan(land[2]);        // бумажное
  await expectNoErrors(errors);
});

test('перетаскивание вращает, колесо приближает, у порога — плоская карта в той же точке', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'мышь и колесо — на ПК');
  const { errors } = await openApp(page);
  await enter(page);
  const box = await page.locator('#globeCanvas').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const before = await page.evaluate(() => globe.proj.rotate()[0]);
  await page.mouse.move(cx, cy); await page.mouse.down();
  await page.mouse.move(cx + 120, cy, { steps: 6 }); await page.mouse.up();
  const after = await page.evaluate(() => globe.proj.rotate()[0]);
  expect(after - before).toBeGreaterThan(5);
  // повернём к Грузии и будем крутить колесо, пока шар не передаст управление
  await page.evaluate(() => { globeStopInertia(); globe.proj.rotate([-44, -42, 0]); });
  for(let i = 0; i < 40 && await page.evaluate(() => globe.active); i++){ await page.mouse.wheel(0, -400); await page.waitForTimeout(20); }
  expect(await page.evaluate(() => globe.active)).toBe(false);
  const v = await page.evaluate(() => ({ z: map.getZoom(), c: map.getCenter() }));
  expect(v.z).toBe(5);
  expect(v.c.lat).toBeCloseTo(42, 0);
  expect(v.c.lng).toBeCloseTo(44, 0);
  await expectNoErrors(errors);
});

test('щипок двумя пальцами приближает шар', async ({ page }) => {
  const { errors } = await openApp(page);
  await enter(page);
  const s0 = await page.evaluate(() => globe.proj.scale());
  await page.evaluate(() => {
    const cv = globe.canvas, r = cv.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const ev = (type, id, x) => cv.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: cy, bubbles: true, pointerType: 'touch' }));
    cv.setPointerCapture = () => {};
    ev('pointerdown', 1, cx - 40); ev('pointerdown', 2, cx + 40);
    for(let i = 1; i <= 5; i++){ ev('pointermove', 1, cx - 40 - i * 8); ev('pointermove', 2, cx + 40 + i * 8); }
    ev('pointerup', 1, cx - 80); ev('pointerup', 2, cx + 80);
  });
  const s1 = await page.evaluate(() => globe.proj.scale());
  expect(s1 / s0).toBeGreaterThan(1.7);   // пальцы разошлись с 80 до 160 пикселей
  // щипок до плоской карты, не отпуская пальцев, — и снова на шар: жесты работают
  const st = await page.evaluate(() => {
    const cv = globe.canvas, r = cv.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const ev = (type, id, x) => cv.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: cy, bubbles: true, pointerType: 'touch' }));
    ev('pointerdown', 3, cx - 10); ev('pointerdown', 4, cx + 10);
    for(let i = 1; i <= 40 && globe.active; i++){ ev('pointermove', 3, cx - 10 - i * 6); ev('pointermove', 4, cx + 10 + i * 6); }
    const handedOff = !globe.active;
    globeEnter();
    const r0 = globe.proj.rotate()[0];
    ev('pointerdown', 5, cx); for(let i = 1; i <= 5; i++) ev('pointermove', 5, cx + i * 20); ev('pointerup', 5, cx + 100);
    return { handedOff, pointers: globe.pointers.size, rotated: Math.abs(globe.proj.rotate()[0] - r0) > 3 };
  });
  expect(st).toEqual({ handedOff: true, pointers: 0, rotated: true });
  await expectNoErrors(errors);
});

test('нажатие на страну: подсказка, «Открыть на карте» — карточка страны', async ({ page }) => {
  const { errors } = await openApp(page);
  await enter(page);
  await page.evaluate(() => { globe.proj.rotate([-43, -42, 0]); globe.proj.scale(globeFitScale() * 5); globe.moving = false; globeDraw(); });
  const pt = await screenAt(page, [42.6, 42.2]);   // запад Грузии, вдали от Тбилиси
  await page.mouse.click(pt.x, pt.y);
  await expect(page.locator('#globeTip')).toContainText('Грузия');
  await expect(page.locator('#globeTip')).toContainText('были: 2023');
  await expect(page.locator('#globeTip [data-globe-trip]')).toHaveText(['Кавказ 2023']);
  // «На карте →» — перелёт к месту, затем плоская карта с полной карточкой страны
  await page.click('#globeTip [data-globe-open]');
  await expect.poll(() => page.evaluate(() => globe.active)).toBe(false);
  expect(await page.evaluate(() => map.getZoom())).toBe(5);
  await expect(page.locator('.leaflet-popup-content')).toContainText('Грузия');
  await expectNoErrors(errors);
});

test('нажатие на город и на маршрут', async ({ page }) => {
  const { errors } = await openApp(page);
  await enter(page);
  await page.evaluate(() => { globe.proj.rotate([-44.8, -41.7, 0]); globe.proj.scale(globeFitScale() * 3); globe.moving = false; globeDraw(); });
  const pt = await screenAt(page, [44.80, 41.69]);    // Тбилиси
  await page.mouse.click(pt.x + 3, pt.y + 2);
  await expect(page.locator('#globeTip')).toContainText('Тбилиси');
  await page.click('#globeTip [data-globe-close]');   // карточка закрывается крестиком
  await expect(page.locator('#globeTip')).toBeHidden();
  await page.evaluate(() => { globe.proj.rotate([-35.9, -56.86, 0]); globe.moving = false; globeDraw(); });
  const onLine = await page.evaluate(() => { const a = globe.proj([35.90, 56.86]), b = globe.proj([30.31, 59.94]); return { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2 }; });
  const r = await page.locator('#globeCanvas').boundingBox();
  await page.mouse.click(r.x + onLine.x, r.y + onLine.y);
  await expect(page.locator('#globeTip')).toContainText('Москва — Санкт-Петербург');
  await expectNoErrors(errors);
});

test('фильтры и ползунок лет действуют и на шаре', async ({ page }) => {
  const { errors } = await openApp(page);
  await enter(page);
  const countries = () => page.evaluate(() => { globeDraw(); return globe.data.countries.map(c => c.key).sort(); });
  expect(await countries()).toEqual(['Armenia', 'Georgia', 'Japan']);
  // ползунок на 2023 «только этот год»
  await page.evaluate(() => { timelineIndex = timelineYears.indexOf(2023); timelineMode = 'single'; applyTimelineOpacity(); });
  expect(await countries()).toEqual(['Georgia']);
  await page.evaluate(() => { timelineIndex = timelineYears.length - 1; timelineMode = 'cumulative'; activeLayerTypes.delete('country'); applyFilters(); });
  expect(await countries()).toEqual([]);
  expect(await page.evaluate(() => globe.data.cities.length)).toBeGreaterThan(0);
  await expectNoErrors(errors);
});

test('показ места из списка или поиска возвращает плоскую карту', async ({ page }) => {
  const { errors } = await openApp(page);
  await enter(page);
  await page.evaluate(() => focusEntry(allEntries.find(e => e.id === 'ci_kz')));
  await expect.poll(() => page.evaluate(() => globe.active)).toBe(false);
  await expect(page.locator('#globeCanvas')).toBeHidden();
  await expectNoErrors(errors);
});

test('«указать на карте» и квиз «Где это?» возвращают плоскую карту', async ({ page }) => {
  const { errors } = await openApp(page);
  await enter(page);
  await page.evaluate(() => document.getElementById('placeCityBtn').click());
  expect(await page.evaluate(() => globe.active)).toBe(false);
  await page.evaluate(() => { document.getElementById('placeCityBtn').click(); globeEnter(); });
  expect(await page.evaluate(() => globe.active)).toBe(true);
  await page.evaluate(() => document.body.classList.add('quiz-map'));
  await expect.poll(() => page.evaluate(() => globe.active)).toBe(false);
  await page.evaluate(() => document.body.classList.remove('quiz-map'));
  await expectNoErrors(errors);
});

test('версия для друзей: шар работает и там', async ({ page }) => {
  const { errors } = await openApp(page, { build: 'friends' });
  await enter(page);
  expect(await page.evaluate(() => { globeDraw(); return globe.data.countries.length + globe.data.cities.length; })).toBeGreaterThan(0);
  await expectNoErrors(errors);
});

// Файл, открытый во встроенном предпросмотре (about:srcdoc), — как у вас в чате:
// там нет ни адреса сайта, ни соседних файлов. Раньше при приближении падало
// построение адреса файла границ (Invalid URL)
test('предпросмотр файла (about:srcdoc): приближение и глобус без ошибок', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'достаточно одной раскладки');
  const fs = require('fs'), path = require('path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'friends', 'index.html'), 'utf8');
  await page.route('**/*', r => r.abort());
  await page.setContent('<iframe id="f" style="width:400px;height:820px;border:0"></iframe>');
  await page.evaluate(h => {
    const f = document.getElementById('f');
    f.contentWindow.__errs = [];
    f.addEventListener('load', () => {}, { once: true });
    f.srcdoc = h;
  }, html);
  const frame = page.frames().find(f => f !== page.mainFrame());
  await frame.waitForFunction(() => window.__travelMap && window.__travelMap.map, null, { timeout: 30000 });
  await frame.evaluate(() => { window.__errs = []; window.addEventListener('error', e => __errs.push(e.message)); });
  expect(await frame.evaluate(() => location.href)).toBe('about:srcdoc');
  await frame.evaluate(() => { const tm = window.__travelMap; tm.map.setView([42, 44], 7, { animate: false }); });
  await page.waitForTimeout(600);
  await frame.evaluate(() => window.__travelMap.globeEnter());
  await page.waitForTimeout(300);
  expect(await frame.evaluate(() => window.__errs)).toEqual([]);
  expect(await frame.evaluate(() => [...document.body.children].some(el => el.style && el.style.background && el.textContent.includes('Ошибка')))).toBe(false);
  expect(await frame.evaluate(() => document.getElementById('map').classList.contains('plain-base'))).toBe(true);
});

test('карточка города прямо на шаре: та же, что на карте; «На карте» открывает её там', async ({ page }) => {
  const { errors } = await openApp(page);
  await enter(page);
  await page.evaluate(() => { globe.proj.rotate([-44.8, -41.7, 0]); globe.proj.scale(globeFitScale() * 3); globe.moving = false; globeDraw(); });
  const pt = await screenAt(page, [44.80, 41.69]);
  await page.mouse.click(pt.x, pt.y);
  await expect(page.locator('#globeTip .globe-tip-body')).toContainText('Тбилиси');
  await expect(page.locator('#globeTip .globe-tip-body')).toContainText('Кавказ 2023');
  await page.click('#globeTip [data-globe-open]');
  await expect.poll(() => page.evaluate(() => globe.active)).toBe(false);
  await expect(page.locator('.leaflet-popup-content')).toContainText('Тбилиси');
  await expectNoErrors(errors);
});

test('кнопки в карточке на шаре: «удалить» убирает точку и закрывает карточку, поездка открывает страницу', async ({ page }) => {
  const { errors } = await openApp(page);
  await enter(page);
  await page.evaluate(() => { globe.proj.rotate([-49.1, -55.8, 0]); globe.proj.scale(globeFitScale() * 3); globe.moving = false; globeDraw(); });
  const pt = await screenAt(page, [49.12, 55.79]);   // Казань
  await page.mouse.click(pt.x, pt.y);
  await expect(page.locator('#globeTip')).toContainText('Казань');
  await page.click('#globeTip [data-popup-act="delete"]');
  await expect.poll(() => page.evaluate(() => allEntries.some(e => e.id === 'ci_kz'))).toBe(false);
  await expect(page.locator('#globeTip')).toBeHidden();
  expect(await page.evaluate(() => { globeDraw(); return globe.data.cities.some(c => c.entry.id === 'ci_kz'); })).toBe(false);
  // поездка из карточки страны
  await page.evaluate(() => { globe.proj.rotate([-43, -42, 0]); globe.proj.scale(globeFitScale() * 5); globe.moving = false; globeDraw(); });
  const g = await screenAt(page, [42.6, 42.2]);
  await page.mouse.click(g.x, g.y);
  await page.click('#globeTip [data-globe-trip]');
  await expect(page.locator('#tripPageModal')).toBeVisible();
  await expectNoErrors(errors);
});

test('вблизи — остановки маршрутов и подписи городов; издалека их нет', async ({ page }) => {
  const { errors } = await openApp(page);
  await enter(page);
  const stats = () => page.evaluate(() => { globe.moving = false; globeDraw(); return { ...globe.stats }; });
  await page.evaluate(() => { globe.proj.rotate([-34, -57, 0]); globe.proj.scale(globeFitScale()); });
  let st = await stats();
  expect(st.stops).toBe(0);
  expect(st.cityLabels).toBe(0);
  await page.evaluate(() => globe.proj.scale(globeFitScale() * 4));
  st = await stats();
  expect(st.stops).toBeGreaterThanOrEqual(2);   // Москва, Тверь, Петербург — остановки без своих отметок
  expect(st.cityLabels).toBeGreaterThan(0);
  // остановка — тоже цель нажатия: открывает карточку маршрута
  const p = await screenAt(page, await page.evaluate(() => globe.data.stops[0].ll));
  await page.mouse.click(p.x, p.y);
  await expect(page.locator('#globeTip')).toContainText('Москва — Санкт-Петербург');
  await expect(page.locator('#globeTip .gt-stop')).toBeVisible();
  await expectNoErrors(errors);
});

test('включение с приближенной карты: шар «отлетает» от того же места', async ({ page }) => {
  const { errors } = await openApp(page);
  await page.evaluate(() => map.setView([41.7, 44.8], 7, { animate: false }));
  await page.click('#globeToggleBtn');
  const s0 = await page.evaluate(() => globe.proj.scale() / globeFitScale());
  expect(s0).toBeGreaterThan(2);
  await expect.poll(() => page.evaluate(() => globe.proj.scale() / globeFitScale()), { timeout: 3000 }).toBeLessThan(1.3);
  const c = await page.evaluate(() => globeCenter());
  expect(c.lat).toBeCloseTo(41.7, 0);
  expect(c.lng).toBeCloseTo(44.8, 0);
  await expectNoErrors(errors);
});
