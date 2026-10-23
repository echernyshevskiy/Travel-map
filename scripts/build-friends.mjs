#!/usr/bin/env node
// Собирает версию для друзей (friends/index.html) из основной index.html и данных.
//
// Данные берутся либо из закрытого репозитория синхронизации через GitHub API
// (переменные окружения DATA_REPO и DATA_TOKEN — так работает автосборка на
// GitHub), либо из локального файла: node scripts/build-friends.mjs --data backup.json
//
// Приватность: в результат не попадают записи с флагом «Не показывать друзьям»
// и заметки вообще; описания поездок — только у поездок, которые остались видимыми.
// Из ссылок остаются только обложки (первое фото-картинка записи и выбранные
// обложки поездок), Instagram и ссылки на карты; альбомы и документы убираются.
// Скрипт не содержит секретов и выводит только итоговые числа.
import { applyCsp } from './csp.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const SRC = path.resolve(opt('--src') || path.join(ROOT, 'index.html'));
const OUT = path.resolve(opt('--out') || path.join(ROOT, 'friends', 'index.html'));
const DATA_FILE = opt('--data');
const SYNC_FILE = 'travel-data.json';

function fail(msg){ console.error('Ошибка: ' + msg); process.exit(1); }

async function loadData(){
  if(DATA_FILE) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const repo = process.env.DATA_REPO, token = process.env.DATA_TOKEN;
  if(!repo || !token) fail('нет DATA_REPO или DATA_TOKEN (Settings → Secrets and variables → Actions)');
  if(!/^[\w.-]+\/[\w.-]+$/.test(repo)) fail('DATA_REPO должен быть вида «логин/имя-репозитория»');
  const api = process.env.GITHUB_API_URL || 'https://api.github.com'; // в GitHub Actions задаётся сама
  const res = await fetch(`${api}/repos/${repo}/contents/${SYNC_FILE}`, {
    headers: { 'Accept': 'application/vnd.github.raw+json', 'Authorization': 'Bearer ' + token, 'User-Agent': 'travel-map-friends-build' }
  });
  if(res.status === 401) fail('токен DATA_TOKEN не подходит или истёк');
  if(res.status === 403 || res.status === 404) fail(`нет доступа к ${repo}/${SYNC_FILE}: проверьте имя репозитория и что у токена есть Contents: Read`);
  if(!res.ok) fail(`GitHub ответил ${res.status}`);
  return JSON.parse(await res.text());
}

// JSON внутри <script>: «</script>» в тексте закрыл бы тег раньше времени
const embed = v => JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const strip = (obj, keys) => { const o = Object.assign({}, obj); keys.forEach(k => delete o[k]); return o; };

function replaceOnce(html, pattern, replacement, label){
  const matches = html.match(new RegExp(pattern.source, 'g'));
  if(!matches || matches.length !== 1) fail(`в index.html не найдено (или найдено несколько) место «${label}» — версия файла не та?`);
  return html.replace(pattern, () => replacement);
}

// Ссылки, которые ведут на страницу (альбом, папку, пост), а не на картинку.
// Тот же список, что NON_IMAGE_HOST_PATTERNS в приложении.
const NON_IMAGE = [
  /(^|\/\/)(disk\.yandex\.[a-z]+|yadi\.sk)\//i,
  /instagram\.com\//i,
  /(^|\/\/)(m\.)?vk\.(com|ru)\//i,
  /photos\.app\.goo\.gl|photos\.google\.com/i,
  /drive\.google\.com/i,
  /^https?:\/\/github\.com\/.+\/blob\//i,
  /dropbox\.com\/(s|scl)\//i,
];
const isImageLink = u => typeof u === 'string' && /^https?:\/\//i.test(u.trim()) && !NON_IMAGE.some(re => re.test(u));

