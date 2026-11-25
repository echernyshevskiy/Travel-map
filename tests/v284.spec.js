// v2.84: телефон — кнопки записи в списке под палец, текст не мельче 12 px,
// заголовки разделов высотой под палец; роза ветров — кнопка «общий вид»
const { test, expect } = require('@playwright/test');
const { openApp, expectNoErrors } = require('./helpers');

test.describe('телефон: читаемость и попадание пальцем', () => {
  test('кнопки записи в списке — не меньше 40 px, «Удалить» не вплотную', async ({ page }, info) => {
    test.skip(info.project.name !== 'phone', 'только телефон');
    const { errors } = await openApp(page);
    await page.evaluate(() => mnavShow('list'));
    await page.waitForSelector('.entry-row .entry-actions button');
    const r = await page.evaluate(() => {
      const boxes = [...document.querySelectorAll('.entry-row .entry-actions button, .entry-row .entry-actions a')].map(b => b.getBoundingClientRect());
      const row = document.querySelector('.entry-row [data-act="del"]').closest('.entry-row');
      const edit = row.querySelector('[data-act="edit"]').getBoundingClientRect();
      const del = row.querySelector('[data-act="del"]').getBoundingClientRect();
      return {
        min: Math.min(...boxes.map(b => Math.min(b.width, b.height))),
        gap: del.left - edit.right,
        overflow: document.documentElement.scrollWidth - innerWidth,
        // название не сжато значками: у каждой записи ему осталось больше трети строки
        name: Math.min(
          ...[...document.querySelectorAll('.entry-row')].map(
            x => x.querySelector('.entry-main').getBoundingClientRect().width / x.getBoundingClientRect().width
          )
        )
      };
    });
    expect(r.min).toBeGreaterThanOrEqual(40);
    expect(r.gap).toBeGreaterThanOrEqual(6);
    expect(r.overflow).toBeLessThanOrEqual(0);
    expect(r.name).toBeGreaterThan(0.33);
    await expectNoErrors(errors);
  });

  test('текст не мельче 12 px, заголовки разделов — под палец', async ({ page }, info) => {
    test.skip(info.project.name !== 'phone', 'только телефон');
    const { errors } = await openApp(page);
    for (const tab of ['map', 'list', 'filters', 'add', 'more']) {
      await page.evaluate(t => mnavShow(t), tab);
      const r = await page.evaluate(() => {
        const seen = el => {
          const b = el.getBoundingClientRect();
          return b.width > 0 && b.height > 0 && b.bottom > 0 && b.top < innerHeight && getComputedStyle(el).visibility !== 'hidden';
        };
        const tiny = [];
        document.querySelectorAll('body *').forEach(el => {
          if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 2) || !seen(el)) return;
          // подпись источника карты — чужой элемент (Leaflet), его не трогаем
          if (el.closest('.leaflet-control-attribution')) return;
          if (parseFloat(getComputedStyle(el).fontSize) < 12) tiny.push(el.className || el.tagName);
        });
        const titles = [...document.querySelectorAll('.section-title.collapsible')].filter(seen).map(el => el.getBoundingClientRect().height);
        return { tiny, minTitle: titles.length ? Math.min(...titles) : 99 };
      });
      expect(r.tiny, `мелкий текст на вкладке ${tab}`).toEqual([]);
      // 39,5: на серверах CI высота выходит 39,99997 из-за округления долей пикселя
      expect(r.minTitle, `заголовок раздела на вкладке ${tab}`).toBeGreaterThanOrEqual(39.5);
    }
    await expectNoErrors(errors);
  });

  test('роза ветров возвращает общий вид и забывает сохранённое место', async ({ page }) => {
    const { errors } = await openApp(page);
    await page.waitForTimeout(400);
    const start = await page.evaluate(() => ({ z: map.getZoom(), c: map.getCenter() }));
    await page.evaluate(() => map.setView([-33.9, 151.2], 9, { animate: false }));
    await expect.poll(() => page.evaluate(() => localStorage.getItem('travel-map-mapview'))).not.toBeNull();
    await page.click('#resetViewBtn');
    const now = await page.evaluate(() => ({ z: map.getZoom(), c: map.getCenter() }));
    expect(now.z).toBe(start.z);
    expect(now.c.lng).toBeCloseTo(start.c.lng, 0);
    await page.waitForTimeout(900);
    expect(await page.evaluate(() => localStorage.getItem('travel-map-mapview'))).toBeNull();
    await expectNoErrors(errors);
  });
});
