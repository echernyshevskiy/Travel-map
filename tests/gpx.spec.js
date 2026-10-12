// Несколько сегментов в GPX: разрыв между ними не считается километражем
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

function gpx(segments){
  return '<?xml version="1.0"?><gpx><trk>' + segments.map(seg =>
    '<trkseg>' + seg.map(([la, lo, el]) => `<trkpt lat="${la}" lon="${lo}"><ele>${el}</ele></trkpt>`).join('') + '</trkseg>').join('') + '</trk></gpx>';
}
const moscow = [[55.75, 37.62, 150], [55.76, 37.63, 155]];
const piter = [[59.93, 30.31, 10], [59.94, 30.32, 12]];

test('два сегмента далеко друг от друга', async ({ page }) => {
  await openApp(page);
  const [split, joined] = await page.evaluate(([a, b]) => {
    const x = parseGPX(a), y = parseGPX(b);
    return [gpxDistanceKm(x), gpxDistanceKm(y)];
  }, [gpx([moscow, piter]), gpx([[...moscow, ...piter]])]);
  expect(split).toBeLessThan(5);       // два коротких отрезка
  expect(joined).toBeGreaterThan(600); // одним сегментом — с перелётом
});

test('маршрут из rtept читается', async ({ page }) => {
  await openApp(page);
  const n = await page.evaluate(g => parseGPX(g).coords.length,
    '<?xml version="1.0"?><gpx><rte><rtept lat="55.75" lon="37.62"/><rtept lat="59.94" lon="30.31"/></rte></gpx>');
  expect(n).toBe(2);
});
