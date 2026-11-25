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
  Object.assign(
    entries.find(e => e.id === 'ci_tb'),
    {
      photos: [
        'https://photos.app.goo.gl/album1',
        'https://example.org/tbilisi-cover.jpg',
        'https://example.org/tbilisi-2.jpg',
        'https://vk.ru/album1_2',
        'https://disk.yandex.ru/d/xyz'
      ],
      instagramUrl: 'https://www.instagram.com/p/abc/',
      mapLinkUrl: 'https://maps.app.goo.gl/x',
      docLinkUrl: 'https://docs.google.com/spreadsheets/d/1'
    }
  );
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'friends-'));
  const dataFile = path.join(tmp, 'data.json');
  fs.writeFileSync(
    dataFile,
    JSON.stringify({
      savedAt: '2026-10-01T10:00:00.000Z',
      // выдуманные поля, которых приложение (пока) не знает, — в публикацию не идут
      entries: entries.map(e => (e.id === 'ci_tb' ? { ...e, secretX: 'личное-поле-записи', dateFrom: '2023-05-02' } : e)),
      races: sampleRaces().map((r, i) => (i ? r : { ...r, notes: 'заметка-о-старте', secretR: 'личное-поле-старта' })),
      tripMeta: { 'Кавказ 2023': { narrative: 'Горы', secretT: 'личное-поле-поездки' }, 'Скрытая поездка': { narrative: 'не для всех' } }
    })
  );
  const out = path.join(tmp, 'friends.html');
  const log = execFileSync('node', [
    path.join(ROOT, 'scripts', 'build-friends.mjs'),
    '--src',
    path.join(ROOT, 'index.html'),
    '--out',
    out,
    '--data',
    dataFile
  ]).toString();
  expect(log).toContain('скрыто 1');
  const html = fs.readFileSync(out, 'utf8');
  const data = readBaked(html);
  const baked = data.entries;
  expect(baked.map(e => e.id)).not.toContain('ci_kz');
  expect(baked.filter(e => 'notes' in e || e.hidden)).toEqual([]);
  expect(data.readOnly).toBe(true);
  // только разрешённые поля: незнакомые и личные не публикуются, о незнакомых — строка в отчёте
  for (const t of ['личное-поле-записи', 'личное-поле-старта', 'личное-поле-поездки', 'заметка-о-старте', 'secretX', 'secretR', 'secretT'])
    expect(html).not.toContain(t);
  expect(log).toContain('Не опубликованы незнакомые поля');
  expect(log).toContain('запись.secretX');
  expect(log).not.toContain('личное-поле');
  expect(baked.find(e => e.id === 'ci_tb').dateFrom).toBe('2023-05-02');
  expect(data.races.length).toBe(sampleRaces().length);
  expect(html).toContain('<title>Travel Map</title>');
  // шрифт флагов — общий файл основной версии, на уровень выше
  expect(html).toContain("var FLAG_FONT_URL = '../fonts/flags.woff2?v=");
  // превью ссылки: полные адреса, ведут на версию для друзей; шрифты — на уровень выше
  expect(html).toContain('<meta property="og:url" content="https://echernyshevskiy.github.io/Travel-map/friends/">');
  expect(html).toContain('<meta property="og:image" content="https://echernyshevskiy.github.io/Travel-map/friends/icon-512.png">');
  expect(html).toContain('<meta name="twitter:image" content="https://echernyshevskiy.github.io/Travel-map/friends/icon-512.png">');
  expect(html).not.toMatch(/url\(fonts\//);
  expect(html).toMatch(/url\(\.\.\/fonts\/eb-garamond-cyrillic-400-normal\.woff2\?v=/);
  expect(html).not.toContain('Скрытая поездка');
  expect(html).toContain('Горы');
  // из ссылок — только обложка и Instagram
  const tb = baked.find(e => e.id === 'ci_tb');
  expect(tb.photos).toEqual(['https://example.org/tbilisi-cover.jpg']);
  expect(tb.instagramUrl).toBe('https://www.instagram.com/p/abc/');
  expect(tb.mapLinkUrl).toBe('https://maps.app.goo.gl/x'); // карты — можно
  expect(tb.docLinkUrl).toBeUndefined();
  for (const s of ['photos.app.goo.gl/album1', 'vk.ru/album1_2', 'disk.yandex.ru/d/xyz', 'tbilisi-2.jpg', 'docs.google.com/spreadsheets/d/1'])
    expect(html).not.toContain(s);
  // повторный запуск на тех же данных ничего не меняет
  const again = execFileSync('node', [
    path.join(ROOT, 'scripts', 'build-friends.mjs'),
    '--src',
    path.join(ROOT, 'index.html'),
    '--out',
    out,
    '--data',
    dataFile
  ]).toString();
  expect(again).toContain('Без изменений');
  // пустые данные (скорее всего, сбой) не затирают версию для друзей
  fs.writeFileSync(dataFile, JSON.stringify({ entries: [] }));
  expect(() =>
    execFileSync('node', [path.join(ROOT, 'scripts', 'build-friends.mjs'), '--src', path.join(ROOT, 'index.html'), '--out', out, '--data', dataFile], {
      stdio: 'pipe'
    })
  ).toThrow();
  expect(fs.readFileSync(out, 'utf8')).toBe(html);

  // и собранная страница открывается
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', r => (r.request().url().startsWith('https://friends.test/') ? r.fulfill({ path: out, contentType: 'text/html' }) : r.abort()));
  await page.goto('https://friends.test/');
  await page.waitForFunction(() => typeof allEntries !== 'undefined' && allEntries.length > 0);
  expect(await page.evaluate(() => allEntries.length)).toBe(entries.length - 1);
  await expect(page.locator('#legendVersion')).toContainText('данные от 1 октября 2026');
  expect(errors).toEqual([]);
});

test('все записи скрыты — публикуется пустая карта, прежние данные не остаются', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'достаточно одной раскладки');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'friends-'));
  const dataFile = path.join(tmp, 'data.json');
  const out = path.join(tmp, 'friends', 'index.html');
  const build = () =>
    execFileSync('node', [
      path.join(ROOT, 'scripts', 'build-friends.mjs'),
      '--src',
      path.join(ROOT, 'index.html'),
      '--out',
      out,
      '--data',
      dataFile
    ]).toString();
  fs.writeFileSync(dataFile, JSON.stringify({ entries: sampleEntries() }));
  build();
  expect(readBaked(fs.readFileSync(out, 'utf8')).entries.length).toBeGreaterThan(0);
  fs.writeFileSync(dataFile, JSON.stringify({ entries: sampleEntries().map(e => ({ ...e, hidden: true })) }));
  expect(build()).toContain('Все записи скрыты');
  const html = fs.readFileSync(out, 'utf8');
  expect(readBaked(html).entries).toEqual([]);
  expect(html).not.toContain('Кавказ 2023');
  // пустая страница открывается без ошибок
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', r => (r.request().url().startsWith('https://friends.test/') ? r.fulfill({ path: out, contentType: 'text/html' }) : r.abort()));
  await page.goto('https://friends.test/');
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
  expect(await page.evaluate(() => allEntries.length)).toBe(0);
  expect(errors).toEqual([]);
});

