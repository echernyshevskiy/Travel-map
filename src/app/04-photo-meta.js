// ---------- метаданные фотографий ----------
// Читаем EXIF сами, без библиотеки: приложение должно работать офлайн, а нужны
// всего три значения — координаты и дата съёмки. Поддерживаем JPEG, WebP и
// HEIC/HEIF (айфоны, часть Android) — у последнего свой контейнер, см. ниже.
function findExifTiff(buf){
  if(!buf || buf.byteLength < 16) return null;
  const dv = new DataView(buf);
  // JPEG: ищем сегмент APP1 с сигнатурой Exif
  if(dv.getUint16(0) === 0xFFD8){
    let off = 2;
    while(off + 4 <= dv.byteLength){
      if(dv.getUint8(off) !== 0xFF) break;
      const marker = dv.getUint8(off+1);
      if(marker === 0xDA) break; // начались данные изображения
      const size = dv.getUint16(off+2);
      if(size < 2) break;
      if(marker === 0xE1 && off + 10 <= dv.byteLength){
        let sig = '';
        for(let i=0;i<4;i++) sig += String.fromCharCode(dv.getUint8(off+4+i));
        if(sig === 'Exif') return { dv, tiff: off + 10 };
      }
      off += 2 + size;
    }
    return null;
  }
  // WebP: контейнер RIFF, метаданные лежат в чанке EXIF
  if(dv.getUint32(0) === 0x52494646 && dv.byteLength > 12 && dv.getUint32(8) === 0x57454250){
    let off = 12;
    while(off + 8 <= dv.byteLength){
      const id = String.fromCharCode(dv.getUint8(off),dv.getUint8(off+1),dv.getUint8(off+2),dv.getUint8(off+3));
      const size = dv.getUint32(off+4, true);
      if(size < 0 || off + 8 + size > dv.byteLength) break;
      if(id === 'EXIF'){
        let start = off + 8;
        // иногда внутри чанка ещё раз повторяется сигнатура Exif\0\0
        if(dv.getUint8(start) === 0x45 && dv.getUint8(start+1) === 0x78) start += 6;
        return { dv, tiff: start };
      }
      off += 8 + size + (size & 1);
    }
    return null;
  }
  return null;
}

function readPhotoMeta(buf){
  let found;
  try{ found = findExifTiff(buf); }catch(e){ return null; }
  if(!found) return null;
  return readTiffMeta(found.dv, found.tiff);
}
function readTiffMeta(dv, tiff){
  try{
    if(tiff + 8 > dv.byteLength) return null;
    const le = dv.getUint16(tiff) === 0x4949;
    const u16 = o => dv.getUint16(o, le);
    const u32 = o => dv.getUint32(o, le);
    const rational = o => { const n = u32(o), d = u32(o+4); return d ? n/d : 0; };
    const ifd0 = tiff + u32(tiff + 4);
    if(ifd0 + 2 > dv.byteLength) return null;
    let gpsOff = 0, exifOff = 0;
    const n0 = u16(ifd0);
    for(let i=0;i<n0;i++){
      const e = ifd0 + 2 + i*12;
      if(e + 12 > dv.byteLength) break;
      const tag = u16(e);
      if(tag === 0x8825) gpsOff = tiff + u32(e+8);
      if(tag === 0x8769) exifOff = tiff + u32(e+8);
    }
    const out = { lat: null, lng: null, date: null };
    if(gpsOff && gpsOff + 2 <= dv.byteLength){
      let lat = null, lng = null, latRef = 'N', lngRef = 'E';
      const n = u16(gpsOff);
      for(let i=0;i<n;i++){
        const e = gpsOff + 2 + i*12;
        if(e + 12 > dv.byteLength) break;
        const tag = u16(e), cnt = u32(e+4);
        if(tag === 1) latRef = String.fromCharCode(dv.getUint8(e+8));
        if(tag === 3) lngRef = String.fromCharCode(dv.getUint8(e+8));
        if(tag === 2 && cnt === 3){ const o = tiff + u32(e+8); if(o+24 <= dv.byteLength) lat = rational(o) + rational(o+8)/60 + rational(o+16)/3600; }
        if(tag === 4 && cnt === 3){ const o = tiff + u32(e+8); if(o+24 <= dv.byteLength) lng = rational(o) + rational(o+8)/60 + rational(o+16)/3600; }
      }
      if(lat !== null && lng !== null && isFinite(lat) && isFinite(lng)){
        out.lat = latRef === 'S' ? -lat : lat;
        out.lng = lngRef === 'W' ? -lng : lng;
        // 0,0 — точка в океане, обычно означает «координат нет»
        if(Math.abs(out.lat) < 0.001 && Math.abs(out.lng) < 0.001){ out.lat = null; out.lng = null; }
      }
    }
    if(exifOff && exifOff + 2 <= dv.byteLength){
      const n = u16(exifOff);
      for(let i=0;i<n;i++){
        const e = exifOff + 2 + i*12;
        if(e + 12 > dv.byteLength) break;
        const tag = u16(e), cnt = u32(e+4);
        if(tag === 0x9003 && cnt > 4){
          const o = tiff + u32(e+8);
          if(o + cnt <= dv.byteLength){
            let s = '';
            for(let j=0;j<cnt-1;j++) s += String.fromCharCode(dv.getUint8(o+j));
            out.date = s.trim();
          }
        }
      }
    }
    return (out.lat !== null || out.date) ? out : null;
  }catch(e){ return null; }
}

