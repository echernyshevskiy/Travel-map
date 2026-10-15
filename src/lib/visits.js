// Визиты в города: из отметок городов и остановок маршрутов, уникальность
// (один город в одном месяце — один визит) и счёт уникальных городов. unit/visits.test.js.

// Каждое посещение города — как отдельная запись «Город», так и каждая
// именованная точка ручного маршрута (например, автотрип через несколько
// городов). Не схлопывает дубликаты — это делает вызывающий код там, где нужно.
export function getAllCityVisits(entries){
  const visits = [];
  entries.forEach(e=>{
    if(e.type === 'city'){
      visits.push({ name: e.name, lat: e.lat, lng: e.lng, color: e.color, favorite: !!e.favorite, status: e.status, fromRoute: false, countryKey: e.countryKey || null, year: e.year, month: e.month || null, trip: e.trip || '' });
    } else if(e.type === 'route' && e.waypointNames){
      e.waypointNames.forEach((name, i)=>{
        const coord = e.waypointCoords && e.waypointCoords[i];
        const countryKey = e.waypointCountryKeys && e.waypointCountryKeys[i] || null;
        // точки маршрута не бывают избранными/вишлистом — берут цвет своего маршрута
        visits.push({ name, lat: coord ? coord[0] : null, lng: coord ? coord[1] : null, color: e.color, favorite: false, status: 'visited', fromRoute: true, countryKey, year: e.year, month: e.month || null, trip: e.trip || '' });
      });
    }
  });
  return visits;
}

// Один и тот же город в одном месяце — один визит: отдельная отметка города и
// он же остановкой маршрута, или две остановки в один день, раньше считались
// двумя визитами. Без месяца склеиваем по году и поездке.
export function uniqueCityVisits(visits){
  const seen = new Set();
  return visits.filter(v => {
    const n = (v.name || '').trim().toLowerCase();
    if(!n) return false;
    const k = n + '|' + (v.year || '') + '|' + (v.month ? 'm' + v.month : 't' + (v.trip || ''));
    if(seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// Уникальные города. Обычно это просто название: «Москва» из отметки города и
// «Москва» как остановка маршрута — один город, даже если у остановки страна не
// записана. Но если у одного названия встречаются разные страны (Париж во
// Франции и Париж в Техасе), это разные города — раньше они сливались в один.
export function distinctCityKeys(visits){
  const byName = new Map();
  visits.forEach(v=>{
    const n = (v.name || '').trim().toLowerCase();
    if(!n) return;
    if(!byName.has(n)) byName.set(n, new Set());
    if(v.countryKey) byName.get(n).add(v.countryKey);
  });
  const keys = new Set();
  byName.forEach((countryKeys, n)=>{
    if(countryKeys.size <= 1) keys.add(n);
    else countryKeys.forEach(k => keys.add(n + '|' + k));
  });
  return keys;
}
