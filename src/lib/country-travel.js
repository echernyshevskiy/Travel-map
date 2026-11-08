// Практическая справка о стране для карточки: подойдёт ли вилка, напряжение,
// экстренные номера, разница во времени с домом (с переходами на летнее время).
// Чистые функции — модульные тесты в unit/country-travel.test.js.

// Какие розетки принимают вилку данного типа (по IEC World Plugs):
// плоская европейская C входит почти везде в Европе и не только; «толстая» F — в E и F.
const PLUG_FITS = { A: 'AB', B: 'B', C: 'CEFHJKLN', D: 'D', E: 'E', F: 'EF', G: 'G', H: 'H', I: 'I', J: 'J', K: 'K', L: 'L', M: 'M', N: 'N' };

// Подойдут ли домашние вилки к розеткам страны:
// 'same' — любая домашняя вилка входит хотя бы в одну розетку страны;
// 'some' — подходят не все (например, плоская C — да, толстая F — нет);
// 'none' — нужен переходник; null — нет данных.
export function plugCompat(homePlugs, plugs){
  if(!homePlugs || !plugs) return null;
  const home = [...homePlugs], sockets = [...plugs];
  const fits = home.filter(h => sockets.some(s => (PLUG_FITS[h] || h).includes(s)));
  return { level: fits.length === home.length ? 'same' : fits.length ? 'some' : 'none', fits, nofit: home.filter(h => !fits.includes(h)) };
}

// «999/112» → ['999', '112']; при едином 112 само 112 из списков служб убираем
const alts = (s, drop112) => (s ? String(s).split('/').map(x => x.trim()).filter(x => x && !(drop112 && x === '112')) : []);
// Экстренные номера для показа: { single, services: [[служба, номера]], mobile112 }
export function emergencyLines(em){
  if(!em) return null;
  const main = em.n112 === 'main';
  const services = [['полиция', alts(em.p, main)], ['скорая', alts(em.a, main)], ['пожарные', alts(em.f, main)]].filter(([, n]) => n.length);
  // один номер на всё (911, 000, 112): скорая и пожарные не указаны отдельно
  if(!main && services.length === 1 && services[0][0] === 'полиция' && !em.a && !em.f) return { single: services[0][1], services: [], mobile112: em.n112 === 'mobile' };
  return { single: main ? ['112'] : null, services, mobile112: em.n112 === 'mobile' };
}

// ---- время ----
const offsetFmt = new Map();
// смещение пояса от UTC в минутах в момент date (учитывает летнее время)
export function tzOffsetMin(tz, date){
  let f = offsetFmt.get(tz);
  if(!f){ f = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }); offsetFmt.set(tz, f); }
  const name = (f.formatToParts(date).find(p => p.type === 'timeZoneName') || {}).value || 'GMT';
  const m = name.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  return m ? (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + (+m[3] || 0)) : 0;
}
// разница «там минус дома» в минутах
export const tzDiffMin = (tz, homeTz, date) => tzOffsetMin(tz, date) - tzOffsetMin(homeTz, date);

// «+5 ч», «−2 ч», «+3 ч 30 мин», «0 ч»
export function formatDiff(min){
  if(!min) return '0 ч';
  const s = min > 0 ? '+' : '−', a = Math.abs(min), h = Math.floor(a / 60), m = a % 60;
  return s + (h ? h + ' ч' : '') + (m ? (h ? ' ' : '') + m + ' мин' : '');
}

// Разница с домом сейчас и как она меняется за год: { now, winter, summer, next: { date, diff } | null }.
// next — ближайшая дата (в пределах года), когда разница сменится: перевод часов там или дома.
export function timeDiffInfo(tz, homeTz, now = new Date()){
  const y = now.getUTCFullYear();
  const d = date => tzDiffMin(tz, homeTz, date);
  const cur = d(now);
  const jan = d(new Date(Date.UTC(y, 0, 15))), jul = d(new Date(Date.UTC(y, 6, 15)));
  let next = null;
  if(jan !== jul){
    const DAY = 864e5;
    let lo = now.getTime(), hi = null;
    for(let t = lo + 7 * DAY; t <= lo + 372 * DAY; t += 7 * DAY){ if(d(new Date(t)) !== cur){ hi = t; break; } lo = t; }
    if(hi !== null){
      while(hi - lo > 3600e3){ const mid = (lo + hi) / 2; if(d(new Date(mid)) !== cur) hi = mid; else lo = mid; }
      next = { date: new Date(hi), diff: d(new Date(hi)) };
    }
  }
  // «зима/лето» — по северному полушарию, как привычно; для южного это просто два значения
  return { now: cur, winter: jan, summer: jul, next };
}
