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
