// Компактная запись контуров (страны, регионы России) для встраивания в
// приложение: вместо GeoJSON с координатами вида 61.211 — целые числа и
// разности соседних точек. Без потерь: точность подбирается для каждого
// контура (тысячные градуса, у микрогосударств — десятитысячные), и при сборке
// (vite.config.mjs) проверяется, что распакованное совпадает с исходным до бита.
// Строка: контуры через перевод строки; у контура тип (P — Polygon,
// M — MultiPolygon, пусто — нет геометрии) и цифра d (множитель 10^d),
// многоугольники через «;», кольца через «|», числа через «,».
// unit/geo-pack.test.js.

const ringStr = (r, k) => {
  let px = 0, py = 0;
  const out = [];
  for(const [x, y] of r){
    const X = Math.round(x * k), Y = Math.round(y * k);
    out.push(X - px, Y - py);
    px = X; py = Y;
  }
  return out.join(',');
};
function geomStr(g, d){
  if(!g) return '';
  const k = 10 ** d, polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  return (g.type === 'Polygon' ? 'P' : 'M') + d + polys.map(p => p.map(r => ringStr(r, k)).join('|')).join(';');
}
function geomFrom(line){
  if(!line) return null;
  const k = 10 ** +line[1];
  const polys = line.slice(2).split(';').map(p => p.split('|').map(r => {
    const n = r.split(','), ring = new Array(n.length / 2);
    let x = 0, y = 0;
    for(let j = 0; j < n.length; j += 2){ x += +n[j]; y += +n[j + 1]; ring[j / 2] = [x / k, y / k]; }
    return ring;
  }));
  return line[0] === 'P' ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys };
}

// { props, geom }: свойства — как есть, геометрия — строкой с одной точностью d для всех
export function packGeo(fc, d = 3){
  return { props: fc.features.map(f => f.properties), geom: fc.features.map(f => geomStr(f.geometry, d)).join('\n') };
}

export function unpackGeo(props, geom){
  return { type: 'FeatureCollection', features: geom.split('\n').map((line, i) => ({ type: 'Feature', properties: props[i], geometry: geomFrom(line) })) };
}

// Точность — наименьшая, при которой контур записывается без потерь; null —
// если какой-то контур не записать и с миллионными (тогда встраиваем как есть)
export function packGeoExact(fc){
  const lines = [];
  for(const f of fc.features){
    const want = JSON.stringify(f.geometry);
    let ok = null;
    for(const d of [3, 4, 5, 6]){
      const s = geomStr(f.geometry, d);
      if(JSON.stringify(geomFrom(s)) === want){ ok = s; break; }
    }
    if(ok === null) return null;
    lines.push(ok);
  }
  return { props: fc.features.map(f => f.properties), geom: lines.join('\n') };
}
