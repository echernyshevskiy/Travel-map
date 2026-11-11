// v2.71: исправления после аудита — анимации глобуса, работа без сети, кэш
// фрагментов карты, превью ссылки
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { openApp, expectNoErrors, ROOT } = require('./helpers');

// кадр с отметкой времени раньше нажатия — так бывает на живом браузере
// (отметка кадра — его начало); раньше это давало рывок в обратную сторону
const earlyFrames = page =>
  page.evaluate(() => {
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = cb => raf(ts => cb(Math.min(ts, performance.now() - 40)));
  });

test('глобус: «−» у предела приближения отдаляет, а не выкидывает на плоскую карту', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'клавиатура — на ПК');
  const { errors } = await openApp(page);
  await page.click('#globeToggleBtn');
  await expect(page.locator('#globeCanvas')).toBeVisible();
  await page.evaluate(() => {
    globe.proj.rotate([-43, -42, 0]);
    globe.proj.scale(globeMaxScale() * 0.985);
    globeDraw();
  });
  await earlyFrames(page);
  const s0 = await page.evaluate(() => {
    window.__max = 0;
    const orig = globe.proj.scale.bind(globe.proj);
    globe.proj.scale = function (v) {
      if (arguments.length) {
        __max = Math.max(__max, v);
        return orig(v);
      }
      return orig();
    };
    return globe.proj.scale();
  });
  await page.keyboard.press('-');
  await expect.poll(() => page.evaluate(() => globe.proj.scale())).toBeLessThan(s0 * 0.75);
  expect(await page.evaluate(() => globe.active)).toBe(true);
  expect(await page.evaluate(() => __max)).toBeLessThanOrEqual(s0 + 0.01);
  await expectNoErrors(errors);
});

test('глобус: перелёт и инерция не дёргаются назад на раннем кадре', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'достаточно одной раскладки');
  const { errors } = await openApp(page);
  await page.click('#globeToggleBtn');
  await expect(page.locator('#globeCanvas')).toBeVisible();
  await earlyFrames(page);
  const r = await page.evaluate(async () => {
    globe.proj.rotate([0, 0, 0]);
    globe.proj.scale(globeFitScale());
    globeDraw();
    const lons = [];
    globeFlyTo([60, 0], globeFitScale(), 300);
    for (let i = 0; i < 25; i++) {
      await new Promise(res => requestAnimationFrame(() => res()));
      lons.push(-globe.proj.rotate()[0]);
    }
    // долгота центра растёт монотонно к 60°, без шага назад
    const back = lons.some((v, i) => i && v < lons[i - 1] - 1e-6);
    globeStartInertia(0.5, 0);
    const r0 = globe.proj.rotate()[0];
    await new Promise(res => requestAnimationFrame(() => res()));
    return { back, end: Math.round(lons[lons.length - 1]), inertiaOk: globe.proj.rotate()[0] >= r0 - 1e-6 };
  });
  expect(r.back).toBe(false);
  expect(r.end).toBe(60);
  expect(r.inertiaOk).toBe(true);
  await expectNoErrors(errors);
});

test('шрифты интерфейса — свои файлы рядом с приложением, политика безопасности без Google', async ({}, info) => {
  test.skip(info.project.name !== 'desktop', 'проверка файлов');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  expect(html).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
  const urls = [...html.matchAll(/url\(fonts\/([^?)]+)\?v=([0-9a-f]{8})\)/g)];
  expect(urls.length).toBeGreaterThanOrEqual(25);
  for (const [, name] of urls) expect(fs.existsSync(path.join(ROOT, 'fonts', name)), name).toBe(true);
  for (const fam of ['Playfair Display', 'EB Garamond', 'Courier Prime']) expect(html).toContain(`font-family:'${fam}'`);
  const friends = fs.readFileSync(path.join(ROOT, 'friends/index.html'), 'utf8');
  if (friends.includes('appFonts')) expect(friends).not.toMatch(/url\(fonts\//);
});

test('превью ссылки: полные адреса картинки и страницы', async ({}, info) => {
  test.skip(info.project.name !== 'desktop', 'проверка файла');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).homepage;
  expect(html).toContain(`<meta property="og:url" content="${site}">`);
  expect(html).toContain(`<meta property="og:image" content="${site}icon-512.png">`);
  expect(html).toContain(`<meta name="twitter:image" content="${site}icon-512.png">`);
  expect(html).not.toContain('__SITE_URL__');
  expect(fs.existsSync(path.join(ROOT, 'icon-512.png')) && fs.existsSync(path.join(ROOT, 'friends/icon-512.png'))).toBe(true);
});
