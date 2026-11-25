// Сборка data/airports.txt — справочника аэропортов для журнала перелётов.
// Запускается вручную, когда нужно обновить список:
//   node scripts/build-airports.mjs <airports.csv>
// airports.csv — из OurAirports (https://ourairports.com/data/, общественное
// достояние): https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv
// Берутся аэропорты с кодом IATA и регулярными рейсами (крупные и средние, а
// также малые с регулярными рейсами — например, региональные в России).
// Строка результата: «IATA|широта|долгота|страна|город|название|размер», где страна —
// ключ нашей карты (как у отметок), город — по-русски, если рядом (до 60 км)
// есть город из встроенного справочника (крупный — выше ближнего посёлка) или русское название в ключевых словах
// OurAirports; иначе — как в OurAirports. Размер — L / M / S (крупный, средний,
// малый): крупные аэропорты выше в подсказках.
// Файл лежит рядом с приложением (data/), а не внутри него: справочник нужен
// только при добавлении перелёта, и грузится тогда же (≈ 115 КБ в сжатом виде).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { haversine } from '../src/lib/geo.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const csvFile = process.argv[2];
if (!csvFile) {
  console.error('usage: build-airports.mjs airports.csv');
  process.exit(1);
}

// простой разбор CSV с кавычками
function parseCsv(text) {
  const rows = [];
  let row = [],
    cell = '',
    q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (c !== '\r') cell += c;
  }
  if (cell || row.length) rows.push([...row, cell]);
  const [head, ...rest] = rows;
  return rest.map(r => Object.fromEntries(head.map((h, i) => [h, r[i] || ''])));
}

const isoToKey = new Map(Object.entries(JSON.parse(fs.readFileSync(path.join(root, 'src/data/country_iso.json'), 'utf8'))).map(([k, v]) => [v, k]));
// города встроенного справочника: «название|широта|долгота|страна|население…»
const cities = JSON.parse(fs.readFileSync(path.join(root, 'src/data/world_cities.json'), 'utf8'))
  .split('\n')
  .map(l => l.split('|'))
  .filter(p => p.length >= 4)
  .map(p => ({ name: p[0], lat: +p[1], lng: +p[2], country: p[3], pop: +p[4] || 0 }));
// город, который обслуживает аэропорт: не ближайший посёлок, а крупный город
// рядом — у Шереметьева это Москва, а не Лобня. Вес: население / (расстояние + 10 км)²
const nearestCity = (lat, lng, countryKey) => {
  let best = null,
    bestScore = 0;
  for (const c of cities) {
    if (countryKey && c.country !== countryKey) continue;
    if (Math.abs(c.lat - lat) > 1 || Math.abs(c.lng - lng) > 2) continue;
    const d = haversine([lat, lng], [c.lat, c.lng]);
    if (d > 60) continue;
    const score = Math.max(c.pop, 1) / (d + 10) ** 2;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
};
// русское название города из ключевых слов: кириллица, не код ИКАО (УХХД) и не «Аэропорт …»
const ruKeyword = kw =>
  kw
    .split(',')
    .map(s => s.trim())
    .find(s => /^[А-ЯЁ][а-яё]+([ -][А-ЯЁа-яё][а-яё]+)*$/.test(s) && !/аэропорт/i.test(s)) || null;

const rows = parseCsv(fs.readFileSync(csvFile, 'utf8'));
const out = [];
let ru = 0,
  noKey = 0;
for (const r of rows) {
  if (!/^[A-Z]{3}$/.test(r.iata_code) || r.scheduled_service !== 'yes') continue;
  if (!['large_airport', 'medium_airport', 'small_airport'].includes(r.type)) continue;
  const lat = +r.latitude_deg,
    lng = +r.longitude_deg;
  if (!isFinite(lat) || !isFinite(lng)) continue;
  const key = isoToKey.get(r.iso_country) || '';
  if (!key) noKey++;
  const near = nearestCity(lat, lng, key);
  const city = (near && near.name) || ruKeyword(r.keywords) || r.municipality || '';
  if (/[А-ЯЁа-яё]/.test(city)) ru++;
  const clean = s => s.replace(/\|/g, ' ').trim();
  out.push([r.iata_code, lat.toFixed(3), lng.toFixed(3), key, clean(city), clean(r.name), r.type[0].toUpperCase()].join('|'));
}
out.sort();
fs.writeFileSync(path.join(root, 'data/airports.txt'), out.join('\n') + '\n');
console.log(`Аэропортов: ${out.length}, город по-русски: ${ru}, без страны на карте: ${noKey}`);
