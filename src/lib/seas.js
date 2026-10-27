// На каком море (заливе, проливе) стоит точка: контуры водоёмов из
// src/data/sea_shapes.txt (scripts/build-seas.mjs) и расстояние до ближайшего
// из них. Модульные тесты — unit/seas.test.js.

// Строка «номер;кольцо;кольцо…»: кольцо — целые в сотых градуса, первая пара
// абсолютная, дальше разности. Первое кольцо — водоём, остальные — острова в нём.
export function parseSeaShapes(text){
  const out = [];
  for(const line of text.split('\n')){
    if(!line) continue;
    const parts = line.split(';'), i = +parts[0];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const rings = parts.slice(1).map(s => {
      const n = s.split(',').map(Number), r = new Float64Array(n.length);
      let x = 0, y = 0;
      for(let k = 0; k < n.length; k += 2){
        x += n[k]; y += n[k + 1];
        r[k] = x / 100; r[k + 1] = y / 100;
      }
      return r;
    });
    const outer = rings[0];
    for(let k = 0; k < outer.length; k += 2){
      if(outer[k] < x0) x0 = outer[k]; if(outer[k] > x1) x1 = outer[k];
      if(outer[k + 1] < y0) y0 = outer[k + 1]; if(outer[k + 1] > y1) y1 = outer[k + 1];
    }
    out.push({ i, rings, bbox: [x0, y0, x1, y1] });
  }
  return out;
}

function inRing(r, x, y){
  let ins = false;
  for(let a = 0, b = r.length - 2; a < r.length; b = a, a += 2){
    const ax = r[a], ay = r[a + 1], bx = r[b], by = r[b + 1];
    if((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) ins = !ins;
  }
  return ins;
}
// расстояние (км) от точки до границы кольца — в местной равнопромежуточной проекции
function ringDistKm(r, x, y, kx){
  let d2 = Infinity;
  for(let a = 0, b = r.length - 2; a < r.length; b = a, a += 2){
    const ax = (r[a] - x) * kx, ay = r[a + 1] - y, bx = (r[b] - x) * kx, by = r[b + 1] - y;
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L)) : 0;
    const ex = ax + t * dx, ey = ay + t * dy, e = ex * ex + ey * ey;
    if(e < d2) d2 = e;
  }
  return Math.sqrt(d2) * 111.2;
}

// Ближайший водоём не дальше maxKm: { i — номер строки в seas.json, km }.
// Точка в воде — расстояние 0; на берегу или острове — до линии берега.
export function seaNear(shapes, lat, lng, maxKm = 15){
  if(!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const x = ((lng + 180) % 360 + 360) % 360 - 180, y = lat;
  const kx = Math.max(0.05, Math.cos(y * Math.PI / 180));
  const dy = maxKm / 111.2, dx = dy / kx;
  let best = null;
  for(const s of shapes){
    const b = s.bbox;
    if(x < b[0] - dx || x > b[2] + dx || y < b[1] - dy || y > b[3] + dy) continue;
    if(x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3] && inRing(s.rings[0], x, y) && !s.rings.slice(1).some(h => inRing(h, x, y))) return { i: s.i, km: 0 };
    for(const r of s.rings){
      const d = ringDistKm(r, x, y, kx);
      if(d <= maxKm && (!best || d < best.km)) best = { i: s.i, km: d };
    }
  }
  return best;
}

// Единица учёта — море или океан: залив, пролив, бухта засчитываются своему
// морю (по цепочке родителей), часть Средиземного моря — сама по себе и вместе
// со Средиземным. Строка seas.json: [название, вид, …, родитель, океан].
export function seaUnits(rows, i){
  const P = 13;
  let u = i;
  for(let k = 0; k < 8 && rows[u] && rows[u][1] === 'gulf' && rows[u][P] >= 0; k++) u = rows[u][P];
  if(!rows[u]) return [];
  // море внутри моря: Критское → Эгейское → Средиземное
  const out = [rows[u][0]];
  for(let k = 0; k < 4 && rows[u][1] !== 'gulf' && rows[u][P] >= 0; k++){ u = rows[u][P]; out.push(rows[u][0]); }
  return out;
}
// к какому океану относится (по названию), null — внутреннее (Каспий)
export function seaBasin(rows, i){
  const b = rows[i] && rows[i][14];
  return b >= 0 ? rows[b][0] : null;
}