test('отложенная публикация: последние дни и текущая поездка не видны, старое — видно; 0 — выключено', async ({}, info) => {
  test.skip(info.project.name !== 'desktop', 'достаточно одной раскладки');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'friends-'));
  const dataFile = path.join(tmp, 'data.json');
  const out = path.join(tmp, 'friends', 'index.html');
  const iso = d => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
  const base = sampleEntries()[0];
  const entries = [
    { ...base, id: 'yday', name: 'Вчерашний город', trip: undefined, dateFrom: iso(1) },
    { ...base, id: 'month', name: 'Месяц назад', trip: undefined, dateFrom: iso(30) },
    { ...base, id: 'cur1', name: 'Начало текущей поездки', trip: 'Текущая', dateFrom: iso(20) },
    { ...base, id: 'cur2', name: 'Конец текущей поездки', trip: 'Текущая', dateFrom: iso(2) }
  ];
  const races = [
    { id: 'rNew', name: 'Старт на днях', date: iso(2), status: 'done' },
    { id: 'rOld', name: 'Старт давно', date: iso(60), status: 'done' },
    { id: 'rNext', name: 'Старт впереди', date: iso(-30), status: 'upcoming' }
  ];
  fs.writeFileSync(dataFile, JSON.stringify({ entries, races, tripMeta: { Текущая: { narrative: 'идёт сейчас' } } }));
  const build = (...extra) =>
    execFileSync(
      'node',
      [path.join(ROOT, 'scripts', 'build-friends.mjs'), '--src', path.join(ROOT, 'index.html'), '--out', out, '--data', dataFile, ...extra],
      {
        env: { ...process.env, FRIENDS_DELAY_DAYS: '' }
      }
    ).toString();
  const log = build();
  expect(log).toContain('Задержка публикации 7 дн.');
  let baked = readBaked(fs.readFileSync(out, 'utf8'));
  expect(baked.entries.map(e => e.id)).toEqual(['month']);
  expect(baked.races.map(r => r.id)).toEqual(['rOld', 'rNext']);
  expect(baked.tripMeta).toEqual({}); // описание идущей поездки тоже не публикуется
  // выключено — всё как раньше
  build('--delay-days', '0');
  baked = readBaked(fs.readFileSync(out, 'utf8'));
  expect(baked.entries.map(e => e.id).sort()).toEqual(['cur1', 'cur2', 'month', 'yday']);
  expect(baked.races.length).toBe(3);
  // неверное значение — сборка останавливается, прежняя версия не трогается
  expect(() => build('--delay-days', 'неделя')).toThrow();
});
