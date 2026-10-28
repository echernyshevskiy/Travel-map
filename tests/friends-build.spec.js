// Сборка версии для друзей: скрытые записи и заметки не попадают в файл
const { test, expect } = require('@playwright/test');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { sampleEntries, sampleRaces, ROOT, readBaked } = require('./helpers');

test('скрипт собирает версию для друзей без личного', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'достаточно одной раскладки');
  const entries = sampleEntries();
  entries.find(e => e.id === 'ci_kz').hidden = true;
  Object.assign(entries.find(e => e.id === 'ci_tb'), {
    photos: ['https://photos.app.goo.gl/album1', 'https://example.org/tbilisi-cover.jpg', 'https://example.org/tbilisi-2.jpg', 'https://vk.ru/album1_2', 'https://disk.yandex.ru/d/xyz'],
    instagramUrl: 'https://www.instagram.com/p/abc/', mapLinkUrl: 'https://maps.app.goo.gl/x', docLinkUrl: 'https://docs.google.com/spreadsheets/d/1'
  });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'friends-'));
  const dataFile = path.join(tmp, 'data.json');
  fs.writeFileSync(dataFile, JSON.stringify({ savedAt: '2026-10-01T10:00:00.000Z', entries, races: sampleRaces(),
    tripMeta: { 'Кавказ 2023': { narrative: 'Горы' }, 'Скрытая поездка': { narrative: 'не для всех' } } }));
  const out = path.join(tmp, 'friends.html');
  const log = execFileSync('node', [path.join(ROOT, 'scripts', 'build-friends.mjs'), '--src', path.join(ROOT, 'index.html'), '--out', out, '--data', dataFile]).toString();
  expect(log).toContain('скрыто 1');
  const html = fs.readFileSync(out, 'utf8');
  const data = readBaked(html);
  const baked = data.entries;
  expect(baked.map(e => e.id)).not.toContain('ci_kz');
  expect(baked.filter(e => 'notes' in e || e.hidden)).toEqual([]);
  expect(data.readOnly).toBe(true);
  expect(html).toContain('<title>Travel Map</title>');
  // шрифт флагов — общий файл основной версии, на уровень выше
  expect(html).toContain("var FLAG_FONT_URL = '../fonts/flags.woff2?v=");
  expect(html).not.toContain('Скрытая поездка');
  expect(html).toContain('Горы');
  // из ссылок — только обложка и Instagram
  const tb = baked.find(e => e.id === 'ci_tb');
  expect(tb.photos).toEqual(['https://example.org/tbilisi-cover.jpg']);
  expect(tb.instagramUrl).toBe('https://www.instagram.com/p/abc/');
  expect(tb.mapLinkUrl).toBe('https://maps.app.goo.gl/x'); // карты — можно
  expect(tb.docLinkUrl).toBeUndefined();
  for(const s of ['photos.app.goo.gl/album1', 'vk.ru/album1_2', 'disk.yandex.ru/d/xyz', 'tbilisi-2.jpg', 'docs.google.com/spreadsheets/d/1']) expect(html).not.toContain(s);
  // повторный запуск на тех же данных ничего не меняет
  const again = execFileSync('node', [path.join(ROOT, 'scripts', 'build-friends.mjs'), '--src', path.join(ROOT, 'index.html'), '--out', out, '--data', dataFile]).toString();
  expect(again).toContain('Без изменений');
  // пустые данные не затирают версию для друзей
  fs.writeFileSync(dataFile, JSON.stringify({ entries: [{ ...entries[0], hidden: true }] }));
  expect(() => execFileSync('node', [path.join(ROOT, 'scripts', 'build-friends.mjs'), '--src', path.join(ROOT, 'index.html'), '--out', out, '--data', dataFile], { stdio: 'pipe' })).toThrow();
  expect(fs.readFileSync(out, 'utf8')).toBe(html);

  // и собранная страница открывается
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', r => r.request().url().startsWith('https://friends.test/') ? r.fulfill({ path: out, contentType: 'text/html' }) : r.abort());
  await page.goto('https://friends.test/');
  await page.waitForFunction(() => typeof allEntries !== 'undefined' && allEntries.length > 0);
  expect(await page.evaluate(() => allEntries.length)).toBe(entries.length - 1);
  await expect(page.locator('#legendVersion')).toContainText('данные от 1 октября 2026');
  expect(errors).toEqual([]);
});
