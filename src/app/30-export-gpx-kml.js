// ---------- экспорт в GPX ----------
// Смысл не в красоте, а в сохранности: GPX понимают Google Earth, Garmin,
// OsmAnd и почти всё остальное. Данные перестают быть заперты в одном
// приложении, даже если оно однажды перестанет открываться.
function gpxEscape(s){
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&apos;')
    // управляющие символы недопустимы в XML и ломают разбор у читающей стороны
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'');
}

// дата нужна не всем читателям, но с ней треки раскладываются по времени
function gpxTime(entry){
  if(!entry.year) return null;
  const m = String(Math.min(Math.max(entry.month || 1, 1), 12)).padStart(2,'0');
  return `${entry.year}-${m}-01T12:00:00Z`;
}

function buildGpx(){
  const visited = allEntries.filter(e => e.status !== 'wishlist');
  const parts = [];
  parts.push('<?xml version="1.0" encoding="UTF-8"?>');
  parts.push('<gpx version="1.1" creator="Карта путешествий" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">');
  parts.push('  <metadata>');
  parts.push(`    <name>${gpxEscape('Карта путешествий')}</name>`);
  parts.push(`    <time>${new Date().toISOString().replace(/\.\d+Z$/,'Z')}</time>`);
  parts.push('  </metadata>');

  let wptCount = 0, trkCount = 0;
  // Одно и то же место часто заведено и городом, и остановкой маршрута —
  // в выгрузке оно оказывалось двумя точками почти в одних координатах.
  // Помечаем уже выгруженные: сначала города (у них есть заметки и цель),
  // потом точки маршрутов, которых среди городов ещё нет.
  const emitted = new Set();
  const placeKey = (name, lat, lng) =>
    `${String(name || '').trim().toLowerCase()}|${lat.toFixed(2)}|${lng.toFixed(2)}`;

  // Города — точками, по одной на место. Одно и то же место посещают не раз:
  // в файл попадало столько одинаковых точек, сколько было визитов, и они
  // накладывались друг на друга. Собираем визиты вместе и перечисляем годы.
  const places = new Map();
  visited.filter(e => e.type === 'city' && e.lat != null && e.lng != null).forEach(e=>{
    const key = placeKey(e.name, e.lat, e.lng);
    if(!places.has(key)){
      places.set(key, { name: e.name, lat: e.lat, lng: e.lng, years: [], trips: [], notes: [], first: e });
    }
    const p = places.get(key);
    if(e.year && !p.years.includes(e.year)) p.years.push(e.year);
    if(e.trip && !p.trips.includes(e.trip)) p.trips.push(e.trip);
    const n = (e.notes || '').trim();
    if(n && !p.notes.includes(n)) p.notes.push(n);
    emitted.add(key);
  });
  places.forEach(p=>{
    const t = gpxTime(p.first);
    const years = p.years.sort((a,b)=>a-b);
    const desc = [
      years.length > 1 ? `Визитов: ${p.years.length} · ${years.join(', ')}` : (years[0] ? String(years[0]) : null),
      purposeLabel(p.first.purpose),
      p.trips.length ? `Поездки: ${p.trips.join('; ')}` : null,
      p.notes.join(' | ') || null
    ].filter(Boolean).join(' · ');
    parts.push(`  <wpt lat="${p.lat}" lon="${p.lng}">`);
    parts.push(`    <name>${gpxEscape(p.name)}</name>`);
    if(desc) parts.push(`    <desc>${gpxEscape(desc)}</desc>`);
    if(t) parts.push(`    <time>${t}</time>`);
    parts.push('    <sym>Flag, Blue</sym>');
    parts.push('  </wpt>');
    wptCount++;
  });

  // именованные точки маршрутов — тоже точками, иначе они потерялись бы
  visited.filter(e => e.type === 'route' && Array.isArray(e.waypointNames)).forEach(e=>{
    e.waypointNames.forEach((nm, i)=>{
      const c = e.waypointCoords && e.waypointCoords[i];
      if(!c || c[0] == null || c[1] == null) return;
      const key = placeKey(nm, c[0], c[1]);
      if(emitted.has(key)) return; // это место уже выгружено как город
      emitted.add(key);
      parts.push(`  <wpt lat="${c[0]}" lon="${c[1]}">`);
      parts.push(`    <name>${gpxEscape(nm)}</name>`);
      parts.push(`    <desc>${gpxEscape('Точка маршрута: ' + e.name)}</desc>`);
      parts.push('    <sym>Waypoint</sym>');
      parts.push('  </wpt>');
      wptCount++;
    });
  });

  // маршруты — треками
  visited.filter(e => e.type === 'route').forEach(e=>{
    const coords = getEntryCoords(e);
    if(!coords || coords.length < 2) return;
    const t = gpxTime(e);
    const profile = Array.isArray(e.profile) ? e.profile : null;
    const desc = [
      activityLabel(e.activity),
      e.distanceKm ? `${e.distanceKm.toFixed(1)} км` : null,
      (e.elevationGain != null && e.elevationGain > 0) ? `набор ${Math.round(e.elevationGain)} м` : null,
      e.trip ? `Поездка: ${e.trip}` : null
    ].filter(Boolean).join(' · ');
    parts.push('  <trk>');
    parts.push(`    <name>${gpxEscape(e.name)}</name>`);
    if(desc) parts.push(`    <desc>${gpxEscape(desc)}</desc>`);
    parts.push('    <trkseg>');
    const gpxBreaks = new Set(entryBreaks(e));
    coords.forEach((c, i)=>{
      if(c[0] == null || c[1] == null) return;
      if(gpxBreaks.has(i)){ parts.push('    </trkseg>'); parts.push('    <trkseg>'); }
      // профиль высот хранится прореженным — растягиваем его на длину трека
      let ele = null;
      if(profile && profile.length > 1){
        const idx = Math.round(i / (coords.length - 1) * (profile.length - 1));
        const v = profile[idx];
        if(typeof v === 'number' && isFinite(v)) ele = v;
      }
      parts.push(`      <trkpt lat="${c[0]}" lon="${c[1]}">${ele != null ? `<ele>${ele.toFixed(1)}</ele>` : ''}${(i === 0 && t) ? `<time>${t}</time>` : ''}</trkpt>`);
    });
    parts.push('    </trkseg>');
    parts.push('  </trk>');
    trkCount++;
  });

  parts.push('</gpx>');
  return { xml: parts.join('\n'), wptCount, trkCount };
}

