// Слияние данных при синхронизации: по записям и по отдельным полям,
// с учётом удалений (tombstones), и разбор срока действия токена. unit/sync-merge.test.js.

// updatedAt — время последней правки записи; fieldTimes — время правки отдельных полей;
// ftBase — время, к которому относятся поля без своей отметки
export const SYNC_META = new Set(['updatedAt', 'fieldTimes', 'ftBase']);

export const omitUpdatedAt = (k, v) => SYNC_META.has(k) ? undefined : v;

export function itemJson(x){ return JSON.stringify(x, omitUpdatedAt); }

// Слияние одной записи по полям: у каждого поля берём версию с более поздней
// правкой (fieldTimes), для полей без отметки — время правки всей записи.
export function mergeFields(l, r){
  if(typeof l !== 'object' || typeof r !== 'object' || !l || !r) return (l && (l.updatedAt || 0) > ((r && r.updatedAt) || 0)) ? l : r;
  if(itemJson(l) === itemJson(r)) return (l.updatedAt || 0) > (r.updatedAt || 0) ? l : r;
  const base = x => x.fieldTimes ? (x.ftBase || 0) : (x.updatedAt || 0);
  const lt = k => (l.fieldTimes && l.fieldTimes[k]) || base(l);
  const rt = k => (r.fieldTimes && r.fieldTimes[k]) || base(r);
  const outBase = Math.max(base(l), base(r));
  const out = {}, ft = {};
  new Set([...Object.keys(l), ...Object.keys(r)]).forEach(k => {
    if(SYNC_META.has(k)) return;
    const useLocal = lt(k) > rt(k);
    const src = useLocal ? l : r;
    if(k in src && src[k] !== undefined) out[k] = src[k];
    const t = Math.max(lt(k), rt(k));
    if(t !== outBase) ft[k] = t;
  });
  out.updatedAt = Math.max(l.updatedAt || 0, r.updatedAt || 0);
  if(Object.keys(ft).length){ out.fieldTimes = ft; out.ftBase = outBase; }
  return out;
}

export function mergeKind(localPairs, remotePairs, localTomb, remoteTomb){
  const tomb = Object.assign({}, remoteTomb);
  Object.keys(localTomb).forEach(id => { tomb[id] = Math.max(tomb[id] || 0, localTomb[id]); });
  const L = new Map(localPairs), R = new Map(remotePairs);
  const order = [...L.keys(), ...[...R.keys()].filter(id => !L.has(id))];
  const out = [];
  order.forEach(id=>{
    const l = L.get(id), r = R.get(id);
    // при равном времени правки (в том числе у старых записей без отметки)
    // берём версию с GitHub — это общая точка для всех устройств
    const win = (l && r) ? mergeFields(l, r) : (l || r);
    const t = tomb[id] || 0;
    if(t && t >= (win.updatedAt || 0)) return; // удалено позже последней правки
    if(t) delete tomb[id];                     // правка новее удаления — запись остаётся
    out.push([id, win]);
  });
  return { pairs: out, tomb };
}

// «2026-11-01 00:00:00 UTC», «2026-11-01 00:00:00 -0700» (так пишет GitHub) или «2026-11-01T23:59:00» (введено вручную)
export function parseTokenExpiry(v){
  if(!v) return NaN;
  const m = String(v).trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)\s*(UTC|Z|[+-]\d{2}:?\d{2})?$/);
  if(!m) return Date.parse(v);
  let tz = m[3] || '';
  if(tz === 'UTC') tz = 'Z';
  else if(/^[+-]\d{4}$/.test(tz)) tz = tz.slice(0, 3) + ':' + tz.slice(3);
  return Date.parse(m[1] + 'T' + m[2] + tz);
}
