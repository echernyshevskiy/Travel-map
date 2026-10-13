// Сборка версии для друзей: скрытые записи и заметки не попадают в файл
const { test, expect } = require('@playwright/test');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { sampleEntries, sampleRaces, ROOT } = require('./helpers');

test('скрипт собирает версию для друзей без личного', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'достаточно одной раскладки');
  const entries = sampleEntries();
  entries.find(e => e.id === 'ci_kz').hidden = true;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'friends-'));
  const dataFile = path.join(tmp, 'data.json');
  fs.writeFileSync(dataFile, JSON.stringify({ savedAt: '2026-10-01T10:00:00.000Z', entries, races: sampleRaces(),
    tripMeta: { 'Кавказ 2023': { narrative: 'Горы' }, 'Скрытая поездка': { narrative: 'не для всех' } } }));
  const out = path.join(tmp, 'friends.html');
  const log = execFileSync('node', [path.join(ROOT, 'scripts', 'build-friends.mjs'), '--src', path.join(ROOT, 'index.html'), '--out', out, '--data', dataFile]).toString();
  expect(log).toContain('скрыто 1');
  const html = fs.readFileSync(out, 'utf8');
  const baked = JSON.parse(html.match(/const BAKED_ENTRIES = (\[.*?\]);\n/s)[1]);
  expect(baked.map(e => e.id)).not.toContain('ci_kz');
  expect(baked.filter(e => 'notes' in e || e.hidden)).toEqual([]);
  expect(html).toContain('const READ_ONLY = true;');
  expect(html).toContain('<title>Travel Map</title>');
  expect(html).not.toContain('Скрытая поездка');
  expect(html).toContain('Горы');
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
