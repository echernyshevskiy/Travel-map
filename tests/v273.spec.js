// v2.73: «Назад» закрывает окно, фокус внутри окон (A1); кнопки на карте
// не меньше 40/44 px (A2); вид карты запоминается, тема по системной,
// легенда на телефоне свёрнута (A3)
const { test, expect } = require('@playwright/test');
const { openApp, expectNoErrors } = require('./helpers');

const shown = (page, id) =>
  page.evaluate(id => {
    const m = document.getElementById(id);
    return m.style.display !== 'none' && m.style.display !== '';
  }, id);
// открыть окно нажатием на его кнопку (на телефоне кнопки спрятаны во вкладке «Ещё»)
const openVia = (page, btnId) =>
  page.evaluate(id => {
    const b = document.getElementById(id);
    b.focus();
    b.click();
  }, btnId);
const settle = page => page.waitForTimeout(120);

test.describe('A1: «Назад» и фокус в окнах', () => {
  test('«Назад» закрывает окно, страница остаётся', async ({ page }) => {
    const { errors } = await openApp(page);
    const url = page.url();
    for (const [btn, modal] of [
      ['openTableBtn', 'tableModal'],
      ['openDiagnosticsBtn', 'diagnosticsModal'],
      ['openPassportBtn', 'passportModal']
    ]) {
      await openVia(page, btn);
      expect(await shown(page, modal)).toBe(true);
      await settle(page);
      await page.goBack();
      await expect.poll(() => shown(page, modal)).toBe(false);
      expect(page.url()).toBe(url);
      expect(await page.evaluate(() => !!window.__travelMap)).toBe(true);
    }
    await expectNoErrors(errors);
  });

  test('вложенные окна закрываются по одному', async ({ page }) => {
    const { errors } = await openApp(page);
    await openVia(page, 'openTableBtn');
    await openVia(page, 'openPassportBtn');
    await settle(page);
    expect(await shown(page, 'passportModal')).toBe(true);
    expect(await shown(page, 'tableModal')).toBe(true);
    await page.goBack();
    await expect.poll(() => shown(page, 'passportModal')).toBe(false);
    expect(await shown(page, 'tableModal')).toBe(true);
    await settle(page);
    await page.goBack();
    await expect.poll(() => shown(page, 'tableModal')).toBe(false);
    await expectNoErrors(errors);
  });

  test('закрытие крестиком и Esc не копит шаги истории', async ({ page }) => {
    const { errors } = await openApp(page);
    const len0 = await page.evaluate(() => history.length);
    for (let i = 0; i < 3; i++) {
      await openVia(page, 'openTableBtn');
      await settle(page);
      if (i % 2) await page.keyboard.press('Escape');
      else await page.evaluate(() => document.getElementById('closeTableModal').click());
      await settle(page);
    }
    expect(await shown(page, 'tableModal')).toBe(false);
    // шаг вперёд мог остаться, но назад от текущего места — ничего лишнего
    expect(await page.evaluate(() => history.length)).toBeLessThanOrEqual(len0 + 1);
    // следующий «Назад» после закрытий не должен «съедать» новое окно вхолостую:
    await openVia(page, 'openTableBtn');
    await settle(page);
    await page.goBack();
    await expect.poll(() => shown(page, 'tableModal')).toBe(false);
    await expectNoErrors(errors);
  });

  test('фокус внутри окна, Tab по кругу, после Esc — на открывшей кнопке', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'клавиатура — на компьютере');
    const { errors } = await openApp(page);
    await page.click('#openDiagnosticsBtn');
    await settle(page);
    const inside = () => page.evaluate(() => document.getElementById('diagnosticsModal').contains(document.activeElement));
    expect(await inside()).toBe(true);
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press(i % 3 === 2 ? 'Shift+Tab' : 'Tab');
      expect(await inside()).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect.poll(() => shown(page, 'diagnosticsModal')).toBe(false);
    await expect.poll(() => page.evaluate(() => document.activeElement && document.activeElement.id)).toBe('openDiagnosticsBtn');
    await expectNoErrors(errors);
  });

  test('у окон есть роль диалога и подпись', async ({ page }) => {
    await openApp(page);
    const bad = await page.evaluate(() =>
      [...document.querySelectorAll('.modal-overlay')].filter(m => m.getAttribute('aria-modal') !== 'true' || !m.getAttribute('aria-labelledby')).map(m => m.id)
    );
    expect(bad).toEqual([]);
    await openVia(page, 'openTableBtn');
    await settle(page);
    expect(await page.getAttribute('#tableModal', 'role')).toBe('dialog');
  });

  test('телефон: окно поверх вкладки — «Назад» закрывает сначала окно', async ({ page }, info) => {
    test.skip(info.project.name !== 'phone', 'нижние вкладки — только на телефоне');
    const { errors } = await openApp(page);
    await page.click('[data-mtab-btn="list"]');
    await expect(page.locator('body')).toHaveClass(/mtab-list/);
    await openVia(page, 'openTableBtn');
    await settle(page);
    await page.goBack();
    await expect.poll(() => shown(page, 'tableModal')).toBe(false);
    await settle(page);
    await expect(page.locator('body')).toHaveClass(/mtab-list/);
    await page.goBack();
    await expect(page.locator('body')).not.toHaveClass(/mtab-open/);
    // закрыть окно крестиком над вкладкой — вкладка остаётся, «Назад» закрывает её
    await page.click('[data-mtab-btn="list"]');
    await openVia(page, 'openTableBtn');
    await settle(page);
    await page.evaluate(() => document.getElementById('closeTableModal').click());
    await settle(page);
    await expect(page.locator('body')).toHaveClass(/mtab-list/);
    await page.goBack();
    await expect(page.locator('body')).not.toHaveClass(/mtab-open/);
    await expectNoErrors(errors);
  });
});