document.getElementById('exportGpxBtn').addEventListener('click', ()=>{
  if(allEntries.length === 0){ toast('Пока нечего экспортировать'); return; }
  let res;
  try{ res = buildGpx(); }
  catch(err){ console.error('GPX export failed', err); toast('Не удалось собрать GPX'); return; }
  if(res.wptCount === 0 && res.trkCount === 0){
    toast('Нет ни маршрутов, ни точек с координатами');
    return;
  }
  const blob = new Blob([res.xml], { type: 'application/gpx+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `travel-map-${new Date().toISOString().slice(0,10)}.gpx`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=> URL.revokeObjectURL(url), 1000);
  toast(`GPX: треков ${res.trkCount}, точек ${res.wptCount}`);
});

// ---------- экспорт в KML ----------
// KML понимают Google My Maps, Google Earth, Organic Maps, QGIS. В отличие от
// GPX, в нём есть многоугольники и папки-слои: страны выгружаются контурами,
// посещённые регионы России — тоже, планы — отдельным слоем.
function kmlColor(hex, alpha){
  // KML пишет цвет задом наперёд: aabbggrr
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  const rgb = m ? m[1] : 'A6592E';
  return (alpha || 'ff') + rgb.slice(4,6) + rgb.slice(2,4) + rgb.slice(0,2);
}
function kmlCoord(lat, lng, ele){ return `${(+lng).toFixed(6)},${(+lat).toFixed(6)}${ele != null && isFinite(ele) ? ',' + Math.round(ele) : ''}`; }
function kmlPolygons(geometry){
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  return polys.map(poly => '<Polygon><tessellate>1</tessellate>' + poly.map((ring, i) =>
    `<${i ? 'innerBoundaryIs' : 'outerBoundaryIs'}><LinearRing><coordinates>${ring.map(c => kmlCoord(c[1], c[0])).join(' ')}</coordinates></LinearRing></${i ? 'innerBoundaryIs' : 'outerBoundaryIs'}>`
  ).join('') + '</Polygon>').join('');
}
function kmlPlacemark(name, desc, styleUrl, geometryXml, inlineStyle){
  return `<Placemark><name>${gpxEscape(name)}</name>${desc ? `<description>${gpxEscape(desc)}</description>` : ''}` +
    `${styleUrl ? `<styleUrl>${styleUrl}</styleUrl>` : ''}${inlineStyle || ''}${geometryXml}</Placemark>`;
}
function buildKml(){
  const visited = allEntries.filter(e => e.status !== 'wishlist');
  const planned = allEntries.filter(e => e.status === 'wishlist');
  const folders = [];
  const counts = { countries: 0, cities: 0, routes: 0, regions: 0, plans: 0 };
  const yearsOf = list => [...new Set(list.map(e => e.year).filter(Boolean))].sort((a,b)=>a-b);

  // страны: одна метка на страну, все визиты — в описании
  const byCountry = new Map();
  visited.filter(e => e.type === 'country' && e.countryKey).forEach(e=>{
    if(!byCountry.has(e.countryKey)) byCountry.set(e.countryKey, []);
    byCountry.get(e.countryKey).push(e);
  });
  const countryMarks = [];
  byCountry.forEach((list, key)=>{
    const geom = getCountryGeometry(key);
    if(!geom) return;
    const years = yearsOf(list);
    const trips = [...new Set(list.map(e => e.trip).filter(Boolean))];
    const desc = [years.length ? (years.length > 1 ? `Визитов: ${list.length} · ${years.join(', ')}` : String(years[0])) : null,
                  trips.length ? `Поездки: ${trips.join('; ')}` : null].filter(Boolean).join(' · ');
    countryMarks.push(kmlPlacemark(COUNTRY_RU[key] || list[0].name, desc, '#country', `<MultiGeometry>${kmlPolygons(geom)}</MultiGeometry>`));
    counts.countries++;
  });
  if(countryMarks.length) folders.push(`<Folder><name>Страны</name>${countryMarks.join('')}</Folder>`);

  // регионы России, где были
  const regionMarks = [];
  try{
    const state = computeRuRegions(visited);
    RU_REGIONS.forEach(r=>{
      const places = state.visited.get(r.name);
      if(!places) return;
      regionMarks.push(kmlPlacemark(r.name, [...places].join(', '), '#region', `<MultiGeometry>${kmlPolygons(r.geometry)}</MultiGeometry>`));
      counts.regions++;
    });
  }catch(e){ console.warn('регионы в KML не попали', e); }
  if(regionMarks.length) folders.push(`<Folder><name>Регионы России</name>${regionMarks.join('')}</Folder>`);

  // города: одна точка на место, визиты собраны в описании (как в GPX)
  const places = new Map();
  const placeKey = (name, lat, lng) => `${String(name || '').trim().toLowerCase()}|${(+lat).toFixed(2)}|${(+lng).toFixed(2)}`;
  visited.filter(e => e.type === 'city' && e.lat != null && e.lng != null).forEach(e=>{
    const key = placeKey(e.name, e.lat, e.lng);
    if(!places.has(key)) places.set(key, { name: e.name, lat: e.lat, lng: e.lng, list: [] });
    places.get(key).list.push(e);
  });
  visited.filter(e => e.type === 'route' && Array.isArray(e.waypointNames)).forEach(e=>{
    e.waypointNames.forEach((nm, i)=>{
      const c = e.waypointCoords && e.waypointCoords[i];
      if(!c || c[0] == null || c[1] == null) return;
      const key = placeKey(nm, c[0], c[1]);
      if(!places.has(key)) places.set(key, { name: nm, lat: c[0], lng: c[1], list: [], via: e.name });
    });
  });
  const cityMarks = [];
  places.forEach(p=>{
    const years = yearsOf(p.list);
    const notes = [...new Set(p.list.map(e => (e.notes || '').trim()).filter(Boolean))];
    const trips = [...new Set(p.list.map(e => e.trip).filter(Boolean))];
    const desc = [years.length ? (years.length > 1 ? `Визитов: ${p.list.length} · ${years.join(', ')}` : String(years[0])) : null,
                  p.via && !p.list.length ? `Точка маршрута: ${p.via}` : null,
                  trips.length ? `Поездки: ${trips.join('; ')}` : null,
                  notes.join(' | ') || null].filter(Boolean).join(' · ');
    const fav = p.list.some(e => e.favorite);
    cityMarks.push(kmlPlacemark(p.name, desc, fav ? '#cityFav' : '#city', `<Point><coordinates>${kmlCoord(p.lat, p.lng)}</coordinates></Point>`));
    counts.cities++;
  });
  if(cityMarks.length) folders.push(`<Folder><name>Города</name>${cityMarks.join('')}</Folder>`);

  // маршруты: линия своего цвета, с высотой, если она есть
  const routeMarks = [];
  visited.filter(e => e.type === 'route').forEach(e=>{
    const coords = getEntryCoords(e);
    if(!coords || coords.length < 2) return;
    const desc = [e.year ? `${escapeHtml(whenLabel(e))}` : null,
                  activityLabel(e.activity), `${(e.distanceKm || 0).toFixed(1)} км${e.isEstimated ? ' (по прямой)' : ''}`,
                  e.elevationGain ? `+${Math.round(e.elevationGain)} м` : null,
                  e.trip ? `Поездка: ${e.trip}` : null, (e.notes || '').trim() || null].filter(Boolean).join(' · ');
    const style = `<Style><LineStyle><color>${kmlColor(e.color)}</color><width>3</width></LineStyle></Style>`;
    const lines = entrySegments(e).map(seg => `<LineString><tessellate>1</tessellate><coordinates>${seg.map(c => kmlCoord(c[0], c[1], c[2])).join(' ')}</coordinates></LineString>`);
    routeMarks.push(kmlPlacemark(e.name, desc, null, lines.length > 1 ? `<MultiGeometry>${lines.join('')}</MultiGeometry>` : lines[0], style));
    counts.routes++;
  });
  if(routeMarks.length) folders.push(`<Folder><name>Маршруты</name>${routeMarks.join('')}</Folder>`);

  // планы: страны контуром без заливки, города точками
  const planMarks = [];
  planned.forEach(e=>{
    if(e.type === 'country' && e.countryKey){
      const geom = getCountryGeometry(e.countryKey);
      if(geom){ planMarks.push(kmlPlacemark(e.name, e.year ? `План · ${e.year}` : 'План', '#plan', `<MultiGeometry>${kmlPolygons(geom)}</MultiGeometry>`)); counts.plans++; }
    } else if(e.type === 'city' && e.lat != null && e.lng != null){
      planMarks.push(kmlPlacemark(e.name, e.year ? `План · ${e.year}` : 'План', '#planCity', `<Point><coordinates>${kmlCoord(e.lat, e.lng)}</coordinates></Point>`));
      counts.plans++;
    }
  });
  if(planMarks.length) folders.push(`<Folder><name>Планы</name>${planMarks.join('')}</Folder>`);

  const styles =
    `<Style id="country"><LineStyle><color>${kmlColor('#A6592E')}</color><width>1.5</width></LineStyle><PolyStyle><color>${kmlColor('#A6592E', '66')}</color></PolyStyle></Style>` +
    `<Style id="region"><LineStyle><color>${kmlColor('#4F6A86')}</color><width>1</width></LineStyle><PolyStyle><color>${kmlColor('#4F6A86', '55')}</color></PolyStyle></Style>` +
    `<Style id="plan"><LineStyle><color>${kmlColor('#A6592E')}</color><width>2</width></LineStyle><PolyStyle><fill>0</fill></PolyStyle></Style>` +
    `<Style id="city"><IconStyle><color>${kmlColor('#3F5240')}</color><scale>0.9</scale></IconStyle></Style>` +
    `<Style id="cityFav"><IconStyle><color>${kmlColor('#9C3B2E')}</color><scale>1.1</scale></IconStyle></Style>` +
    `<Style id="planCity"><IconStyle><color>${kmlColor('#C9A227')}</color><scale>0.8</scale></IconStyle></Style>`;
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<kml xmlns="http://www.opengis.net/kml/2.2"><Document>' +
    `<name>${gpxEscape('Карта путешествий')}</name>` +
    `<description>${gpxEscape('Выгружено ' + new Date().toLocaleDateString('ru-RU'))}</description>` +
    styles + folders.join('') + '</Document></kml>\n';
  return { xml, counts };
}

document.getElementById('exportKmlBtn').addEventListener('click', async ()=>{
  if(allEntries.length === 0){ toast('Пока нечего экспортировать'); return; }
  let res;
  try{ res = buildKml(); }
  catch(err){ console.error('KML export failed', err); toast('Не удалось собрать KML'); return; }
  const c = res.counts;
  const summary = `KML: стран ${c.countries}, регионов ${c.regions}, городов ${c.cities}, маршрутов ${c.routes}${c.plans ? ', планов ' + c.plans : ''}`;
  const fileName = `travel-map-${new Date().toISOString().slice(0,10)}.kml`;
  const blob = new Blob([res.xml], { type: 'application/vnd.google-earth.kml+xml' });
  // на телефоне сначала пробуем «Поделиться» — сразу в Organic Maps или мессенджер;
  // если браузер не умеет делиться таким файлом — обычное скачивание
  try{
    const file = new File([blob], fileName, { type: blob.type });
    if(navigator.canShare && navigator.share && /Android|iPhone|iPad/i.test(navigator.userAgent) && navigator.canShare({ files: [file] })){
      await navigator.share({ files: [file], title: 'Карта путешествий' });
      toast(summary);
      return;
    }
  }catch(err){
    if(err && err.name === 'AbortError') return; // человек сам закрыл окно «Поделиться»
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=> URL.revokeObjectURL(url), 1000);
  toast(summary);
});

