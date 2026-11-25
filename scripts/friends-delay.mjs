// Отложенная публикация для друзей (C2): друзья не видят, где владелец сейчас.
// Записи, которые заканчиваются позже «сегодня минус N дней», в версию для
// друзей не попадают; поездка, которая ещё идёт или закончилась меньше N дней
// назад, скрывается целиком (иначе по первым её дням видно, куда вы поехали).
// Записи без даты публикуются как раньше: про них неизвестно, «сейчас» ли это.
// «Хочу посетить» (wishlist) — это мечты, а не местоположение: не задерживаются,
// даже с датой в будущем. Старты: скрыт тот, что прошёл за последние N дней;
// предстоящие видны, как и раньше (они и так есть в открытых списках участников).
// Сборка по расписанию сама «доберёт» скрытое, когда срок пройдёт.

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const pad = n => String(n).padStart(2, '0');

// последний день, к которому относится запись, — 'ГГГГ-ММ-ДД' или null (даты нет)
export function entryEndDate(e) {
  if (!e || typeof e !== 'object') return null;
  if (ISO.test(e.dateTo || '')) return e.dateTo;
  if (ISO.test(e.dateFrom || '')) {
    // трек на несколько дней: конец — через trackDays − 1 дней после начала
    const days = Number(e.trackDays) > 1 ? Math.floor(Number(e.trackDays)) - 1 : 0;
    if (!days) return e.dateFrom;
    const d = new Date(e.dateFrom + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }
  const y = Number(e.year);
  if (!Number.isInteger(y) || y < 1000) return null;
  const m = Number(e.month);
  if (Number.isInteger(m) && m >= 1 && m <= 12) {
    // известен только месяц — считаем, что запись могла длиться до его конца
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return `${y}-${pad(m)}-${pad(last)}`;
  }
  return `${y}-12-31`;
}

// дата «сегодня минус N дней» в UTC, 'ГГГГ-ММ-ДД'
export function cutoffDate(days, now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

// Что убрать из публикации. allEntries — все записи (и скрытые: их даты тоже
// говорят, что поездка ещё идёт); races — старты. Возвращает множества id и
// названий поездок и id стартов, которые пока не публикуются.
export function delayedSets({ entries, races, days, now = new Date() }) {
  const empty = { entryIds: new Set(), trips: new Set(), raceIds: new Set(), cutoff: null };
  if (!(days > 0)) return empty;
  const cutoff = cutoffDate(days, now);
  const today = cutoffDate(0, now);
  const recent = e => {
    if (e.status === 'wishlist') return false;
    const end = entryEndDate(e);
    return !!end && end > cutoff;
  };
  const trips = new Set((entries || []).filter(e => e && e.trip && recent(e)).map(e => e.trip));
  const entryIds = new Set((entries || []).filter(e => e && (recent(e) || (e.trip && trips.has(e.trip)))).map(e => e.id));
  const raceIds = new Set((races || []).filter(r => r && ISO.test(r.date || '') && r.date > cutoff && r.date <= today).map(r => r.id));
  return { entryIds, trips, raceIds, cutoff };
}
