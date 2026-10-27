// Сборка src/data/seas.json — подписей океанов, морей, заливов и проливов для
// контурной карты и глобуса. Запускается вручную:
//   node scripts/build-seas.mjs <ne_10m_geography_marine_polys.geojson>
// Источник — Natural Earth (общественное достояние): github.com/nvkelso/natural-earth-vector,
// geojson/ne_10m_geography_marine_polys.geojson. Сами контуры в приложение не
// попадают — только то, что нужно для подписи:
//   [название, вид, с какого масштаба, центр, концы главной оси, концы поперечной]
// Ось — самая длинная хорда через «полюс недоступности» водоёма (в проекции
// Меркатора): вдоль неё подпись поворачивается у вытянутых морей (Красное,
// Адриатическое) и по её длине решается, помещается ли подпись при данном масштабе.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = process.argv[2];
if(!src){ console.error('usage: build-seas.mjs ne_10m_geography_marine_polys.geojson'); process.exit(1); }
const feats = JSON.parse(fs.readFileSync(src, 'utf8')).features;

// русские названия: в Natural Earth часть из них — голое имя без «залив»/«пролив»
// или устаревший вариант; здесь — как в современных атласах
const RU = {
  'Celebes Sea': 'море Сулавеси', 'Bahía de Campeche': 'залив Кампече', 'James Bay': 'залив Джеймс',
  'Gulf of Carpentaria': 'залив Карпентария', 'Bay of Plenty': 'залив Пленти', 'Bismarck Sea': 'море Бисмарка',
  'Gulf of Tonkin': 'Тонкинский залив', 'Bay of Fundy': 'залив Фанди', 'Melville Bay': 'залив Мелвилл',
  'Gulf of Maine': 'залив Мэн', 'Golfo San Jorge': 'залив Сан-Хорхе', 'Ungava Bay': 'залив Унгава',
  "M'Clure Strait": 'пролив Мак-Клур', 'Bransfield Strait': 'пролив Брансфилд', 'McMurdo Sound': 'пролив Мак-Мердо',
  'Cumberland Sound': 'залив Камберленд', 'Gulf of Boothia': 'залив Бутия', 'Foxe Basin': 'бассейн Фокс',
  'Marguerite Bay': 'залив Маргерит', 'Dixon Entrance': 'пролив Диксон-Энтранс', 'Boca Grande': 'пролив Бока-Гранде',
  'Golfo San Matías': 'залив Сан-Матиас', 'Golfo Corcovado': 'залив Корковадо', 'Frobisher Bay': 'залив Фробишер',
  'Disko Bay': 'залив Диско', 'Uchiura Bay': 'залив Утиура', 'Shark Bay': 'залив Шарк', 'Gulf of Gabès': 'залив Габес',
  'Mackenzie Bay': 'залив Маккензи', 'Norton Sound': 'залив Нортон', 'Kotzebue Sound': 'залив Коцебу',
  'Golfo de Tehuantepec': 'залив Теуантепек', 'Golfo de Guayaquil': 'залив Гуаякиль', 'Gulf of Papua': 'залив Папуа',
  'Gulf of Sidra': 'залив Сидра', 'Bight of Benin': 'Бенинский залив', 'Bight of Biafra': 'залив Биафра',
  'Bahía Blanca': 'залив Баия-Бланка', 'Golfo de Penas': 'залив Пеньяс', 'Bahía Grande': 'залив Баия-Гранде',
  'Hangzhou Bay': 'залив Ханчжоувань', 'Gulf St. Vincent': 'залив Сент-Винсент', 'Baia de Maputo': 'залив Мапуту',
  'Joseph Bonaparte Gulf': 'залив Жозеф-Бонапарт', 'Gulf of Martaban': 'Мартабанский залив', 'Kangertittivaq': 'залив Скорсби-Сунн',
  'Jones Sound': 'пролив Джонс', 'Lago de Maracaibo': 'озеро Маракайбо', 'Garabogaz Bay': 'залив Кара-Богаз-Гол',
  'Baía de São Marcos': 'залив Сан-Маркус', 'Qiongzhou Strait': 'Хайнаньский пролив', 'Strait of Belle Isle': 'пролив Белл-Айл',
  'Antongila Bay': 'залив Антунгила', 'Golfo de Urabá': 'залив Ураба', 'Gulf of Aqaba': 'залив Акаба',
  'Massachusetts Bay': 'залив Массачусетс', 'Long Island Sound': 'пролив Лонг-Айленд', 'Albemarle Sound': 'залив Албемарл',
  'Pamlico Sound': 'залив Памлико', 'Fury and Hecla Strait': 'пролив Фьюри-энд-Хекла', 'Lagoa dos Patos': 'лагуна Патус',
  'Bali Sea': 'море Бали', 'Davao Gulf': 'залив Давао', 'Sibuyan Sea': 'море Сибуян', 'Bohol Sea': 'море Минданао',
  'Hecate Strait': 'пролив Хекате', 'San Francisco Bay': 'залив Сан-Франциско', 'Monterey Bay': 'залив Монтерей',
  'Stettiner Haff': 'Щецинский залив', 'Selat Dampier': 'пролив Дампир', 'Surigao Strait': 'пролив Суригао',
  'Leyte Gulf': 'залив Лейте', 'Prince William Sound': 'залив Принс-Уильям', 'Viscount Melville Sound': 'пролив Вайкаунт-Мелвилл',
  'Vestfjorden': 'Вест-фьорд', 'Karskiye Strait': 'пролив Карские Ворота', 'Matochkin Shar Strait': 'пролив Маточкин Шар',
  'Guba Gusinaya': 'Гусиная губа', 'Kane Basin': 'бассейн Кейна', 'Hall Basin': 'бассейн Холла', 'Geographe Bay': 'залив Джиографи',
  'Bristol Channel': 'Бристольский залив', 'Bristol Bay': 'Бристольский залив', 'Gulf of Thailand': 'Сиамский залив',
  'Sea of Japan': 'Японское море', 'Inner Sea': 'Внутреннее Японское море', 'Inner Seas': 'Гебридское море',
  'Waddenzee': 'Ваттовое море', 'Samar Sea': 'море Самар', 'Visayan Sea': 'море Висаян', 'Tayabas Bay': 'залив Таябас',
  'Cordova Bay': 'залив Кордова', 'Selat Bali': 'Балийский пролив', 'Gulf of Masira': 'залив Масира',
  'Wager Bay': 'залив Уэйджер', 'Sherman Basin': 'залив Шерман', 'Seno de Skyring': 'залив Скайринг', 'Seno Otway': 'залив Отуэй',
  'Bay Inútil': 'залив Инутиль', 'Kaliningrad': 'Куршский залив', 'Ozero Mogotoyevo': null,
  // реки, озёра и рифы — не морские подписи
  'Husky Lakes': null, 'Lake Pontchartrain': null, "Bras d'Or Lake": null, 'Saint Lawrence River': null,
  'Eclipse Sound': null, 'Canal do Sul': null, 'Canal Perigoso': null, 'Canal do Norte': null
};
const SKIP_CLASS = new Set(['river', 'reef', 'generic']);
const GENERIC = /^(Море|Залив|Пролив|Бассейн|Канал|Озеро|Губа|Бухта|Лагуна)\s/;

