// Общие помощники тестов: открыть страницу с заданными данными, перехватив
// сеть, и собрать синтетический набор записей (настоящие данные в тестах не нужны).
const fs = require('fs');
const path = require('path');
const { expect } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..');
const BASE = 'https://travel-map.test/';

// Google polyline — тот же формат, в котором приложение хранит треки
function encodePolyline(coords, precision = 5){
  const f = Math.pow(10, precision);
  let out = '', plat = 0, plng = 0;
  for(const [lat, lng] of coords){
    for(const [v, p] of [[Math.round(lat * f), plat], [Math.round(lng * f), plng]]){
      let d = v - p;
      d = d < 0 ? ~(d << 1) : d << 1;
      while(d >= 0x20){ out += String.fromCharCode((0x20 | (d & 0x1f)) + 63); d >>= 5; }
      out += String.fromCharCode(d + 63);
    }
    plat = Math.round(lat * f); plng = Math.round(lng * f);
  }
  return out;
}

const WAYPOINTS = [[55.75, 37.62], [56.86, 35.90], [59.94, 30.31]]; // Москва, Тверь, Петербург
function zigzag(lat, lng, n){
  const pts = [];
  for(let i = 0; i < n; i++) pts.push([lat + i * 0.004, lng + (i % 2 ? 0.006 : 0)]);
  return pts;
}

function sampleEntries(){
  const base = { photos: [], purpose: 'tourism', status: 'visited' };
  return [
    { ...base, id: 'c_ge', type: 'country', name: 'Грузия', year: 2023, month: 5, countryKey: 'Georgia', color: '#A6592E', trip: 'Кавказ 2023', notes: 'Хинкали и горы' },
    { ...base, id: 'c_am', type: 'country', name: 'Армения', year: 2024, month: 9, countryKey: 'Armenia', color: '#A6592E' },
    { ...base, id: 'c_jp', type: 'country', name: 'Япония', year: 2027, countryKey: 'Japan', color: '#A6592E', status: 'wishlist' },
    { ...base, id: 'ci_tb', type: 'city', name: 'Тбилиси', year: 2023, month: 5, lat: 41.69, lng: 44.80, countryKey: 'Georgia', color: '#3F5240', trip: 'Кавказ 2023' },
    { ...base, id: 'ci_kz', type: 'city', name: 'Казань', year: 2022, month: 7, lat: 55.79, lng: 49.12, countryKey: 'Russia', color: '#3F5240' },
    { ...base, id: 'ci_so', type: 'city', name: 'Сочи', year: 2021, month: 8, lat: 43.59, lng: 39.72, countryKey: 'Russia', color: '#3F5240' },
    { ...base, id: 'ci_pf', type: 'city', name: 'Париж', year: 2019, month: 4, lat: 48.85, lng: 2.35, countryKey: 'France', color: '#3F5240' },
    { ...base, id: 'ci_pt', type: 'city', name: 'Париж', year: 2021, month: 3, lat: 33.66, lng: -95.55, countryKey: 'United States of America', color: '#3F5240' },
    { ...base, id: 'rt_city', type: 'route', name: 'Москва — Санкт-Петербург', year: 2025, month: 6, color: '#3F5240', activity: 'roadtrip',
      coordsEncoded: encodePolyline(WAYPOINTS), distanceKm: 640, isEstimated: true,
      waypointNames: ['Москва', 'Тверь', 'Санкт-Петербург'], waypointCoords: WAYPOINTS, waypointCountryKeys: ['Russia', 'Russia', 'Russia'] },
    { ...base, id: 'rt_gpx', type: 'route', name: 'Поход в Подмосковье', year: 2024, month: 8, color: '#3F5240', activity: 'hiking',
      coordsEncoded: encodePolyline(zigzag(55.95, 37.20, 60)), distanceKm: 31.2, elevationGain: 240, trackDays: 2 },
  ];
}
function sampleRaces(){
  return [
    { id: 'r1', name: 'Осенний полумарафон', date: '2025-09-20', city: 'Москва', country: 'Россия', distanceKm: 21.1, time: '1:49:30', place: 812, participants: 5400 },
    { id: 'r2', name: 'Весенняя десятка', date: '2027-04-18', distanceKm: 10, status: 'upcoming' },
  ];
}

async function openApp(page, opts = {}){
  const { build = 'edit', entries = sampleEntries(), races = sampleRaces(), tripMeta = {}, theme = null, mocks = {} } = opts;
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // нарушение политики безопасности (CSP) — тоже ошибка: значит, что-то из
  // нужного приложению заблокировано или в страницу попал чужой код
  page.on('console', m => { if(/Content Security Policy/i.test(m.text()) && !(opts.allowCsp)) errors.push('CSP: ' + m.text().slice(0, 300)); });
  await page.route('**/*', route => {
    const url = route.request().url();
    if(url.startsWith(BASE)){
      let rel = decodeURIComponent(url.slice(BASE.length).split(/[?#]/)[0]);
      if(rel === '' || rel.endsWith('/')) rel += 'index.html';
      const file = path.join(ROOT, rel);
      if(fs.existsSync(file)) return route.fulfill({ path: file });
      return route.fulfill({ status: 404, body: '' });
    }
    for(const [pattern, handler] of Object.entries(mocks)){
      if(url.includes(pattern)) return route.fulfill(handler(url));
    }
    return route.abort();
  });
  await page.addInitScript(({ entries, races, tripMeta, theme }) => {
    try{
      if(!sessionStorage.getItem('__seeded')){
        localStorage.setItem('travel-map-data', JSON.stringify({ entries, tripMeta, races }));
        localStorage.setItem('travel-map-basemap', 'plain'); // без тайлов из сети
        if(theme) localStorage.setItem('travel-map-theme', theme);
        sessionStorage.setItem('__seeded', '1');
      }
    }catch(e){}
  }, { entries, races, tripMeta, theme });
  await page.goto(BASE + (build === 'friends' ? 'friends/' : ''));
  await page.waitForFunction(() => {
    const b = document.getElementById('bootOverlay');
    return (!b || b.classList.contains('hiding')) && !!window.__travelMap;
  });
  return { errors };
}

function json(body){ return () => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }); }

async function expectNoErrors(errors){ expect(errors, errors.join('\n')).toEqual([]); }

// данные, которые сборка для друзей кладёт в JSON-тег index.html
function readBaked(html){
  const m = html.match(/<script type="application\/json" id="baked-data">([^<]*)<\/script>/);
  return m ? JSON.parse(m[1]) : null;
}

module.exports = { readBaked, openApp, sampleEntries, sampleRaces, encodePolyline, json, expectNoErrors, ROOT, WAYPOINTS };
