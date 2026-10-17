const regionPointCache = new Map();
function regionAt(lat, lng){
  for(const r of RU_REGIONS){
    const b = r.bbox;
    if(lat < b[0] || lat > b[2] || lng < b[1] || lng > b[3]) continue;
    if(pointInGeometry([lat, lng], r.geometry)) return r;
  }
  return null;
}
// Береговые города упрощённые контуры иногда «теряют» (Сочи, Кронштадт) —
// для точек, отмеченных как Россия, берём ближайший регион в пределах 50 км
function regionForPoint(lat, lng, countryKey){
  if(lat == null || lng == null) return null;
  const key = lat.toFixed(4) + ',' + lng.toFixed(4) + ',' + (countryKey || '');
  if(regionPointCache.has(key)) return regionPointCache.get(key);
  let r = regionAt(lat, lng);
  if(!r && countryKey === HOME_COUNTRY_KEY){
    let best = null, bestD = 50;
    const cosLat = Math.cos(lat * Math.PI / 180);
    RU_REGIONS.forEach(reg=>{
      const b = reg.bbox;
      if(lat < b[0] - 0.6 || lat > b[2] + 0.6 || lng < b[1] - 1 || lng > b[3] + 1) return;
      reg.polys.forEach(poly => poly[0].forEach(c=>{
        const d = Math.hypot((c[0] - lng) * cosLat, c[1] - lat) * 111;
        if(d < bestD){ bestD = d; best = reg; }
      }));
    });
    r = best;
  }
  regionPointCache.set(key, r);
  return r;
}
const routeRegionCache = new Map(); // id -> { enc, names:Set }
function regionsAlongRoute(entry){
  const cached = routeRegionCache.get(entry.id);
  if(cached && cached.enc === entry.coordsEncoded) return cached.names;
  const names = new Set();
  let last = null;
  getEntryCoords(entry).forEach(c=>{
    const lat = c[0], lng = c[1];
    if(lat < 41 || lat > 82 || (lng < 19 && lng > -169)) return; // явно вне России
    if(last && pointInGeometry([lat, lng], last.geometry)) return;
    const r = regionAt(lat, lng);
    if(r){ names.add(r.name); last = r; }
  });
  routeRegionCache.set(entry.id, { enc: entry.coordsEncoded, names });
  return names;
}
function computeRuRegions(visibleVisited){
  const visited = new Map(); // name -> Set(места)
  const visits = new Map();  // name -> число визитов (без самого дома — как в топе городов)
  const passed = new Set();
  uniqueCityVisits(getAllCityVisits(visibleVisited)).forEach(v=>{
    if(v.countryKey && v.countryKey !== HOME_COUNTRY_KEY) return;
    const r = regionForPoint(v.lat, v.lng, v.countryKey);
    if(!r) return;
    if(!visited.has(r.name)) visited.set(r.name, new Set());
    visited.get(r.name).add(v.name.trim());
    if(v.name.trim().toLowerCase() !== HOME_CITY_NAME.toLowerCase()) visits.set(r.name, (visits.get(r.name) || 0) + 1);
  });
  visibleVisited.filter(e => e.type === 'route').forEach(e=>{
    regionsAlongRoute(e).forEach(n => { if(!visited.has(n)) passed.add(n); });
  });
  return { visited, visits, passed };
}
let ruRegionsLayer = null;
let ruRegionsState = { visited: new Map(), visits: new Map(), passed: new Set() };
let ruRegionsOn = (function(){ try{ return localStorage.getItem('travel-map-ru-regions') !== '0'; }catch(e){ return true; } })();
function ruRegionStyle(f){
  const n = f.properties.name;
  const isVisited = ruRegionsState.visited.has(n);
  const isPassed = !isVisited && ruRegionsState.passed.has(n);
  return {
    color: HOME_COLOR, weight: 0.6, opacity: 0.45,
    // свой оттенок — серо-синий, как у дома: иначе посещённые регионы
    // сливались бы с посещёнными странами-соседями (янтарь)
    fillColor: '#4F6A86',
    fillOpacity: isVisited ? 0.34 : isPassed ? 0.12 : 0,
    dashArray: isPassed ? '3,4' : null
  };
}
function updateRuRegions(visibleVisited){
  ruRegionsState = computeRuRegions(visibleVisited);
  if(ruRegionsOn){
    if(!ruRegionsLayer){
      // неинтерактивный: клики проходят к слою России с её попапом
      ruRegionsLayer = L.geoJSON(RU_REGIONS_GEOJSON, { style: ruRegionStyle, interactive: false });
    }
    if(!map.hasLayer(ruRegionsLayer)) ruRegionsLayer.addTo(map);
    ruRegionsLayer.setStyle(ruRegionStyle);
    ruRegionsLayer.bringToBack();
    if(plainBaseLayer && map.hasLayer(plainBaseLayer)) plainBaseLayer.bringToBack();
  } else if(ruRegionsLayer && map.hasLayer(ruRegionsLayer)){
    map.removeLayer(ruRegionsLayer);
  }
  const n = ruRegionsState.visited.size;
  const stat = document.getElementById('statRuRegionsF');
  if(stat) stat.textContent = `${n} из ${RU_REGION_TOTAL}` + (ruRegionsState.passed.size ? ` · проездом ${ruRegionsState.passed.size}` : '');
  const list = document.getElementById('ruRegionsList');
  if(list){
    const vis = ruRegionsState.visits;
    const top = [...vis.entries()].sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru')).slice(0, 5);
    if(top.length){
      renderTopList('ruRegionsList', top);
      const total = ruRegionsState.visited.size, pass = ruRegionsState.passed.size;
      list.insertAdjacentHTML('beforeend', `<div class="hint" style="margin-top:6px;">Всего: ${total} из ${RU_REGION_TOTAL}${pass ? ` · проездом ещё ${pass}` : ''} · визиты домой (${escapeHtml(HOME_CITY_NAME)}) не считаются</div>`);
    } else {
      list.innerHTML = `<div class="hint">Пока нет отметок внутри России</div>`;
    }
  }
  const chip = document.getElementById('ruRegionsChip');
  if(chip) chip.classList.toggle('active', ruRegionsOn);
  const leg = document.getElementById('legendRuRegions');
  if(leg) leg.style.display = ruRegionsOn ? '' : 'none';
  try{ globeRedraw(); }catch(e){} // на шаре регионы рисуются по тому же состоянию (до запуска шара — пропускаем)
}
document.getElementById('ruRegionsChip').addEventListener('click', ()=>{
  ruRegionsOn = !ruRegionsOn;
  try{ localStorage.setItem('travel-map-ru-regions', ruRegionsOn ? '1' : '0'); }catch(e){}
  updateRuRegions(allEntries.filter(passesFilter).filter(e => e.status !== 'wishlist'));
});
// Строка о регионе для попапа России: где кликнули и что там было
function ruRegionPopupHtml(latlng){
  const r = regionAt(latlng.lat, latlng.lng);
  if(!r) return '';
  const places = ruRegionsState.visited.get(r.name);
  const passed = ruRegionsState.passed.has(r.name);
  const status = places ? `были: ${[...places].slice(0, 8).map(escapeHtml).join(', ')}${places.size > 8 ? ` и ещё ${places.size - 8}` : ''}`
               : passed ? 'проездом — по треку маршрута' : 'пока не были';
  return `<div class="cpop-status"><b>${escapeHtml(r.name)}</b> — ${status}</div>` +
         `<div class="cpop-status">Регионов России: ${ruRegionsState.visited.size} из ${RU_REGION_TOTAL}</div>`;
}