// вид — для оформления: океан, море (и крупные заливы), прочее
const kindOf = p => p.featurecla === 'ocean' ? 'ocean' : p.featurecla === 'sea' || p.min_label <= 2 ? 'sea' : 'gulf';
// с какого масштаба карты показывать — по min_label из Natural Earth
// несколько близких нам морей и заливов в Natural Earth появляются позже, чем в атласах
const MINZ = { 'Sea of Azov': 4, 'White Sea': 4, 'East Siberian Sea': 4, 'Aegean Sea': 5, 'Ionian Sea': 5, 'Gulf of Finland': 5,
  'Gulf of Riga': 5, 'Sea of Marmara': 5, 'Ligurian Sea': 5, 'Balearic Sea': 5 };
const minZoomOf = p => MINZ[p.name] || (p.featurecla === 'ocean' ? 2 : p.min_label <= 2 ? 3 : p.min_label <= 4 ? 4 : p.min_label <= 5 ? 5 : p.min_label <= 6 ? 6 : 7);

const R = Math.PI / 180;
const merc = lat => Math.log(Math.tan(Math.PI / 4 + Math.max(-84, Math.min(84, lat)) * R / 2)) / R;
const unmerc = y => (2 * Math.atan(Math.exp(y * R)) - Math.PI / 2) / R;