const data = await loadData();
if(!data || !Array.isArray(data.entries)) fail('в данных нет списка записей');
const all = data.entries.filter(e => e && typeof e.id === 'string' && e.type && e.name);
const tripCovers = new Set(Object.values(data.tripMeta || {}).map(m => m && m.coverPhoto).filter(isImageLink));
let removedLinks = 0;
const entries = all.filter(e => !e.hidden).map(e => {
  const out = strip(e, ['notes', 'hidden', 'updatedAt', 'fieldTimes', 'ftBase', 'docLinkUrl']);
  removedLinks += e.docLinkUrl ? 1 : 0;
  const photos = Array.isArray(e.photos) ? e.photos : [];
  const cover = photos.find(isImageLink);
  out.photos = photos.filter(p => p === cover || tripCovers.has(p));
  removedLinks += photos.length - out.photos.length;
  return out;
});
if(entries.length === 0) fail('после фильтрации не осталось записей — версию для друзей не перезаписываю');
const trips = new Set(entries.map(e => e.trip).filter(Boolean));
const tripMeta = {};
const keptPhotos = new Set(entries.flatMap(e => e.photos));
Object.entries(data.tripMeta || {}).forEach(([k, v]) => {
  if(!trips.has(k) || !v || typeof v !== 'object') return;
  const m = strip(v, ['updatedAt', 'fieldTimes', 'ftBase']);
  if(m.coverPhoto && !keptPhotos.has(m.coverPhoto)) delete m.coverPhoto;
  tripMeta[k] = m;
});
const races = (Array.isArray(data.races) ? data.races : []).map(r => strip(r, ['updatedAt', 'fieldTimes', 'ftBase']));
const savedAt = typeof data.savedAt === 'string' ? data.savedAt : (typeof data.exportedAt === 'string' ? data.exportedAt : null);

let html = fs.readFileSync(SRC, 'utf8');
// данные — в JSON-тег, который собранная index.html оставляет пустым
html = replaceOnce(html, /<script type="application\/json" id="baked-data">[^<]*<\/script>/,
  `<script type="application/json" id="baked-data">${embed({ readOnly: true, entries, tripMeta, races, savedAt })}</script>`, 'baked-data');
html = replaceOnce(html, /<title>[^<]*<\/title>/, '<title>Travel Map</title>', 'title');
html = replaceOnce(html, /<meta property="og:title" content="[^"]*">/, '<meta property="og:title" content="Travel Map">', 'og:title');
html = replaceOnce(html, /<meta property="og:description" content="[^"]*">/,
  '<meta property="og:description" content="Карта путешествий: страны, города и маршруты на интерактивной карте">', 'og:description');

// последняя проверка: ничего личного в файле не осталось
if(entries.some(e => 'notes' in e || e.hidden || e.docLinkUrl)) fail('в данных для друзей остались заметки, скрытые записи или личные ссылки');
if(entries.some(e => e.photos.some(p => !isImageLink(p)))) fail('в данных для друзей осталась ссылка на альбом');

fs.mkdirSync(path.dirname(OUT), { recursive: true });

// Сервис-воркер версии для друзей — тот же sw.js, только со своим именем
// хранилищ (APP_VARIANT), чтобы версии не стирали кэш друг друга. Раньше копия
// лежала в friends/ отдельно и отставала от основной при правках.
const SW_SRC = path.join(ROOT, 'sw.js'), SW_OUT = path.join(path.dirname(OUT), 'sw.js');
if(fs.existsSync(SW_SRC)){
  const sw = fs.readFileSync(SW_SRC, 'utf8');
  if(!sw.includes("const APP_VARIANT = 'edit';")) fail("в sw.js не найдено const APP_VARIANT = 'edit'");
  const swFriends = sw.replace("const APP_VARIANT = 'edit';", "const APP_VARIANT = 'friends';");
  if(!fs.existsSync(SW_OUT) || fs.readFileSync(SW_OUT, 'utf8') !== swFriends){
    fs.writeFileSync(SW_OUT, swFriends);
    console.log('Сервис-воркер версии для друзей обновлён');
  }
}

// данные поменялись — пересчитываем политику безопасности (хэши скриптов)
html = applyCsp(html);
const before = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;
if(before === html){ console.log(`Без изменений: записей ${entries.length}`); process.exit(0); }
fs.writeFileSync(OUT, html);
console.log(`Версия для друзей обновлена: записей ${entries.length} (скрыто ${all.length - entries.length}), убрано ссылок ${removedLinks}, стартов ${races.length}, описаний поездок ${Object.keys(tripMeta).length}${savedAt ? ', данные от ' + savedAt.slice(0, 10) : ''}`);
