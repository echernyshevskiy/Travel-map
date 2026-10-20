// Форматирование и разбор: экранирование для HTML, безопасные ссылки, темп и время
// забега, склонения. Чистые функции — unit/format.test.js.

export function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

export function escapeAttr(s){ return escapeHtml(s); }

// Нормализация пользовательских ссылок:
// - без схемы («maps.google.com/...») браузер трактует адрес как относительный
//   путь и уводит внутрь нашего же сайта — дописываем https://
// - опасные схемы (javascript:, data: и т.п.) отбрасываем целиком
export function safeUrl(raw){
  if(!raw) return '';
  const url = String(raw).trim();
  if(!url) return '';
  if(/^https?:\/\//i.test(url) || /^mailto:/i.test(url)) return url;
  if(/^[a-z][a-z0-9+.-]*:/i.test(url)) return ''; // любая другая схема — не пропускаем
  return 'https://' + url;
}

export const normSearch = s => String(s || '').trim().toLowerCase().replace(/ё/g, 'е');

export function formatPace(minPerKm){
  if(!minPerKm || !isFinite(minPerKm)) return null;
  const total = Math.round(minPerKm * 60); // 4:59.6 → 5:00, а не «4:60»
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2,'0')} /км`;
}

// Время забега принимаем в привычном виде: «1:38:24», «48:12», «48:12.5».
// Разбор терпимый, потому что вводить придётся руками с бумажного протокола.
export function parseRaceTime(str){
  const s = String(str || '').trim().replace(',', '.');
  if(!s) return null;
  const parts = s.split(':').map(x => x.trim());
  if(parts.some(x => x === '' || isNaN(Number(x)))) return null;
  let min = null;
  if(parts.length === 3) min = Number(parts[0])*60 + Number(parts[1]) + Number(parts[2])/60;
  else if(parts.length === 2) min = Number(parts[0]) + Number(parts[1])/60;
  else if(parts.length === 1) min = Number(parts[0]); // просто минуты
  if(min === null || !isFinite(min) || min <= 0) return null;
  return min;
}

export function formatRaceTime(min){
  if(min == null || !isFinite(min)) return '—';
  const total = Math.round(min * 60);
  const h = Math.floor(total/3600), m = Math.floor((total%3600)/60), s = total%60;
  return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
               : `${m}:${String(s).padStart(2,'0')}`;
}

export function fmtDelta(min){
  const s = Math.round(Math.abs(min) * 60);
  return (min < 0 ? '−' : '+') + (s >= 3600 ? `${Math.floor(s/3600)}:${String(Math.floor(s%3600/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}` : `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`);
}

export function daysWord(n){
  const t = n % 10, h = n % 100;
  if(h >= 11 && h <= 14) return 'дней';
  if(t === 1) return 'день';
  if(t >= 2 && t <= 4) return 'дня';
  return 'дней';
}

export function pluralVisits(n){
  const mod10 = n % 10, mod100 = n % 100;
  if(mod10 === 1 && mod100 !== 11) return 'визит';
  if([2,3,4].includes(mod10) && ![12,13,14].includes(mod100)) return 'визита';
  return 'визитов';
}

export function monthsWord(n){
  const t = n % 10, h = n % 100;
  if(h >= 11 && h <= 14) return 'месяцев';
  if(t === 1) return 'месяц';
  if(t >= 2 && t <= 4) return 'месяца';
  return 'месяцев';
}

// Геокодер иногда отдаёт вместо города административную единицу:
// «Theewaterskloof Local Municipality», «городской округ Самара», «Comune di Lucca».
// Служебные слова убираем, само название оставляем. Районы и сельсоветы
// («Ак-Суйский район») так не лечатся — их показывает «Проверка данных».
const PLACE_NAME_TRIM = [
  /\s+(local|district|metropolitan|regional|city|town)\s+municipality$/i,
  /\s+municipality$/i,
  /^municipality\s+of\s+/i,
  /^(городской|муниципальный)\s+округ\s+(город\s+)?/i,
  /\s+(городской|муниципальный)\s+округ$/i,
  /^муниципальное\s+образование\s+(город\s+)?/i,
  /^(comune|città|citta)\s+di\s+/i,
  /^(gemeinde|stadt|markt)\s+/i,
  /^(ville|commune)\s+de\s+/i,
  /^(municipio|municipalidad)\s+de\s+/i,
];
export function cleanPlaceName(name){
  let s = String(name == null ? '' : name).trim();
  if(!s) return s;
  for(const re of PLACE_NAME_TRIM){ const t = s.replace(re, '').trim(); if(t && t !== s){ s = t; } }
  return s;
}
// Похоже на район или сельсовет, а не на населённый пункт
export function looksLikeAdminArea(name){
  return /(municipality|district|county|район|сельск(ий|ое)\s+(совет|поселение)|сельсовет|поселение|городской округ|муниципальн)/i.test(String(name || ''));
}
// Догадка, какой посёлок имелся в виду под названием района или сельсовета:
// «Мирский сельский Совет» → «Мир», «Кочкорский район» → «Кочкор». Только
// подсказка для поиска — пользователь видит и правит её перед поиском.
const ADMIN_WORD = /^(сельск|район|муницип|сельсовет|совет|округ|поселени|городск|local|municipality|district|county|rural)/i;
export function placeStemGuess(name){
  const words = cleanPlaceName(name).split(/\s+/).filter(Boolean);
  const head = [];
  for(const w of words){ if(ADMIN_WORD.test(w)) break; head.push(w); }
  if(!head.length) return words.filter(w => !ADMIN_WORD.test(w)).join(' ') || cleanPlaceName(name);
  if(head.length === 1) return head[0].replace(/(?<=[а-яё]{2})(ский|цкий|ской|ская|ское)$/i, '') || head[0];
  return head.join(' ');
}

// ---------- точные даты (необязательные) ----------
// У записи по-прежнему главные год и месяц; точные даты — дополнение:
// dateFrom и dateTo в виде 'ГГГГ-ММ-ДД'. Здесь — разбор, подпись и счёт дней.
const MONTHS_GEN = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
export function parseIsoDate(s){
  if(typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d), dt = new Date(t);
  if(dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return { y, m, d, t };
}
// «12 сен 2025», «12–18 сен 2025», «28 июн – 3 июл 2025», «30 дек 2024 – 2 янв 2025»
export function formatDateRange(from, to){
  const a = parseIsoDate(from);
  if(!a) return null;
  const b = parseIsoDate(to);
  if(!b || b.t <= a.t) return `${a.d} ${MONTHS_GEN[a.m - 1]} ${a.y}`;
  if(a.y === b.y && a.m === b.m) return `${a.d}–${b.d} ${MONTHS_GEN[a.m - 1]} ${a.y}`;
  if(a.y === b.y) return `${a.d} ${MONTHS_GEN[a.m - 1]} – ${b.d} ${MONTHS_GEN[b.m - 1]} ${a.y}`;
  return `${a.d} ${MONTHS_GEN[a.m - 1]} ${a.y} – ${b.d} ${MONTHS_GEN[b.m - 1]} ${b.y}`;
}
// дней включительно: 12–18 сентября — 7 дней
export function daysInclusive(from, to){
  const a = parseIsoDate(from), b = parseIsoDate(to || from);
  if(!a || !b || b.t < a.t) return a ? 1 : 0;
  return Math.round((b.t - a.t) / 86400000) + 1;
}
// Общий размах дат у набора записей (поездка): с первого dateFrom по последний
// dateTo (или dateFrom). Записи без точных дат не учитываются; нет ни одной — null
export function dateSpan(entries){
  let lo = null, hi = null;
  (entries || []).forEach(e => {
    const a = parseIsoDate(e && e.dateFrom);
    if(!a) return;
    const b = parseIsoDate(e.dateTo);
    const end = b && b.t >= a.t ? e.dateTo : e.dateFrom;
    if(!lo || e.dateFrom < lo) lo = e.dateFrom;
    if(!hi || end > hi) hi = end;
  });
  return lo ? { from: lo, to: hi, days: daysInclusive(lo, hi) } : null;
}
// Местная дата места по UTC-времени и долготе (15° ≈ час): трек, начатый
// поздним вечером в другой стране, не «переезжает» на следующий день
export function localDateAt(ms, lng){
  if(!isFinite(ms)) return null;
  const off = isFinite(lng) ? Math.round(lng / 15) : 0;
  return new Date(ms + off * 3600000).toISOString().slice(0, 10);
}

// ---------- форма записи ----------
// Пригодна ли запись к показу вообще: объект одного из трёх типов.
export const ENTRY_TYPES = ['country', 'city', 'route'];
export function isUsableEntry(e){
  return !!e && typeof e === 'object' && !Array.isArray(e) && ENTRY_TYPES.includes(e.type);
}
const finiteNum = v => { const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v; return typeof n === 'number' && Number.isFinite(n) ? n : null; };
const validLat = v => { const n = finiteNum(v); return n != null && n >= -90 && n <= 90 ? n : null; };
const validLng = v => { const n = finiteNum(v); return n != null && n >= -180 && n <= 180 ? n : null; };
// Приводит поля записи к ожидаемым типам на месте; возвращает true, если что-то
// поменялось. Значения, которые нельзя понять, убираются, а не угадываются.
export function normalizeEntryShape(e){
  let ch = false;
  const set = (k, v) => { if(e[k] !== v){ if(v === undefined) delete e[k]; else e[k] = v; ch = true; } };
  if(typeof e.name !== 'string') set('name', e.name == null ? '' : String(e.name));
  ['trip', 'countryKey', 'notes', 'company', 'purpose', 'season', 'activity', 'community', 'instagramUrl', 'mapLinkUrl', 'docLinkUrl', 'terrain'].forEach(k => {
    if(e[k] != null && typeof e[k] !== 'string') set(k, typeof e[k] === 'number' ? String(e[k]) : undefined);
  });
  if(e.photos != null && !Array.isArray(e.photos)) set('photos', typeof e.photos === 'string' && e.photos ? [e.photos] : []);
  if(Array.isArray(e.photos) && e.photos.some(p => typeof p !== 'string')) set('photos', e.photos.filter(p => typeof p === 'string'));
  if(e.favorite != null && typeof e.favorite !== 'boolean') set('favorite', e.favorite === true || e.favorite === 'true' || e.favorite === 1);
  if(e.hidden != null && typeof e.hidden !== 'boolean') set('hidden', !!e.hidden);
  if(e.tripOrder != null && finiteNum(e.tripOrder) == null) set('tripOrder', undefined);
  else if(e.tripOrder != null && typeof e.tripOrder !== 'number') set('tripOrder', finiteNum(e.tripOrder));
  if(e.type === 'city' || e.lat != null || e.lng != null){
    const la = validLat(e.lat), lo = validLng(e.lng);
    if(la == null || lo == null){ if(e.lat != null || e.lng != null){ set('lat', null); set('lng', null); } }
    else { if(e.lat !== la) set('lat', la); if(e.lng !== lo) set('lng', lo); }
  }
  if(e.type === 'route'){
    if(e.coordsEncoded != null && typeof e.coordsEncoded !== 'string') set('coordsEncoded', undefined);
    if(e.waypointNames != null || e.waypointCoords != null || e.waypointCountryKeys != null){
      const names = Array.isArray(e.waypointNames) ? e.waypointNames : [];
      const n = names.length;
      const nn = names.map(x => typeof x === 'string' ? x : x == null ? '' : String(x));
      const cs = Array.isArray(e.waypointCoords) ? e.waypointCoords : [];
      const nc = nn.map((_, i) => { const c = cs[i]; if(!Array.isArray(c)) return null; const la = validLat(c[0]), lo = validLng(c[1]); return la == null || lo == null ? null : [la, lo]; });
      const ks = Array.isArray(e.waypointCountryKeys) ? e.waypointCountryKeys : [];
      const nk = nn.map((_, i) => typeof ks[i] === 'string' && ks[i] ? ks[i] : null);
      if(!n){ set('waypointNames', undefined); set('waypointCoords', undefined); set('waypointCountryKeys', undefined); }
      else {
        if(JSON.stringify(nn) !== JSON.stringify(e.waypointNames)) set('waypointNames', nn);
        if(JSON.stringify(nc) !== JSON.stringify(e.waypointCoords)) set('waypointCoords', nc);
        if(JSON.stringify(nk) !== JSON.stringify(e.waypointCountryKeys)) set('waypointCountryKeys', nk);
      }
    }
    if(e.profile != null && !(Array.isArray(e.profile) && e.profile.every(p => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])))) set('profile', undefined);
    if(e.durationMin != null && !(e.durationMin > 0)) set('durationMin', null);
    if(e.elevationGain != null && typeof e.elevationGain === 'string') set('elevationGain', finiteNum(e.elevationGain));
  }
  return ch;
}