function rings(g){ return (g.type === 'Polygon' ? [g.coordinates] : g.coordinates); }
function ringArea(r){ let a = 0; for(let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return Math.abs(a / 2); }

// полигон (внешний контур + дыры-острова) в координатах Меркатора; через 180° — сдвиг
function toPlanar(poly){
  let lo = Infinity, hi = -Infinity;
  poly[0].forEach(c => { lo = Math.min(lo, c[0]); hi = Math.max(hi, c[0]); });
  const wrap = hi - lo > 300;
  return poly.map(r => r.map(([x, y]) => [wrap && x < 0 ? x + 360 : x, merc(y)]));
}
function inside(poly, x, y){
  let ins = false;
  for(const r of poly){
    for(let i = 0, j = r.length - 1; i < r.length; j = i++){
      const [ax, ay] = r[i], [bx, by] = r[j];
      if((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) ins = !ins;
    }
  }
  return ins;
}
function edgeDist(poly, x, y){
  let d2 = Infinity;
  for(const r of poly) for(let i = 0, j = r.length - 1; i < r.length; j = i++){
    const [ax, ay] = r[i], [bx, by] = r[j], dx = bx - ax, dy = by - ay;
    const t = dx || dy ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy))) : 0;
    const ex = ax + t * dx - x, ey = ay + t * dy - y; d2 = Math.min(d2, ex * ex + ey * ey);
  }
  return Math.sqrt(d2);
}
// полюс недоступности с учётом островов (polylabel)
function polylabel(poly){
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  poly[0].forEach(([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
  const sd = (x, y) => (inside(poly, x, y) ? 1 : -1) * edgeDist(poly, x, y);
  const cell = (x, y, h) => { const d = sd(x, y); return { x, y, h, d, max: d + h * Math.SQRT2 }; };
  const size = Math.min(x1 - x0, y1 - y0), h = size / 2, q = [];
  for(let x = x0; x < x1; x += size) for(let y = y0; y < y1; y += size) q.push(cell(x + h, y + h, h));
  let best = cell((x0 + x1) / 2, (y0 + y1) / 2, 0);
  const prec = Math.max(size / 200, 0.005);
  let guard = 0;
  while(q.length && guard++ < 20000){
    q.sort((a, b) => a.max - b.max);
    const c = q.pop();
    if(c.d > best.d) best = c;
    if(c.max - best.d <= prec) continue;
    const hh = c.h / 2;
    q.push(cell(c.x - hh, c.y - hh, hh), cell(c.x + hh, c.y - hh, hh), cell(c.x - hh, c.y + hh, hh), cell(c.x + hh, c.y + hh, hh));
  }
  return best;
}
// хорда через (x,y) в направлении a: идём в обе стороны, пока в воде
function chord(poly, x, y, a, step, maxLen){
  const dx = Math.cos(a), dy = Math.sin(a);
  const walk = s => { let t = 0; while(t < maxLen && inside(poly, x + s * (t + step) * dx, y + s * (t + step) * dy)) t += step; return t; };
  const f = walk(1), b = walk(-1);
  return { f, b, len: f + b };
}

const out = [];
for(const f of feats){
  const p = f.properties;
  if(SKIP_CLASS.has(p.featurecla) || !p.name) continue;
  let ru = p.name in RU ? RU[p.name] : p.name_ru;
  if(!ru) continue;
  ru = ru.normalize('NFC').replace(/́/g, '').replace(GENERIC, m => m.toLowerCase());
  // самый большой кусок; острова внутри — дыры, подпись на них не ляжет
  const polys = rings(f.geometry).sort((a, b) => ringArea(b[0]) - ringArea(a[0]));
  const poly = toPlanar(polys[0]);
  const pl = polylabel(poly);
  let x1 = -Infinity, x0 = Infinity, y0 = Infinity, y1 = -Infinity;
  poly[0].forEach(([x, y]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); });
  const maxLen = Math.hypot(x1 - x0, y1 - y0), step = Math.max(pl.d / 8, 0.01);
  // направление: самая длинная хорда (по трём параллельным линиям — чтобы
  // у подписи была «полоса» воды, а не нитка), горизонталь — с запасом
  let best = null;
  for(let deg = -60; deg <= 60; deg += 5){
    const a = deg * R, nx = -Math.sin(a) * pl.d * 0.4, ny = Math.cos(a) * pl.d * 0.4;
    const len = Math.min(chord(poly, pl.x, pl.y, a, step, maxLen).len, chord(poly, pl.x + nx, pl.y + ny, a, step, maxLen).len, chord(poly, pl.x - nx, pl.y - ny, a, step, maxLen).len);
    const score = len * (deg === 0 ? 1.35 : 1 - Math.abs(deg) / 150);
    if(!best || score > best.score) best = { deg, score };
  }
  // океаны — всегда горизонтально, как в атласах
  const a = p.featurecla === 'ocean' ? 0 : best.deg * R;
  const c = chord(poly, pl.x, pl.y, a, step, maxLen);
  const dx = Math.cos(a), dy = Math.sin(a);
  const mx = pl.x + (c.f - c.b) / 2 * dx, my = pl.y + (c.f - c.b) / 2 * dy;
  const A1 = [mx - c.len / 2 * dx, my - c.len / 2 * dy], A2 = [mx + c.len / 2 * dx, my + c.len / 2 * dy];
  const cc = chord(poly, mx, my, a + Math.PI / 2, step, maxLen);
  const nx = -dy, ny = dx, cm = (cc.f - cc.b) / 2;
  const B1 = [mx + (cm - cc.len / 2) * nx, my + (cm - cc.len / 2) * ny], B2 = [mx + (cm + cc.len / 2) * nx, my + (cm + cc.len / 2) * ny];
  const ll = ([x, y]) => [+unmerc(y).toFixed(2), +((x > 180 ? x - 360 : x).toFixed(2))];
  const [lat, lng] = ll([mx, my]);
  out.push({ ru, kind: kindOf(p), minZoom: minZoomOf(p), lat, lng, a1: ll(A1), a2: ll(A2), b1: ll(B1), b2: ll(B2), rank: p.min_label, deg: a / R });
}
out.sort((x, y) => x.rank - y.rank || x.ru.localeCompare(y.ru, 'ru'));
const rows = out.map(o => [o.ru, o.kind, o.minZoom, o.lat, o.lng, ...o.a1, ...o.a2, ...o.b1, ...o.b2]);
const file = path.join(root, 'src/data/seas.json');
fs.writeFileSync(file, '[\n' + rows.map(r => JSON.stringify(r)).join(',\n') + '\n]\n');
console.log(`${rows.length} подписей → ${path.relative(root, file)} (${fs.statSync(file).size} байт)`);
if(process.env.SEAS_DEBUG) out.forEach(o => console.log(o.minZoom, o.kind, o.ru, o.lat, o.lng, 'угол', o.deg));
