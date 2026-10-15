// ---------- GPX ----------
function parseGPX(text){
  const xml = new DOMParser().parseFromString(text, 'application/xml');
  // Точки собираем по сегментам (trkseg): часы делят трек при паузе, а
  // объединённые файлы многодневных походов состоят из нескольких сегментов.
  // Раньше всё склеивалось в одну цепочку, и разрыв между концом одного
  // сегмента и началом следующего засчитывался в километраж и набор высоты.
  let groups = Array.from(xml.querySelectorAll('trkseg'))
    .map(seg => Array.from(seg.querySelectorAll('trkpt')))
    .filter(g => g.length);
  if(groups.length === 0){
    const loose = Array.from(xml.querySelectorAll('trkpt'));
    if(loose.length) groups = [loose];
  }
  if(groups.length === 0){
    groups = Array.from(xml.querySelectorAll('rte'))
      .map(r => Array.from(r.querySelectorAll('rtept')))
      .filter(g => g.length);
  }
  const coords = [];
  const elevations = [];
  const times = [];
  const segments = [];
  groups.forEach(pts=>{
    const seg = { coords: [], elevations: [] };
    pts.forEach(p=>{
      const lat = parseFloat(p.getAttribute('lat'));
      const lon = parseFloat(p.getAttribute('lon'));
      if(isNaN(lat) || isNaN(lon)) return;
      const eleEl = p.querySelector('ele');
      const ele = eleEl ? parseFloat(eleEl.textContent) : NaN;
      const timeEl = p.querySelector('time');
      const t = timeEl ? Date.parse(timeEl.textContent) : NaN;
      const c = !isNaN(ele) ? [lat, lon, ele] : [lat, lon];
      coords.push(c); seg.coords.push(c);
      if(!isNaN(ele)){ elevations.push(ele); seg.elevations.push(ele); }
      if(!isNaN(t)) times.push(t);
    });
    if(seg.coords.length) segments.push(seg);
  });
  return { coords, elevations, times, segments };
}
function gpxElevationGain(parsed){
  const withEle = parsed.segments.filter(seg => seg.elevations.length > 1);
  if(withEle.length === 0) return null;
  return withEle.reduce((s, seg) => s + elevationGainOf(seg.elevations), 0);
}




function countDistinctDays(times){
  if(!times || times.length === 0) return { days: 1, hasTimeData: false };
  const daySet = new Set();
  times.forEach(t=>{
    const d = new Date(t);
    if(!isNaN(d.getTime())) daySet.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
  });
  return { days: daySet.size || 1, hasTimeData: daySet.size > 0 };
}



// Трек из нескольких кусков (пауза часов, объединённый многодневный поход):
// segBreaks — индексы точек, с которых начинается новый кусок. Без них между
// кусками рисовалась бы прямая перемычка.
function entryBreaks(entry){
  const n = getEntryCoords(entry).length;
  return Array.isArray(entry.segBreaks) ? entry.segBreaks.filter(i => Number.isInteger(i) && i > 0 && i < n).sort((a,b) => a-b) : [];
}
function entrySegments(entry){
  const c = getEntryCoords(entry);
  const br = entryBreaks(entry);
  if(!br.length) return [c];
  const out = [];
  let from = 0;
  br.forEach(b => { if(b - from >= 1) out.push(c.slice(from, b)); from = b; });
  out.push(c.slice(from));
  return out.filter(seg => seg.length >= 2);
}
// для L.polyline: один массив точек или массив кусков
function entryDrawCoords(entry){
  const segs = entrySegments(entry);
  return segs.length > 1 ? segs : getEntryCoords(entry);
}
const entryGeomKey = entry => entry.coordsEncoded ? entry.coordsEncoded + '|' + entryBreaks(entry).join(',') : null;
// Высота в GPX шумит на ±2-3 метра даже на ровной дороге, а набор считается
// суммой всех подъёмов подряд — шум накапливается и завышает цифру в разы
// (на смоделированном треке с настоящими 300 м выходило 2000 м, а на совершенно
// ровном участке — 1400 м из ниоткуда).
// Двухступенчатая фильтрация: сглаживаем профиль скользящим средним, затем
// засчитываем только подъёмы от 5 метров. Параметры подобраны замерами:
// на подъёме 300 м даёт 300, на ровном участке 0, на пилообразном трейле
// 264 из настоящих 279.
const ELEV_SMOOTH_WINDOW = 9;
const ELEV_MIN_RISE = 5;

function smoothElevations(elevations, window){
  const w = window || ELEV_SMOOTH_WINDOW;
  if(elevations.length < w) return elevations.slice();
  const half = Math.floor(w / 2);
  const out = new Array(elevations.length);
  for(let i = 0; i < elevations.length; i++){
    const a = Math.max(0, i - half);
    const b = Math.min(elevations.length, i + half + 1);
    let sum = 0;
    for(let j = a; j < b; j++) sum += elevations[j];
    out[i] = sum / (b - a);
  }
  return out;
}

function elevationGainOf(elevations){
  if(!elevations || elevations.length < 2) return 0;
  const el = smoothElevations(elevations);
  let gain = 0;
  let ref = el[0];
  for(let i = 1; i < el.length; i++){
    const e = el[i];
    if(e - ref >= ELEV_MIN_RISE){ gain += e - ref; ref = e; }
    else if(e < ref){ ref = e; }
  }
  return gain;
}

