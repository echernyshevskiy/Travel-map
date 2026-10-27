// v2.67: подписи океанов и морей на «Контурах» и на глобусе
const { test, expect } = require('@playwright/test');
const { openApp, expectNoErrors } = require('./helpers');

const view = (page, lat, lng, z) => page.evaluate(([lat, lng, z]) => { map.setView([lat, lng], z, { animate: false }); renderMapLabels(); }, [lat, lng, z]);
const seaLabels = page => page.evaluate(() => [...document.querySelectorAll('.map-label.ml-sea')].map(el => {
  const inner = el.querySelector('.ml-sea-in'), r = el.getBoundingClientRect();
  return { text: el.innerText.replace(/\s+/g, ' ').trim(), rot: /rotate/.test(inner.style.transform), r: [r.left, r.top, r.right, r.bottom] };
}));

test('«Контуры»: моря подписаны целиком на экране, не под плашками и не поверх других подписей', async ({ page }) => {
  const { errors } = await openApp(page);
  await view(page, 50, 20, 4);
  const seas = await seaLabels(page);
  const names = seas.map(s => s.text.toLowerCase());
  expect(names.some(n => n.includes('чёрное море')), names.join(', ')).toBe(true);
  expect(names.some(n => n.includes('северное море')), names.join(', ')).toBe(true);
  const ctx = await page.evaluate(() => {
    const box = el => { if(!el || !el.offsetWidth) return null; const r = el.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; };
    return { map: box(document.getElementById('map')), ui: ['#legend', '#timelineBar', '#mapGlance', '.map-controls', '.leaflet-control-zoom'].map(s => box(document.querySelector(s))).filter(Boolean),
      others: [...document.querySelectorAll('.map-label:not(.ml-sea)')].map(box).filter(Boolean) };
  });
  const hit = (a, b) => Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > 1 && Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > 1;
  for(const s of seas){
    expect(s.r[0] >= ctx.map[0] && s.r[1] >= ctx.map[1] && s.r[2] <= ctx.map[2] && s.r[3] <= ctx.map[3], s.text + ' за краем карты').toBe(true);
    expect(ctx.ui.some(u => hit(s.r, u)), s.text + ' под плашкой').toBe(false);
    // повёрнутая подпись занимает меньше своей рамки — её проверяет сама раскладка
    if(!s.rot) expect(ctx.others.some(o => hit(s.r, o)), s.text + ' поверх другой подписи').toBe(false);
  }
  await expectNoErrors(errors);
});

test('вытянутое море подписано вдоль, океаны — прописными; на мелком масштабе заливов нет', async ({ page }) => {
  const { errors } = await openApp(page);
  await view(page, 22, 40, 5);
  const red = (await seaLabels(page)).find(s => /красное/i.test(s.text));
  expect(red && red.rot).toBe(true);
  await view(page, 0, 20, 2);
  const world = await seaLabels(page);
  expect(world.some(s => /ОКЕАН/.test(s.text)), world.map(s => s.text).join(', ')).toBe(true);
  expect(world.some(s => /залив|пролив/i.test(s.text))).toBe(false);
  await expectNoErrors(errors);
});

test('подписи морей — только на «Контурах»: на карте с тайлами и в квизе их нет', async ({ page }) => {
  const { errors } = await openApp(page);
  await view(page, 50, 20, 4);
  expect((await seaLabels(page)).length).toBeGreaterThan(0);
  await page.evaluate(() => { setBasemap('topo'); renderMapLabels(); });
  expect((await seaLabels(page)).length).toBe(0);
  await page.evaluate(() => { setBasemap('plain'); document.body.classList.add('quiz-map'); renderMapLabels(); });
  expect((await seaLabels(page)).length).toBe(0);
  await page.evaluate(() => { document.body.classList.remove('quiz-map'); renderMapLabels(); });
  expect((await seaLabels(page)).length).toBeGreaterThan(0);
  await expectNoErrors(errors);
});

for(const theme of ['light', 'dark']){
  test(`подписи морей читаемы на воде (${theme === 'dark' ? 'тёмная' : 'светлая'} тема)`, async ({ page }) => {
    const { errors } = await openApp(page, { theme });
    await view(page, 50, 20, 4);
    const ratio = await page.evaluate(() => {
      const rgb = s => (s.match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3).map(Number);
      const lum = c => { const [r, g, b] = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      const a = lum(rgb(getComputedStyle(document.querySelector('.map-label.ml-sea')).color)), b = lum(rgb(getComputedStyle(document.getElementById('map')).backgroundColor));
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    });
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    await expectNoErrors(errors);
  });
}

test('глобус: моря подписаны и при вращении, без ошибок', async ({ page }) => {
  const { errors } = await openApp(page);
  await page.evaluate(() => globeEnter({ noFlyOut: true }));
  await page.waitForTimeout(800);
  const n = await page.evaluate(() => {
    const out = [];
    for(const [lng, lat, k] of [[-25, -45, 2], [-120, -20, 1.6], [150, 30, 1.2]]){
      globe.proj.rotate([lng, lat, 0]); globe.proj.scale(globeFitScale() * k); globeDraw(); out.push(globe.stats.seaLabels);
    }
    globeExit();
    return out;
  });
  expect(n.every(x => x > 0), JSON.stringify(n)).toBe(true);
  await expectNoErrors(errors);
});