test('A2: кнопки на стартовом экране не меньше 40 px (компьютер) и 44 px (телефон)', async ({ page }, info) => {
  const { errors } = await openApp(page);
  await settle(page);
  const min = info.project.name === 'phone' ? 44 : 40;
  const res = await page.evaluate(() => {
    const sel = '#map .leaflet-control-zoom a, #mapWrap .map-controls button, #timelineBar button, #legendToggle, #mapGlance';
    return [...document.querySelectorAll(sel)]
      .filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden')
      .map(el => {
        const r = el.getBoundingClientRect();
        return { id: el.id || el.className, l: r.left, t: r.top, w: r.width, h: r.height };
      });
  });
  expect(res.length).toBeGreaterThanOrEqual(7);
  const small = res.filter(b => b.w < min - 0.5 || b.h < min - 0.5);
  expect(small, JSON.stringify(small)).toEqual([]);
  // кнопки не наезжают друг на друга
  const overlaps = [];
  for (let i = 0; i < res.length; i++)
    for (let j = i + 1; j < res.length; j++) {
      const a = res[i],
        b = res[j];
      const x = Math.min(a.l + a.w, b.l + b.w) - Math.max(a.l, b.l),
        y = Math.min(a.t + a.h, b.t + b.h) - Math.max(a.t, b.t);
      if (x > 1 && y > 1) overlaps.push(a.id + ' × ' + b.id);
    }
  expect(overlaps).toEqual([]);
  await expectNoErrors(errors);
});

test.describe('A3: вид карты, тема, легенда', () => {
  test('центр и масштаб карты сохраняются после перезагрузки', async ({ page }) => {
    const { errors } = await openApp(page);
    await page.waitForTimeout(250);
    await page.evaluate(() => map.setView([43.25, 76.95], 7, { animate: false }));
    await page.waitForTimeout(900);
    await page.reload();
    await page.waitForFunction(() => !!window.__travelMap);
    await page.waitForTimeout(400);
    const v = await page.evaluate(() => ({ c: map.getCenter(), z: map.getZoom() }));
    expect(v.z).toBe(7);
    expect(Math.abs(v.c.lat - 43.25)).toBeLessThan(0.05);
    expect(Math.abs(v.c.lng - 76.95)).toBeLessThan(0.05);
    await expectNoErrors(errors);
  });

  test('без сохранённого вида — весь мир, как раньше', async ({ page }) => {
    await openApp(page);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => map.getZoom())).toBeLessThanOrEqual(3);
    expect(await page.evaluate(() => localStorage.getItem('travel-map-mapview'))).toBeNull();
  });

  test('ссылка на поездку важнее сохранённого вида', async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('travel-map-mapview', JSON.stringify({ lat: -33.9, lng: 151.2, z: 9 }));
      } catch (e) {}
    });
    const { errors } = await openApp(page);
    await page.evaluate(() => {
      location.hash = '#trip=' + encodeURIComponent('Кавказ 2023');
    });
    await page.reload();
    await page.waitForFunction(() => !!window.__travelMap);
    await page.waitForTimeout(700);
    const c = await page.evaluate(() => map.getCenter());
    // поездка «Кавказ 2023» — Грузия, а не Сидней
    expect(c.lng).toBeGreaterThan(20);
    expect(c.lng).toBeLessThan(70);
    await expectNoErrors(errors);
  });

  test('тема следует системной, пока её не выбрали вручную', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    const { errors } = await openApp(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    // ручной выбор запоминается и больше не зависит от системы
    await page.click('#themeToggleBtn');
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
    await expectNoErrors(errors);
  });

  test('сохранённая светлая тема важнее тёмной системной', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await openApp(page, { theme: 'light' });
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
  });

  test('телефон: легенда свёрнута при первом запуске, выбор запоминается', async ({ page }, info) => {
    test.skip(info.project.name !== 'phone', 'только телефон');
    const { errors } = await openApp(page);
    await expect(page.locator('#legend')).toHaveClass(/collapsed/);
    await page.click('#legendToggle');
    await expect(page.locator('#legend')).not.toHaveClass(/collapsed/);
    await page.reload();
    await page.waitForFunction(() => !!window.__travelMap);
    await expect(page.locator('#legend')).not.toHaveClass(/collapsed/);
    await expectNoErrors(errors);
  });

  test('версия для друзей: вид карты тоже запоминается', async ({ page }) => {
    const { errors } = await openApp(page, { build: 'friends' });
    await page.waitForTimeout(250);
    await page.evaluate(() => map.setView([41.7, 44.8], 6, { animate: false }));
    await page.waitForTimeout(900);
    const keys = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('travel-map')));
    expect(keys).toContain('travel-map-mapview');
    await expectNoErrors(errors);
  });
});
