// Геометрия и треки: расстояния, точка в многоугольнике, сжатие треков
// (encoded polyline), прореживание, площади и точка для подписи.
// Чистые функции без состояния приложения — их проверяют модульные тесты unit/geo.test.js.

export function haversine(a,b){
  const R = 6371;
  const dLat = (b[0]-a[0]) * Math.PI/180;
  const dLon = (b[1]-a[1]) * Math.PI/180;
  const lat1 = a[0]*Math.PI/180, lat2 = b[0]*Math.PI/180;
  const h = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1-h));
}

// Точка в многоугольнике — определение страны и региона по координатам
export function pointInRing(pt, ring){
  const x = pt[1], y = pt[0]; // lng, lat
  let inside = false;
  for(let i=0, j=ring.length-1; i<ring.length; j=i++){
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi>y) !== (yj>y)) && (x < (xj-xi)*(y-yi)/(yj-yi)+xi);
    if(intersect) inside = !inside;
  }
  return inside;
}

export function pointInGeometry(pt, geometry){
  if(geometry.type === 'Polygon') return pointInPolygonCoords(pt, geometry.coordinates);
  if(geometry.type === 'MultiPolygon') return geometry.coordinates.some(poly => pointInPolygonCoords(pt, poly));
  return false;
}

export function trackDistanceKm(coords){
  let d = 0;
  for(let i=1;i<coords.length;i++) d += haversine(coords[i-1], coords[i]);
  return d;
}

// Encoded polyline (алгоритм Google) — компактное хранение треков
export function encodePolyline(coords, precision=5){
  const factor = Math.pow(10, precision);
  let output = '';
  let prevLat = 0, prevLng = 0;
  coords.forEach(c=>{
    const lat = Math.round(c[0] * factor);
    const lng = Math.round(c[1] * factor);
    output += encodeSignedNumber(lat - prevLat) + encodeSignedNumber(lng - prevLng);
    prevLat = lat; prevLng = lng;
  });
  return output;
}