// ---------- HEIC / HEIF ----------
// Контейнер ISO BMFF (как у MP4): коробки «размер + тип». Метаданные EXIF —
// отдельный элемент типа «Exif»; где он лежит в файле, говорит таблица iloc.
// Картинку не декодируем (браузеры, кроме Safari, HEIC не показывают) —
// нужны только дата и координаты, а их можно прочитать напрямую.
function isoBoxes(dv, start, end){
  const out = [];
  let off = start;
  while(off + 8 <= end){
    let size = dv.getUint32(off);
    const type = String.fromCharCode(dv.getUint8(off+4), dv.getUint8(off+5), dv.getUint8(off+6), dv.getUint8(off+7));
    let header = 8;
    if(size === 1){
      if(off + 16 > end) break;
      size = dv.getUint32(off+8) * 4294967296 + dv.getUint32(off+12);
      header = 16;
    } else if(size === 0) size = end - off;
    if(size < header) break;
    out.push({ type, start: off, data: off + header, end: Math.min(off + size, end), fullEnd: off + size });
    off += size;
  }
  return out;
}
function heicExifLocation(buf){
  if(!buf || buf.byteLength < 24) return null;
  const dv = new DataView(buf);
  const top = isoBoxes(dv, 0, dv.byteLength);
  const ftyp = top[0];
  if(!ftyp || ftyp.type !== 'ftyp') return null;
  const brands = [];
  for(let o = ftyp.data; o + 4 <= ftyp.end; o += 4){
    if(o === ftyp.data + 4) continue; // версия, не бренд
    brands.push(String.fromCharCode(dv.getUint8(o), dv.getUint8(o+1), dv.getUint8(o+2), dv.getUint8(o+3)));
  }
  if(!brands.some(b => /^(heic|heix|heim|heis|hevc|hevx|hevm|hevs|mif1|msf1|avif|avis)$/.test(b))) return null;
  const meta = top.find(b => b.type === 'meta');
  if(!meta || meta.fullEnd > dv.byteLength) return null; // коробка meta не поместилась в прочитанное начало
  const kids = isoBoxes(dv, meta.data + 4, meta.end);
  const iinf = kids.find(b => b.type === 'iinf'), iloc = kids.find(b => b.type === 'iloc'), idat = kids.find(b => b.type === 'idat');
  if(!iinf || !iloc) return null;
  // iinf: ищем элемент типа Exif
  let exifId = null;
  const iv = dv.getUint8(iinf.data);
  const infes = isoBoxes(dv, iinf.data + 4 + (iv === 0 ? 2 : 4), iinf.end);
  for(const b of infes){
    if(b.type !== 'infe') continue;
    const v = dv.getUint8(b.data);
    if(v < 2) continue;
    let o = b.data + 4;
    const id = v === 2 ? dv.getUint16(o) : dv.getUint32(o);
    o += (v === 2 ? 2 : 4) + 2; // + item_protection_index
    const t = String.fromCharCode(dv.getUint8(o), dv.getUint8(o+1), dv.getUint8(o+2), dv.getUint8(o+3));
    if(t === 'Exif'){ exifId = id; break; }
  }
  if(exifId === null) return null;
  // iloc: где лежат байты этого элемента
  const v = dv.getUint8(iloc.data);
  let p = iloc.data + 4;
  const b1 = dv.getUint8(p), b2 = dv.getUint8(p+1);
  const offSize = b1 >> 4, lenSize = b1 & 15, baseSize = b2 >> 4, idxSize = (v === 1 || v === 2) ? (b2 & 15) : 0;
  p += 2;
  const readN = n => {
    let x = 0;
    if(n === 4) x = dv.getUint32(p);
    else if(n === 8) x = dv.getUint32(p) * 4294967296 + dv.getUint32(p+4);
    else if(n === 2) x = dv.getUint16(p);
    else if(n !== 0) throw new Error('размер поля iloc');
    p += n;
    return x;
  };
  const count = v < 2 ? dv.getUint16(p) : dv.getUint32(p);
  p += v < 2 ? 2 : 4;
  for(let i = 0; i < count; i++){
    const id = v < 2 ? dv.getUint16(p) : dv.getUint32(p);
    p += v < 2 ? 2 : 4;
    let method = 0;
    if(v === 1 || v === 2){ method = dv.getUint16(p) & 15; p += 2; }
    p += 2; // data_reference_index
    const base = readN(baseSize);
    const extents = dv.getUint16(p); p += 2;
    let first = null;
    for(let k = 0; k < extents; k++){
      if(idxSize) readN(idxSize);
      const eo = readN(offSize), el = readN(lenSize);
      if(!first) first = { offset: base + eo, length: el };
    }
    if(id !== exifId) continue;
    if(!first || !first.length) return null;
    if(method === 1){ if(!idat) return null; first.offset += idat.data; }
    else if(method !== 0) return null;
    return first;
  }
  return null;
}
async function readHeicMeta(file, head){
  let loc;
  try{ loc = heicExifLocation(head); }catch(e){ return null; }
  if(!loc || loc.length > 1024 * 1024) return null;
  let buf;
  if(loc.offset + loc.length <= head.byteLength) buf = head.slice(loc.offset, loc.offset + loc.length);
  else{
    // EXIF лежит дальше прочитанного начала — дочитываем только его
    buf = await new Promise(resolve=>{
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => resolve(null);
      r.readAsArrayBuffer(file.slice(loc.offset, loc.offset + loc.length));
    });
    if(!buf) return null;
  }
  const dv = new DataView(buf);
  if(dv.byteLength < 12) return null;
  // первые 4 байта — сколько пропустить до заголовка TIFF (обычно «Exif\0\0»)
  let tiff = 4 + dv.getUint32(0);
  const isTiff = o => o + 4 <= dv.byteLength && ((dv.getUint16(o) === 0x4949 && dv.getUint16(o+2) === 0x2A00) || (dv.getUint16(o) === 0x4D4D && dv.getUint16(o+2) === 0x002A));
  if(!isTiff(tiff)){
    tiff = -1;
    for(let o = 0; o < Math.min(32, dv.byteLength - 4); o++) if(isTiff(o)){ tiff = o; break; }
    if(tiff < 0) return null;
  }
  return readTiffMeta(dv, tiff);
}

