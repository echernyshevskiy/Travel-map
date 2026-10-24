// Большой синтетический архив «как настоящий»: по объёму и составу похож на
// реальные данные владельца (около 330 записей, 32 маршрута с треками в тысячи
// точек, 40 поездок, 13 стартов), но собран из общедоступного справочника
// городов и случайных треков. Личных данных здесь нет. Генерация детерминирована:
// один и тот же набор при каждом запуске, поэтому замеры сравнимы.
const fs = require('fs');
const path = require('path');

function rng(seed){ let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }

function largeData(encodePolyline){
  const r = rng(20261024);
  const pick = a => a[Math.floor(r() * a.length)];
  const cities = JSON.parse(fs.readFileSync(path.join(__dirname, '../../src/data/world_cities.json'), 'utf8'))
    .split('\n').map(l => { const [name, lat, lng, key] = l.split('|'); return { name, lat: +lat, lng: +lng, key }; })
    .filter(c => c.key);
  const europe = cities.filter(c => c.lat > 35 && c.lat < 62 && c.lng > -10 && c.lng < 60);
  const keys = [...new Set(cities.map(c => c.key))].filter(k => k !== 'Russia');
  const purposes = ['tourism', 'tourism', 'tourism', 'sport', 'work', 'family'];
  const companies = ['alone', 'friends', 'friends', 'family', 'partner', 'group'];
  const entries = [];
  let id = 0;
  const nid = p => p + (++id);
  const trips = Array.from({ length: 40 }, (_, i) => `Поездка ${2005 + Math.floor(i / 2)}-${i % 2 ? 'осень' : 'весна'}`);
  const base = (y, m) => ({ year: y, month: m, status: 'visited', photos: [], purpose: pick(purposes), company: pick(companies), color: '#3F5240' });
  // страны
  const countryKeys = keys.slice().sort(() => r() - 0.5).slice(0, 45);
  countryKeys.forEach((k, i) => {
    const y = 2005 + Math.floor(r() * 22);
    entries.push({ ...base(y, 1 + Math.floor(r() * 12)), id: nid('c'), type: 'country', name: k, countryKey: k, color: '#A6592E', trip: i < 30 ? trips[i] : undefined });
  });
  // города
  for(let i = 0; i < 240; i++){
    const c = pick(r() < 0.7 ? europe : cities);
    const y = 2005 + Math.floor(r() * 22), m = 1 + Math.floor(r() * 12);
    const e = { ...base(y, m), id: nid('ci'), type: 'city', name: c.name, lat: c.lat, lng: c.lng, countryKey: c.key, trip: r() < 0.6 ? pick(trips) : undefined, tripOrder: i };
    if(i % 12 === 0) e.notes = 'Заметка о поездке номер ' + i + '. '.repeat(1 + (i % 5));
    if(i % 4 === 0) e.photos = ['https://example.org/photos/' + i + '.jpg'];
    if(i % 9 === 0){ const d = 1 + Math.floor(r() * 20); e.dateFrom = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; e.dateTo = `${y}-${String(m).padStart(2, '0')}-${String(d + 3).padStart(2, '0')}`; }
    if(i % 15 === 0) e.favorite = true;
    entries.push(e);
  }
  // планы
  for(let i = 0; i < 20; i++){ const c = pick(cities); entries.push({ ...base(2027, undefined), id: nid('w'), type: 'city', name: c.name, lat: c.lat, lng: c.lng, countryKey: c.key, status: 'wishlist' }); }
  // треки (как GPX): случайное блуждание, профиль высот
  const acts = ['hiking', 'running', 'cycling', 'roadtrip', 'hiking', 'running'];
  for(let i = 0; i < 22; i++){
    const s = pick(europe), n = 1500 + Math.floor(r() * 4500), step = 0.0015 + r() * 0.004;
    let la = s.lat, lo = s.lng, h = 200 + r() * 800; const pts = [], prof = [];
    let dir = r() * Math.PI * 2;
    for(let j = 0; j < n; j++){
      dir += (r() - 0.5) * 0.5; la += Math.cos(dir) * step; lo += Math.sin(dir) * step * 1.6; h += (r() - 0.5) * 12;
      pts.push([la, lo]); if(j % 25 === 0) prof.push([+(j * step * 111).toFixed(2), Math.round(h)]);
    }
    const y = 2012 + Math.floor(r() * 15), act = pick(acts);
    entries.push({ ...base(y, 1 + Math.floor(r() * 12)), id: nid('rt'), type: 'route', name: `${s.name}: ${act} ${i}`, activity: act, trip: r() < 0.5 ? pick(trips) : undefined,
      coordsEncoded: encodePolyline(pts), distanceKm: Math.round(n * step * 111 * 10) / 10, elevationGain: Math.round(200 + r() * 1500), maxElevation: Math.round(h + 300),
      durationMin: Math.round(60 + r() * 900), trackDays: 1 + Math.floor(r() * 3), profile: prof,
      waypointNames: [s.name, s.name + ' (финиш)'], waypointCoords: [pts[0], pts[pts.length - 1]], waypointCountryKeys: [s.key, s.key] });
  }
  // маршруты «по городам»
  for(let i = 0; i < 10; i++){
    const stops = Array.from({ length: 3 + Math.floor(r() * 7) }, () => pick(europe));
    const pts = stops.map(c => [c.lat, c.lng]);
    entries.push({ ...base(2015 + i, 6), id: nid('rc'), type: 'route', name: stops[0].name + ' — ' + stops[stops.length - 1].name, activity: 'roadtrip', trip: pick(trips),
      coordsEncoded: encodePolyline(pts), distanceKm: 800 + i * 50, isEstimated: true,
      waypointNames: stops.map(c => c.name), waypointCoords: pts, waypointCountryKeys: stops.map(c => c.key) });
  }
  const races = Array.from({ length: 13 }, (_, i) => ({ id: 'race' + i, name: 'Забег ' + (i + 1), date: `${2014 + i}-0${1 + (i % 9)}-15`, city: pick(europe).name, distanceKm: [5, 10, 21.1, 42.2][i % 4],
    time: ['24:10', '49:30', '1:45:20', '3:55:00'][i % 4], place: 100 + i * 7, participants: 2000 + i * 100, status: i === 12 ? 'upcoming' : 'done' }));
  const tripMeta = {}; trips.slice(0, 15).forEach((t, i) => { tripMeta[t] = { description: 'Описание поездки ' + i }; });
  return { entries, races, tripMeta };
}

module.exports = { largeData };
