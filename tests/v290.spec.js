// v2.90: итоги года — три шаблона картинки («Цифры», «Карта», «Квадрат»),
// предпросмотр в окне, «Поделиться» (системное меню) и «Скачать»
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const { openApp, expectNoErrors, sampleEntries } = require('./helpers');

const openRecap = async (page, year) => {
  await page.evaluate(y => {
    document.getElementById('openRecapBtn').click();
    const s = document.getElementById('recapYear');
    s.value = String(y);
    s.dispatchEvent(new Event('change'));
  }, year);
};
const year = Math.max(
  ...sampleEntries()
    .filter(e => e.status !== 'wishlist' && e.year)
    .map(e => e.year)
);
const previewSize = page =>
  page.waitForFunction(() => {
    const img = document.getElementById('recapPreview');
    return !img.hidden && img.complete && img.naturalWidth ? [img.naturalWidth, img.naturalHeight] : false;
  });

test.describe('итоги года: картинки', () => {
  test('три шаблона: предпросмотр нужного размера, выбор запоминается', async ({ page }, info) => {
    const { errors } = await openApp(page);
    await openRecap(page, year);
    await expect(page.locator('#recapTemplates [data-template]')).toHaveCount(3);
    await expect(page.locator('#recapTemplates [data-template="stats"]')).toHaveAttribute('aria-pressed', 'true');
    expect(await (await previewSize(page)).jsonValue()).toEqual([1080, 1920]);
    await page.click('#recapTemplates [data-template="square"]');
    await expect.poll(async () => (await (await previewSize(page)).jsonValue())[1]).toBe(1080);
    await page.click('#recapTemplates [data-template="map"]');
    await expect.poll(async () => (await (await previewSize(page)).jsonValue())[1]).toBe(1920);
    await expect(page.locator('#recapPreview')).toHaveAttribute('alt', new RegExp(`Итоги ${year} года — Карта`));
    // на телефоне превью целиком помещается по ширине окна
    if (info.project.name === 'phone') {
      const box = await page.locator('#recapPreview').boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width);
    }
    // выбор шаблона помнится после перезагрузки
    await page.reload();
    await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
    await openRecap(page, year);
    await expect(page.locator('#recapTemplates [data-template="map"]')).toHaveAttribute('aria-pressed', 'true');
    await expectNoErrors(errors);
  });

  test('«Карта»: год, подписи, новые страны; файл скачивается с именем шаблона', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'достаточно одной раскладки');
    const { errors } = await openApp(page);
    await page.evaluate(() => {
      window.__texts = [];
      const f = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (t) {
        window.__texts.push(String(t));
        return f.apply(this, arguments);
      };
    });
    await openRecap(page, year);
    await page.click('#recapTemplates [data-template="map"]');
    await previewSize(page);
    const texts = await page.evaluate(() => window.__texts);
    expect(texts).toContain(String(year));
    expect(texts).toContain('год в путешествиях');
    expect(texts).toContain('км в пути');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#recapDownload')]);
    expect(dl.suggestedFilename()).toBe(`travel-map-${year}-map.png`);
    expect(
      fs
        .readFileSync(await dl.path())
        .subarray(1, 4)
        .toString()
    ).toBe('PNG');
    await expectNoErrors(errors);
  });

  test('«Поделиться» — когда браузер умеет делиться файлами: отдаёт картинку в системное меню', async ({ page }, info) => {
    test.skip(info.project.name !== 'phone', 'только телефон');
    await page.addInitScript(() => {
      window.__shared = [];
      navigator.canShare = d => !!(d && d.files && d.files.length);
      navigator.share = async d => {
        window.__shared.push({ name: d.files[0].name, type: d.files[0].type, size: d.files[0].size, title: d.title });
      };
    });
    const { errors } = await openApp(page);
    await openRecap(page, year);
    await expect(page.locator('#recapShare')).toBeVisible();
    await page.click('#recapTemplates [data-template="square"]');
    await page.click('#recapShare');
    await expect.poll(() => page.evaluate(() => window.__shared.length)).toBe(1);
    const s = await page.evaluate(() => window.__shared[0]);
    expect(s).toMatchObject({ name: `travel-map-${year}-square.png`, type: 'image/png', title: 'Год в путешествиях' });
    expect(s.size).toBeGreaterThan(10_000);
    await expectNoErrors(errors);
  });

  test('без поддержки «Поделиться» кнопки нет, «Скачать» есть', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'достаточно одной раскладки');
    await page.addInitScript(() => {
      delete Navigator.prototype.canShare;
      delete Navigator.prototype.share;
    });
    const { errors } = await openApp(page);
    await openRecap(page, year);
    await expect(page.locator('#recapShare')).toBeHidden();
    await expect(page.locator('#recapDownload')).toBeVisible();
    await expectNoErrors(errors);
  });
});