// Дата из имени файла — запасной путь, когда метаданные вырезаны.
// Покрывает PXL_20260726_..., IMG_20150714_..., 2015-07-14 ... и подобные.
function dateFromFilename(name){
  const m = String(name).match(/(20\d{2})[-_.]?(\d{2})[-_.]?(\d{2})/);
  if(!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if(mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  if(y < 2000 || y > new Date().getFullYear() + 1) return null;
  return { year: y, month: mo, day: d };
}

function parseExifDate(s){
  // формат EXIF: 2015:07:14 12:30:45
  const m = String(s || '').match(/^(\d{4}):(\d{2}):(\d{2})/);
  if(!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if(mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { year: y, month: mo, day: d };
}

// Собираем снимки в кластеры-поездки. Ключевая идея: координаты нужны не у
// каждого снимка — достаточно одного на кластер, остальные привязываются к нему
// по времени. Поэтому смешанный архив (часть с метками, часть без) всё равно
// даёт результат.
const PHOTO_GAP_DAYS = 2;      // разрыв больше двух суток — уже другая поездка
const PHOTO_CLUSTER_KM = 150;  // и отдельный кластер, если далеко географически

function clusterPhotos(items){
  const dated = items.filter(p => p.date).slice()
    .sort((a,b) => a.date.year - b.date.year || a.date.month - b.date.month || a.date.day - b.date.day);
  const clusters = [];
  let cur = null;
  const dayNum = d => d.year * 372 + d.month * 31 + d.day; // грубый порядковый день, для сравнения разрывов достаточно
  dated.forEach(p=>{
    const dn = dayNum(p.date);
    let sameTrip = cur && (dn - cur.lastDay) <= PHOTO_GAP_DAYS;
    // если у обоих есть координаты и они далеко — это разные поездки,
    // даже когда сняты подряд (перелёт в тот же день)
    if(sameTrip && p.lat != null && cur.lat != null){
      if(haversine([cur.lat, cur.lng], [p.lat, p.lng]) > PHOTO_CLUSTER_KM) sameTrip = false;
    }
    if(!sameTrip){
      cur = { photos: [], from: p.date, to: p.date, lastDay: dn, lat: null, lng: null, geoCount: 0 };
      clusters.push(cur);
    }
    cur.photos.push(p);
    cur.to = p.date;
    cur.lastDay = dn;
    if(p.lat != null){
      cur.geoCount++;
      if(cur.lat === null){ cur.lat = p.lat; cur.lng = p.lng; }
    }
  });
  return clusters;
}

