// v2.58: остановки маршрута стоят на самой линии, а касание точки открывает
// карточку маршрута без подсказки, торчащей из-под неё.
const { test, expect } = require('@playwright/test');
const { openApp, sampleEntries, encodePolyline, expectNoErrors } = require('./helpers');

const TRACK = Array.from({ length: 200 }, (_, i) => [55, 37 + i / 199]);   // дорога вдоль 55° с. ш.
function entries(){
  return [...sampleEntries(), {
    id: 'rt_snap', type: 'route', name: 'Дорога на восток', year: 2024, month: 6, color: '#3F5240', activity: 'roadtrip',
    status: 'visited', photos: [], purpose: 'tourism', coordsEncoded: encodePolyline(TRACK), distanceKm: 64,
    waypointNames: ['Район в стороне', 'Ошибочная точка'], waypointCoords: [[55.1, 37.5], [55.6, 37.5]],
    waypointCountryKeys: ['Russia', 'Russia'],
  }];
}
const stops = page => page.evaluate(() => {
  const out = {};
  routeStopsLayer.eachLayer(l => { const t = l.getTooltip().getContent(); out[t.split(' <')[0]] = [+l.getLatLng().lat.toFixed(4), +l.getLatLng().lng.toFixed(4)]; });
  return out;
});

test('остановка рядом с треком прижимается к нему, далёкая остаётся на месте', async ({ page }) => {
  const { errors } = await openApp(page, { entries: entries() });
  const s = await stops(page);
  expect(s['Район в стороне'][0]).toBeCloseTo(55, 3);       // была в 11 км к северу
  expect(s['Район в стороне'][1]).toBeCloseTo(37.5, 2);
  expect(s['Ошибочная точка']).toEqual([55.6, 37.5]);       // 66 км — не прячем ошибку
  // «по прямой» линия и так проходит через остановки
  const est = await page.evaluate(() => routeStopCoords(allEntries.find(e => e.id === 'rt_city')) === allEntries.find(e => e.id === 'rt_city').waypointCoords);
  expect(est).toBe(true);
  await expectNoErrors(errors);
});

test('касание точки остановки: карточка маршрута без подсказки под ней', async ({ page }) => {
  const { errors } = await openApp(page, { entries: entries() });
  const pt = await page.evaluate(() => {
    map.setView([55, 37.5], 9, { animate: false });
    let ll = null;
    routeStopsLayer.eachLayer(l => { if(l.getTooltip().getContent().startsWith('Район')) ll = l.getLatLng(); });
    const p = map.latLngToContainerPoint(ll), r = document.getElementById('map').getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y };
  });
  await page.mouse.click(pt.x, pt.y);
  await expect(page.locator('.leaflet-popup-content')).toContainText('Дорога на восток');
  await page.waitForTimeout(150);
  await expect(page.locator('.leaflet-tooltip')).toHaveCount(0);
  await expectNoErrors(errors);
});
