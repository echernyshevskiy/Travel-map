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