export function decodePolyline(str, precision=5){
  const factor = Math.pow(10, precision);
  let index = 0, lat = 0, lng = 0;
  const coordinates = [];
  const len = str.length;
  while(index < len){
    let shift = 0, result = 0, b;
    do{ b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while(b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);

    shift = 0; result = 0;
    do{ b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while(b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);

    coordinates.push([lat/factor, lng/factor]);
  }
  return coordinates;
}

export function getEntryCoords(entry){
  if(entry.coordsEncoded){
    const cached = decodedCoordsCache.get(entry.id);
    if(cached && cached.enc === entry.coordsEncoded) return cached.decoded;
    const decoded = decodePolyline(entry.coordsEncoded);
    decodedCoordsCache.set(entry.id, { enc: entry.coordsEncoded, decoded });
    return decoded;
  }
  return entry.coords || []; // legacy entries saved before compression was introduced
}

export function downsample(coords, max=800){
  if(coords.length <= max) return coords;
  const step = coords.length / max;
  const out = [];
  for(let i=0;i<max;i++) out.push(coords[Math.floor(i*step)]);
  out.push(coords[coords.length-1]);
  return out;
}

export function downsampleNumeric(arr, max=40){
  if(arr.length <= max) return arr;
  const step = arr.length / max;
  const out = [];
  for(let i=0;i<max;i++) out.push(arr[Math.floor(i*step)]);
  out.push(arr[arr.length-1]);
  return out;
}

// прореживание по кускам: каждый получает долю точек по своей длине
export function downsampleSegments(segments, max){
  const total = segments.reduce((s, g) => s + g.length, 0);
  const coords = [], breaks = [];
  segments.forEach((g, i) => {
    const share = Math.max(2, Math.round((max || 800) * g.length / total));
    if(i > 0) breaks.push(coords.length);
    downsample(g, share).forEach(c => coords.push(c));
  });
  return { coords, breaks };
}

// Километраж и набор высоты — сумма по сегментам, без «прыжков» между ними
export function gpxDistanceKm(parsed){
  return parsed.segments.reduce((s, seg) => s + trackDistanceKm(seg.coords), 0);
}

export function geomAreaKm2(g){
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  let a = 0;
  polys.forEach(p => { const r = p[0]; let sum = 0, lat = 0;
    for(let i = 0; i < r.length - 1; i++){ sum += r[i][0] * r[i+1][1] - r[i+1][0] * r[i][1]; lat += r[i][1]; }
    a += Math.abs(sum) / 2 * 111 * 111 * Math.cos((lat / Math.max(1, r.length - 1)) * Math.PI / 180); });
  return a;
}

// Точка для подписи — «полюс недоступности» самого большого контура (polylabel):
// самая удалённая от краёв точка, так подпись не липнет к границе у вытянутых
// стран вроде Чили или Норвегии. Долготу сжимаем по широте, чтобы считать в км.
export function polyLabelPoint(ring, precision){
  const k = Math.cos(ring.reduce((m, c) => m + c[1], 0) / ring.length * Math.PI / 180) || 1;
  const pts = ring.map(c => [c[0] * k, c[1]]);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  pts.forEach(([x, y]) => { if(x < x0) x0 = x; if(y < y0) y0 = y; if(x > x1) x1 = x; if(y > y1) y1 = y; });
  const dist = (x, y) => { // со знаком: >0 внутри
    let inside = false, d2 = Infinity;
    for(let i = 0, j = pts.length - 1; i < pts.length; j = i++){
      const [ax, ay] = pts[i], [bx, by] = pts[j];
      if((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
      let dx = bx - ax, dy = by - ay, t = 0;
      if(dx || dy){ t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy))); }
      const ex = ax + t * dx - x, ey = ay + t * dy - y;
      d2 = Math.min(d2, ex * ex + ey * ey);
    }
    return (inside ? 1 : -1) * Math.sqrt(d2);
  };
  const cell = (x, y, h) => { const d = dist(x, y); return { x, y, h, d, max: d + h * Math.SQRT2 }; };
  const size = Math.min(x1 - x0, y1 - y0);
  if(!size) return [ring[0][1], ring[0][0]];
  let h = size / 2;
  const q = [];
  for(let x = x0; x < x1; x += size) for(let y = y0; y < y1; y += size) q.push(cell(x + h, y + h, h));
  let best = cell((x0 + x1) / 2, (y0 + y1) / 2, 0);
  const prec = precision || Math.max(size / 60, 0.01);
  let guard = 0;
  while(q.length && guard++ < 4000){
    q.sort((a, b) => a.max - b.max);
    const c = q.pop();
    if(c.d > best.d) best = c;
    if(c.max - best.d <= prec) continue;
    const hh = c.h / 2;
    q.push(cell(c.x - hh, c.y - hh, hh), cell(c.x + hh, c.y - hh, hh), cell(c.x - hh, c.y + hh, hh), cell(c.x + hh, c.y + hh, hh));
  }
  return [best.y, best.x / k];
}

export function mainRing(g){
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  // самый большой по площади контур (у России, Канады, Индонезии — материк/крупнейший остров)
  let best = polys[0][0], bestA = -1;
  polys.forEach(p => { const r = p[0]; let a = 0; for(let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i+1][1] - r[i+1][0] * r[i][1]; a = Math.abs(a); if(a > bestA){ bestA = a; best = r; } });
  return best;
}
export function pointInPolygonCoords(pt, polygonCoords){
  if(!pointInRing(pt, polygonCoords[0])) return false;
  for(let i=1;i<polygonCoords.length;i++){
    if(pointInRing(pt, polygonCoords[i])) return false;
  }
  return true;
}

export function encodeSignedNumber(num){
  let sgn = num << 1;
  if(num < 0) sgn = ~sgn;
  return encodeUnsignedNumber(sgn);
}

// entry.id -> { enc, decoded }. Вместе с треком храним строку, из которой он
// декодирован: если трек у записи сменился (замена точки маршрута, импорт с
// заменой), кэш сам видит расхождение — раньше на карте оставалась старая линия.
export const decodedCoordsCache = new Map();
export function encodeUnsignedNumber(num){
  let output = '';
  while(num >= 0x20){
    output += String.fromCharCode((0x20 | (num & 0x1f)) + 63);
    num >>= 5;
  }
  output += String.fromCharCode(num + 63);
  return output;
}

// Ближайшая к точке позиция на треке. Остановки маршрута часто геокодированы в
// центр города или даже района (у муниципалитетов ЮАР — центр округа), и точка
// висела в стороне от линии. Для отображения её «прижимаем» к треку — туда, где
// дорога действительно проходила ближе всего. Считаем в плоском приближении
// вокруг точки (км), этого с запасом хватает на десятках километров.
// pt — [lat, lng], segments — массив кусков трека [[lat, lng], …].
// → { latlng: [lat, lng], km } или null, если трек дальше maxKm.
export function snapToTrack(pt, segments, maxKm = Infinity){
  const kx = 111.32 * Math.cos(pt[0] * Math.PI / 180), ky = 110.57;
  let best = null, bestD2 = Infinity;
  for(const seg of segments){
    if(!seg || !seg.length) continue;
    let px = (seg[0][1] - pt[1]) * kx, py = (seg[0][0] - pt[0]) * ky;
    if(seg.length === 1 && px * px + py * py < bestD2){ bestD2 = px * px + py * py; best = [px, py]; }
    for(let i = 1; i < seg.length; i++){
      const qx = (seg[i][1] - pt[1]) * kx, qy = (seg[i][0] - pt[0]) * ky;
      const dx = qx - px, dy = qy - py, len2 = dx * dx + dy * dy;
      // проекция начала координат (самой точки) на отрезок p→q
      const t = len2 ? Math.max(0, Math.min(1, -(px * dx + py * dy) / len2)) : 0;
      const x = px + t * dx, y = py + t * dy, d2 = x * x + y * y;
      if(d2 < bestD2){ bestD2 = d2; best = [x, y]; }
      px = qx; py = qy;
    }
  }
  if(!best) return null;
  const km = Math.sqrt(bestD2);
  if(km > maxKm) return null;
  return { latlng: [pt[0] + best[1] / ky, pt[1] + best[0] / kx], km };
}

// Упрощение линии (Дуглас — Пекер) в градусах: точки, отклоняющиеся от хорды
// меньше чем на tol, выбрасываются. Нужен глобусу: во время вращения шар
// рисуется по облегчённым контурам, а подробные возвращаются в покое.
// Концы сохраняются — замкнутое кольцо остаётся замкнутым.
export function simplifyLine(pts, tol){
  if(!pts || pts.length < 3 || !(tol > 0)) return pts ? pts.slice() : [];
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  const t2 = tol * tol;
  while(stack.length){
    const [a, b] = stack.pop();
    const ax = pts[a][0], ay = pts[a][1], dx = pts[b][0] - ax, dy = pts[b][1] - ay;
    const len2 = dx * dx + dy * dy;
    let best = -1, bestD = t2;
    for(let i = a + 1; i < b; i++){
      let px = pts[i][0] - ax, py = pts[i][1] - ay;
      if(len2){ const t = Math.max(0, Math.min(1, (px * dx + py * dy) / len2)); px -= t * dx; py -= t * dy; }
      const d2 = px * px + py * py;
      if(d2 > bestD){ bestD = d2; best = i; }
    }
    if(best > 0){ keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
