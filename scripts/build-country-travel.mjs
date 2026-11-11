// Сборка src/data/country_travel.json — практической справки о стране для
// карточки: розетки, напряжение, сторона движения, телефонный код, экстренные
// номера. Запускается вручную, без сети: node scripts/build-country-travel.mjs
// Источники лежат в scripts/data/:
//   kitinerary-countrydb.cpp — розетки и сторона движения: KDE KItinerary,
//     выгрузка из Wikidata (CC0), github.com/KDE/kitinerary;
//   calling-codes.json — телефонные коды: libphonenumber-js (MIT);
//   emergency-numbers.txt — экстренные номера: Wikipedia, «List of emergency
//     telephone numbers»;
//   mains-voltage.txt — страны со 100–127 В: Wikipedia, «Mains electricity by country».
// Строка результата: { plugs: 'CF', v: 230 | 120 | …, vMixed?, drive: 'L' | 'R',
//   tel: '7', em: { p, a, f, n112 } } — номера строками, варианты через «/».
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const D = f => path.join(root, 'scripts/data', f);
const ISO = JSON.parse(fs.readFileSync(path.join(root, 'src/data/country_iso.json'), 'utf8'));
const INFO = JSON.parse(fs.readFileSync(path.join(root, 'src/data/country_info.json'), 'utf8'));
const keys = Object.keys(INFO).sort();

// у KDE Мьянма — под старым кодом BU; Северный Кипр — как Кипр
const KDE_ALIAS = { MM: 'BU' };
const kde = new Map();
for (const m of fs.readFileSync(D('kitinerary-countrydb.cpp'), 'utf8').matchAll(/CountryId\{"([A-Z]{2})"\}, DrivingSide::(\w+), \{([^}]*)\}/g)) {
  kde.set(m[1], {
    drive: m[2] === 'Left' ? 'L' : m[2] === 'Right' ? 'R' : null,
    plugs: [...m[3].matchAll(/Type([A-N])/g)]
      .map(x => x[1])
      .sort()
      .join('')
  });
}
const tel = JSON.parse(fs.readFileSync(D('calling-codes.json'), 'utf8'));
const table = f =>
  fs
    .readFileSync(D(f), 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('#'))
    .map(l => l.split('|'));
const em = new Map(table('emergency-numbers.txt').map(([c, p, a, f, n]) => [c, { p, a, f, n }]));
const volt = new Map(table('mains-voltage.txt').map(([c, v, note]) => [c, { v: +v, mixed: note === 'mixed' }]));

const ISO_FOR = { 'Northern Cyprus': 'CY', 'Somaliland': 'SO' };
// территорий, которых нет в выгрузке KDE, — по Wikipedia («AC power plugs and
// sockets», «Left- and right-hand traffic»); Северный Кипр звонит через +90
const MANUAL = {
  'Bermuda': { plugs: 'AB', drive: 'L' },
  'Falkland Islands': { plugs: 'G', drive: 'L' },
  'French Guiana': { plugs: 'CE', drive: 'R' },
  'Marshall Islands': { plugs: 'AB', drive: 'R' },
  'New Caledonia': { plugs: 'CE', drive: 'R' },
  'Puerto Rico': { plugs: 'AB', drive: 'R' },
  'South Sudan': { plugs: 'CD', drive: 'R' },
  'Vatican': { plugs: 'CFL', drive: 'R' },
  'West Bank': { plugs: 'CH', drive: 'R' },
  'Western Sahara': { plugs: 'CE', drive: 'R' },
  'Northern Cyprus': { tel: '90' }
};
const out = {},
  miss = { plugs: [], tel: [], em: [] };
for (const key of keys) {
  const iso = ISO_FOR[key] || ISO[key];
  const k = kde.get(KDE_ALIAS[iso] || iso) || {};
  const row = {};
  if (k.plugs) row.plugs = k.plugs;
  else miss.plugs.push(key);
  if (k.drive) row.drive = k.drive;
  const v = volt.get(key);
  row.v = v ? v.v : 230;
  if (v && v.mixed) row.vMixed = 1;
  if (tel[iso]) row.tel = tel[iso];
  else miss.tel.push(key);
  const e = em.get(key);
  if (e) {
    const clean = s => (s && s !== '-' ? s : '');
    const x = { p: clean(e.p), a: clean(e.a), f: clean(e.f) };
    if (e.n === '112main') x.n112 = 'main';
    else if (e.n === '112mobile') x.n112 = 'mobile';
    if (x.p || x.a || x.f || x.n112) row.em = Object.fromEntries(Object.entries(x).filter(([, val]) => val));
  } else miss.em.push(key);
  Object.assign(row, MANUAL[key] || {});
  if (row.plugs) miss.plugs = miss.plugs.filter(x => x !== key);
  out[key] = row;
}
const extra = [...em.keys()].filter(c => !INFO[c]);
if (extra.length) throw new Error('emergency-numbers.txt: страны не из справочника: ' + extra.join(', '));
const extraV = [...volt.keys()].filter(c => !INFO[c]);
if (extraV.length) throw new Error('mains-voltage.txt: страны не из справочника: ' + extraV.join(', '));

const file = path.join(root, 'src/data/country_travel.json');
fs.writeFileSync(file, JSON.stringify(out) + '\n');
console.log(`${keys.length} стран → ${path.relative(root, file)} (${fs.statSync(file).size} байт)`);
for (const [k, v] of Object.entries(miss)) if (v.length) console.log(`нет данных (${k}): ${v.join(', ')}`);
