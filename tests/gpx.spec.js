// Несколько сегментов в GPX: разрыв между ними не считается километражем
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

function gpx(segments) {
  return (
    '<?xml version="1.0"?><gpx><trk>' +
    segments.map(seg => '<trkseg>' + seg.map(([la, lo, el]) => `<trkpt lat="${la}" lon="${lo}"><ele>${el}</ele></trkpt>`).join('') + '</trkseg>').join('') +
    '</trk></gpx>'
  );
}
const moscow = [
  [55.75, 37.62, 150],
  [55.76, 37.63, 155]
];
const piter = [
  [59.93, 30.31, 10],
  [59.94, 30.32, 12]
];

test('два сегмента далеко друг от друга', async ({ page }) => {
  await openApp(page);
  const [split, joined] = await page.evaluate(
    ([a, b]) => {
      const x = parseGPX(a),
        y = parseGPX(b);
      return [gpxDistanceKm(x), gpxDistanceKm(y)];
    },
    [gpx([moscow, piter]), gpx([[...moscow, ...piter]])]
  );
  expect(split).toBeLessThan(5); // два коротких отрезка
  expect(joined).toBeGreaterThan(600); // одним сегментом — с перелётом
});

test('маршрут из rtept читается', async ({ page }) => {
  await openApp(page);
  const n = await page.evaluate(
    g => parseGPX(g).coords.length,
    '<?xml version="1.0"?><gpx><rte><rtept lat="55.75" lon="37.62"/><rtept lat="59.94" lon="30.31"/></rte></gpx>'
  );
  expect(n).toBe(2);
});

test('очень длинный трек (300 тыс. точек) импортируется без падения', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'достаточно одной раскладки');
  test.setTimeout(60_000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await openApp(page);
  // раньше Math.max(...высоты) на таком треке падал с «Maximum call stack size exceeded»
  const n = 300_000;
  let body = '';
  for (let i = 0; i < n; i++) body += `<trkpt lat="${(55 + i * 1e-6).toFixed(6)}" lon="${(37 + i * 1e-6).toFixed(6)}"><ele>${100 + (i % 500)}</ele></trkpt>`;
  const buf = Buffer.from(`<?xml version="1.0"?><gpx><trk><trkseg>${body}</trkseg></trk></gpx>`);
  if (info.project.name === 'desktop') await page.click('#stab-add');
  await page.locator('.type-btn[data-type="route"]').click();
  await page.setInputFiles('#gpxInput', { name: 'Длинный.gpx', mimeType: 'application/gpx+xml', buffer: buf });
  // файл прочитан и ждёт сохранения формы
  await expect(page.locator('#fileDrop')).toHaveClass(/has-file/, { timeout: 40_000 });
  await expect(page.locator('#fileDrop')).toContainText('Длинный.gpx');
  const g = await page.evaluate(() => ({ max: pendingGpxList[0].maxElevation, prof: pendingGpxList[0].profile.length, pts: pendingGpxList[0].coords.length }));
  expect(g.max).toBe(599);
  expect(g.prof).toBeLessThan(50); // прорежён примерно до 40 точек
  expect(g.pts).toBeLessThan(1000); // для карты прорежён примерно до 800 точек
  expect(errors).toEqual([]);
});
