// v2.80: стартовый вид на телефоне — карта заполняет экран по высоте,
// верхний край у 82° с. ш., по долготе — середина отметок; отдалить до всего
// мира можно как обычно. На компьютере — весь мир, как раньше.
const { test, expect } = require('@playwright/test');
const { openApp, expectNoErrors } = require('./helpers');

const view = page =>
  page.evaluate(() => {
    const size = map.getSize();
    return {
      z: map.getZoom(),
      lng: map.getCenter().lng,
      top: map.containerPointToLatLng([size.x / 2, 0]).lat,
      bottom: map.containerPointToLatLng([size.x / 2, size.y]).lat,
      worldH: map.getPixelWorldBounds().getSize().y,
      h: size.y,
      w: size.x
    };
  });

test.describe('стартовый вид карты', () => {
  test('телефон: карта по высоте на весь экран, сверху — Арктика', async ({ page }, info) => {
    test.skip(info.project.name !== 'phone', 'только телефон');
    const { errors } = await openApp(page);
    await page.waitForTimeout(300);
    const v = await view(page);
    expect(v.h).toBeGreaterThan(v.w); // вертикальный экран
    // пустых полей сверху и снизу нет: мир выше экрана
    expect(v.worldH).toBeGreaterThanOrEqual(v.h);
    expect(v.z).toBeGreaterThanOrEqual(2);
    expect(Math.abs(v.top - 82)).toBeLessThan(1);
    expect(v.bottom).toBeGreaterThan(-85);
    // середина отметок тестового набора — Грузия, Москва, Петербург… (30–45° в. д.)
    expect(v.lng).toBeGreaterThan(25);
    expect(v.lng).toBeLessThan(50);
    await expectNoErrors(errors);
  });

  test('телефон: отдалить до всего мира можно, стартовый вид не запоминается', async ({ page }, info) => {
    test.skip(info.project.name !== 'phone', 'только телефон');
    const { errors } = await openApp(page);
    await page.waitForTimeout(1000);
    expect(await page.evaluate(() => localStorage.getItem('travel-map-mapview'))).toBeNull();
    const z0 = await page.evaluate(() => map.getZoom());
    await page.evaluate(() => map.fitBounds(WORLD_VIEW_BOUNDS, { animate: false }));
    expect(await page.evaluate(() => map.getZoom())).toBeLessThan(z0);
    // а вот вид, выбранный человеком, запоминается как раньше
    await page.waitForTimeout(900);
    expect(await page.evaluate(() => localStorage.getItem('travel-map-mapview'))).not.toBeNull();
    await expectNoErrors(errors);
  });

  test('телефон: без отметок — по долготе дома', async ({ page }, info) => {
    test.skip(info.project.name !== 'phone', 'только телефон');
    const { errors } = await openApp(page, { entries: [], races: [] });
    await page.waitForTimeout(300);
    const v = await view(page);
    const home = await page.evaluate(() => HOME_LOCATION.lng);
    expect(Math.abs(v.lng - home)).toBeLessThan(0.01);
    expect(Math.abs(v.top - 82)).toBeLessThan(1);
    await expectNoErrors(errors);
  });

  test('телефон: сохранённый вид важнее стартового', async ({ page }, info) => {
    test.skip(info.project.name !== 'phone', 'только телефон');
    await page.addInitScript(() => {
      try {
        localStorage.setItem('travel-map-mapview', JSON.stringify({ lat: -33.9, lng: 151.2, z: 9 }));
      } catch (e) {}
    });
    const { errors } = await openApp(page);
    await page.waitForTimeout(400);
    const v = await page.evaluate(() => ({ z: map.getZoom(), c: map.getCenter() }));
    expect(v.z).toBe(9);
    expect(v.c.lng).toBeCloseTo(151.2, 1);
    await expectNoErrors(errors);
  });

  test('компьютер: весь мир, как раньше', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'только компьютер');
    const { errors } = await openApp(page);
    await page.waitForTimeout(300);
    const z = await page.evaluate(() => ({ now: map.getZoom(), world: map.getBoundsZoom(WORLD_VIEW_BOUNDS) }));
    expect(z.now).toBe(z.world);
    await expectNoErrors(errors);
  });
});
