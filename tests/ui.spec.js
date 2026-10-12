// Согласованность интерфейса: цифры, выбор в таблице, тёмная тема, роза ветров
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

test('цифры в шапке совпадают со сводкой (уникальные места, без планов)', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'на телефоне шапки с цифрами нет');
  await openApp(page);
  // 2 страны (Япония в планах не считается); города: Тбилиси, Казань, Сочи,
  // два разных Парижа, Москва, Тверь, Петербург = 8
  await expect(page.locator('#statCountries')).toHaveText('2');
  await expect(page.locator('#statCities')).toHaveText('8');
  await expect(page.locator('#glanceBar')).toContainText('8');
});

test('«выбрать всё» отражает фактический выбор', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => document.getElementById('openTableBtn').click());
  const state = () => page.evaluate(() => { const c = document.getElementById('selectAllCheckbox'); return [c.checked, c.indeterminate, selectedIds.size]; });
  await page.locator('#selectAllCheckbox').check();
  expect(await state()).toEqual([true, false, 10]);
  await page.locator('#entriesTableBody input[type=checkbox]').first().uncheck();
  expect(await state()).toEqual([false, true, 9]);
});

function contrast(fg, bg){
  const lum = c => { const v = c.match(/[\d.]+/g).slice(0, 3).map(Number).map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}
for(const theme of ['light', 'dark']){
  test(`${theme}: подписи на карте читаются`, async ({ page }) => {
    await openApp(page, { theme });
    for(const sel of ['#timelineYearLabel', '#mapFullBtn', '.leaflet-control-zoom-in']){
      const [fg, bg] = await page.evaluate(sel => {
        const e = document.querySelector(sel); let p = e, bg;
        while(p){ bg = getComputedStyle(p).backgroundColor; if(bg !== 'rgba(0, 0, 0, 0)') break; p = p.parentElement; }
        return [getComputedStyle(e).color, bg];
      }, sel);
      expect(contrast(fg, bg), `${sel}: ${fg} на ${bg}`).toBeGreaterThan(4.5);
    }
  });
}

test('роза ветров не под кнопками масштаба', async ({ page }) => {
  await openApp(page);
  const [zoomBottom, roseTop] = await page.evaluate(() => [
    document.querySelector('.leaflet-control-zoom').getBoundingClientRect().bottom,
    document.querySelector('.compass-rose').getBoundingClientRect().top - 15]);
  expect(roseTop).toBeGreaterThan(zoomBottom);
});

test('точку города можно поставить внутри России и отмеченных стран', async ({ page }) => {
  await openApp(page);
  for(const [lat, lng] of [[60, 90], [41.8, 44.5]]){ // Россия, Грузия (отмечена)
    await page.evaluate(() => { document.querySelector('.type-btn[data-type="city"]').click(); placingCity = true; mnavShow('map'); map.setView([50, 60], 3, { animate: false }); });
    const box = await page.locator('#map').boundingBox();
    const pt = await page.evaluate(([la, lo]) => { const p = map.latLngToContainerPoint([la, lo]); return [p.x, p.y]; }, [lat, lng]);
    await page.mouse.click(box.x + pt[0], box.y + pt[1]);
    await expect.poll(() => page.evaluate(() => placingCity)).toBe(false);
    expect(await page.evaluate(() => pendingLatLng && Math.round(pendingLatLng.lat))).toBe(Math.round(lat));
  }
});
