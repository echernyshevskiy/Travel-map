// Сборка src/data/unesco.json — компактного списка объектов Всемирного наследия
// ЮНЕСКО для коллекции. Запускается вручную, когда список обновился:
//   node scripts/build-unesco.mjs <sites.geojson> <names_ru.txt> [ещё names_ru.txt…]
// sites.geojson — точки объектов (id, name, category, year, country) по данным
// whc.unesco.org; names_ru.txt — строки «id|русское название» (официальные
// названия с whc.unesco.org/ru/list и переводы недостающих). Страна объекта
// определяется по нашей же карте стран — тем же ключом, что у отметок.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pointInGeometry, haversine } from '../src/lib/geo.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [sitesFile, ...nameFiles] = process.argv.slice(2);
if(!sitesFile || !nameFiles.length){ console.error('usage: build-unesco.mjs sites.geojson names.txt…'); process.exit(1); }

const sites = JSON.parse(fs.readFileSync(sitesFile, 'utf8')).features;
const names = new Map();
nameFiles.forEach(f => fs.readFileSync(f, 'utf8').split('\n').forEach(l => {
  const i = l.indexOf('|');
  if(i > 0) names.set(l.slice(0, i).trim(), l.slice(i + 1).trim());
}));
const countries = JSON.parse(fs.readFileSync(path.join(root, 'src/data/countries.min.json'), 'utf8')).features;

// площадь рамки — чтобы анклав (Ватикан) побеждал окружающую страну
const bboxArea = g => {
  let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
  const walk = x => { if(typeof x[0] === 'number'){ a = Math.min(a, x[0]); b = Math.max(b, x[0]); c = Math.min(c, x[1]); d = Math.max(d, x[1]); } else x.forEach(walk); };
  walk(g.coordinates);
  return (b - a) * (d - c);
};
const areas = new Map(countries.map(f => [f.properties.name, bboxArea(f.geometry)]));
function countryAt(lat, lng){
  let best = null, bestA = Infinity;
  for(const f of countries){
    if(!pointInGeometry([lat, lng], f.geometry)) continue;
    const a = areas.get(f.properties.name);
    if(a < bestA){ bestA = a; best = f.properties.name; }
  }
  if(best) return best;
  // морские объекты и острова, которых нет на упрощённой карте, — ближайшая страна
  let near = null, nd = Infinity;
  for(const f of countries){
    const walk = x => { if(typeof x[0] === 'number'){ const dd = haversine([lat, lng], [x[1], x[0]]); if(dd < nd){ nd = dd; near = f.properties.name; } } else x.forEach(walk); };
    walk(f.geometry.coordinates);
  }
  return nd < 600 ? near : null;
}

// острова, которых нет на упрощённой карте: страна из самого списка ЮНЕСКО
const keys = new Set(countries.map(f => f.properties.name));
const UN_ALIAS = { 'United Kingdom of Great Britain and Nort': 'United Kingdom', 'United Kingdom of Great Britain and Northern Ireland': 'United Kingdom' };
function listedCountry(list){
  const first = String(list || '').split(',')[0].trim();
  const k = UN_ALIAS[first] || first;
  return keys.has(k) ? k : null;
}
const CAT = { cultural: 'c', natural: 'n', mixed: 'm' };
const missing = [];
const out = sites.map(f => {
  const p = f.properties;
  const [lng, lat] = f.geometry.coordinates;
  const name = names.get(String(p.id));
  if(!name) missing.push(p.id + ' ' + p.name);
  const multi = String(p.country || '').includes(',') ? 1 : 0;
  return [+p.id, name || p.name, +lat.toFixed(3), +lng.toFixed(3), CAT[p.category] || 'c', countryAt(lat, lng) || listedCountry(p.country),p.year || null, multi];
}).sort((a, b) => a[0] - b[0]);
if(missing.length){ console.error('нет русского названия:', missing.length, missing.slice(0, 10)); process.exit(1); }

const json = '[\n' + out.map(r => JSON.stringify(r)).join(',\n') + '\n]\n';
fs.writeFileSync(path.join(root, 'src/data/unesco.json'), json);
console.log('объектов:', out.length, 'без страны:', out.filter(r => !r[5]).map(r => r[1]), 'байт:', Buffer.byteLength(json));
