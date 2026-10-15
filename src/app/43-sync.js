// ---------- синхронизация через GitHub ----------
// Схема «сначала локально»: данные по-прежнему живут в браузере, приложение
// целиком работает без сети. Синхронизация — отдельный шаг: забрать файл из
// закрытого репозитория, слить по записям, вернуть результат. Каждая запись
// несёт время последней правки (updatedAt), удаления помнятся отдельно
// (syncTombstones) — поэтому правки с разных устройств, сделанные офлайн,
// складываются, а не затирают друг друга. При правке одной и той же записи
// на двух устройствах побеждает более поздняя.
const SYNC_KEY = 'travel-map-sync';
const SYNC_FILE = 'travel-data.json';
const SYNC_FORMAT = 'travel-map-sync';
let applyingRemote = false;
let syncReplacing = false; // показана форма замены токена
let syncBase = null; // опорный снимок: что было сохранено в прошлый раз

function readSyncConfig(){
  try{ const c = JSON.parse(localStorage.getItem(SYNC_KEY) || 'null'); return c && c.repo && c.token ? c : null; }
  catch(e){ return null; }
}
function writeSyncConfig(c){
  try{ if(c) localStorage.setItem(SYNC_KEY, JSON.stringify(c)); else localStorage.removeItem(SYNC_KEY); }catch(e){}
}
function syncPatch(fields){ const c = readSyncConfig(); if(c){ Object.assign(c, fields); writeSyncConfig(c); } }

function snapshotSyncBase(){
  syncBase = {
    entries: new Map(allEntries.map(e => [e.id, itemJson(e)])),
    races: new Map(races.map(r => [r.id, itemJson(r)])),
    tripMeta: new Map(Object.keys(tripMeta).map(k => [k, itemJson(tripMeta[k])]))
  };
}
// Вызывается при каждом сохранении: что изменилось с прошлого раза — получает
// отметку времени, что исчезло — попадает в список удалённых
function stampSyncChanges(){
  if(READ_ONLY) return 0;
  if(!syncBase || applyingRemote){ snapshotSyncBase(); return 0; }
  const now = Date.now();
  let changed = 0;
  const diff = (kind, pairs) => {
    const base = syncBase[kind];
    const seen = new Set();
    pairs.forEach(([id, obj])=>{
      seen.add(id);
      if(!obj || typeof obj !== 'object') return;
      const before = base.get(id);
      if(before !== itemJson(obj)){
        // какие именно поля поменялись — чтобы правки разных полей одной записи
        // на двух устройствах сложились, а не одна затёрла другую
        if(before){
          let old = null;
          try{ old = JSON.parse(before); }catch(e){}
          if(old){
            if(!obj.fieldTimes) obj.ftBase = obj.updatedAt || 0;
            const ft = Object.assign({}, obj.fieldTimes || {});
            new Set([...Object.keys(old), ...Object.keys(obj)]).forEach(k => {
              if(SYNC_META.has(k)) return;
              if(JSON.stringify(old[k]) !== JSON.stringify(obj[k])) ft[k] = now;
            });
            obj.fieldTimes = ft;
          }
        }
        obj.updatedAt = now; delete syncTombstones[kind][id]; changed++;
      }
    });
    base.forEach((_, id) => { if(!seen.has(id)){ syncTombstones[kind][id] = now; changed++; } });
  };
  diff('entries', allEntries.map(e => [e.id, e]));
  diff('races', races.map(r => [r.id, r]));
  diff('tripMeta', Object.keys(tripMeta).map(k => [k, tripMeta[k]]));
  snapshotSyncBase();
  return changed;
}
function afterLocalSave(changed){
  const cfg = readSyncConfig();
  if(cfg && changed){
    syncPatch({ pending: (cfg.pending || 0) + changed });
    scheduleSync(6000); // серия быстрых правок уходит одним сохранением
  }
  renderSyncStatus();
}

// ---- обмен с GitHub ----
function utf8ToB64(str){
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for(let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function b64ToUtf8(b64){
  const bin = atob(String(b64).replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for(let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
function parseRepo(input){
  const m = String(input || '').trim().replace(/\.git$/, '').replace(/\/+$/, '')
    .match(/^(?:https?:\/\/github\.com\/)?([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100})$/);
  return m ? `${m[1]}/${m[2]}` : null;
}
class SyncError extends Error{
  constructor(message, kind){ super(message); this.kind = kind; }
}
async function gh(cfg, method, apiPath, body){
  let res;
  try{
    res = await fetch('https://api.github.com' + apiPath, {
      method, cache: 'no-store',
      headers: Object.assign({ 'Accept': 'application/vnd.github+json', 'Authorization': 'Bearer ' + cfg.token },
                             body ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined
    });
  }catch(e){
    throw new SyncError('Нет связи с GitHub — синхронизирую, когда появится сеть', 'offline');
  }
  // GitHub сообщает срок действия fine-grained токена (если браузеру этот заголовок доступен)
  const exp = res.headers.get('github-authentication-token-expiration');
  if(exp && readSyncConfig() && readSyncConfig().tokenExpires !== exp) syncPatch({ tokenExpires: exp });
  return res;
}
function ghFail(res, where){
  if(res.status === 401) return new SyncError('Токен не подходит или его срок истёк — создайте новый токен на GitHub', 'auth');
  if(res.status === 403) return new SyncError('Нет доступа: у токена должно быть право Contents: Read and write на этот репозиторий', 'auth');
  if(res.status === 404) return new SyncError('Репозиторий не найден — проверьте имя и что токен выдан именно на него', 'auth');
  if(res.status === 409 || res.status === 422) return new SyncError('Файл на GitHub успел измениться', 'conflict');
  return new SyncError(`GitHub ответил ошибкой ${res.status}${where ? ' (' + where + ')' : ''} — попробую позже`, 'server');
}
const repoPath = repo => '/repos/' + repo.split('/').map(encodeURIComponent).join('/');
async function fetchRemote(cfg){
  const res = await gh(cfg, 'GET', `${repoPath(cfg.repo)}/contents/${SYNC_FILE}`);
  if(res.status === 404){
    // файла ещё нет — но репозиторий должен существовать
    const repoRes = await gh(cfg, 'GET', repoPath(cfg.repo));
    if(!repoRes.ok) throw ghFail(repoRes, 'репозиторий');
    return { sha: null, data: null };
  }
  if(!res.ok) throw ghFail(res, 'чтение');
  const meta = await res.json();
  let text;
  if(meta.content && meta.encoding === 'base64') text = b64ToUtf8(meta.content);
  else{
    // файлы больше 1 МБ API отдаёт без содержимого — берём через git blob
    const blobRes = await gh(cfg, 'GET', `${repoPath(cfg.repo)}/git/blobs/${meta.sha}`);
    if(!blobRes.ok) throw ghFail(blobRes, 'чтение');
    text = b64ToUtf8((await blobRes.json()).content);
  }
  let data;
  try{ data = JSON.parse(text); }catch(e){ throw new SyncError('Файл на GitHub повреждён — синхронизация остановлена, локальные данные не тронуты', 'data'); }
  if(!data || !Array.isArray(data.entries)) throw new SyncError('Файл на GitHub не похож на данные карты — синхронизация остановлена', 'data');
  return { sha: meta.sha, data };
}
// по строке на запись — история изменений на GitHub читается построчно
function serializeSync(d){
  const list = arr => '[\n' + arr.map(x => JSON.stringify(x)).join(',\n') + '\n]';
  return '{"format":"' + SYNC_FORMAT + '","version":1,' +
    '"savedAt":' + JSON.stringify(new Date().toISOString()) + ',' +
    '"device":' + JSON.stringify(syncDeviceLabel()) + ',\n' +
    '"entries":' + list(d.entries) + ',\n' +
    '"races":' + list(d.races) + ',\n' +
    '"tripMeta":' + JSON.stringify(d.tripMeta) + ',\n' +
    '"tombstones":' + JSON.stringify(d.tombstones) + '\n}\n';
}
async function putRemote(cfg, text, sha, message){
  const res = await gh(cfg, 'PUT', `${repoPath(cfg.repo)}/contents/${SYNC_FILE}`,
    Object.assign({ message, content: utf8ToB64(text) }, sha ? { sha } : {}));
  if(!res.ok) throw ghFail(res, 'запись');
  return (await res.json()).content.sha;
}
function syncDeviceLabel(){
  const ua = navigator.userAgent || '';
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iOS' : /Windows/i.test(ua) ? 'Windows'
           : /Mac OS X/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : 'устройство';
  return os;
}

// ---- слияние ----
function currentSyncData(){
  return { entries: allEntries, races, tripMeta, tombstones: syncTombstones };
}
// отпечаток для сравнения «по существу»: порядок записей и ключей не важен
function syncFingerprint(d){
  const parts = [];
  d.entries.forEach(e => parts.push('e:' + e.id + ':' + (e.updatedAt || 0) + ':' + itemJson(e)));
  d.races.forEach(r => parts.push('r:' + r.id + ':' + (r.updatedAt || 0) + ':' + itemJson(r)));
  Object.keys(d.tripMeta).forEach(k => parts.push('m:' + k + ':' + JSON.stringify(d.tripMeta[k])));
  ['entries','races','tripMeta'].forEach(kind => Object.keys(d.tombstones[kind] || {}).forEach(id => parts.push('t:' + kind + ':' + id + ':' + d.tombstones[kind][id])));
  return parts.sort().join('\n');
}
function mergeSyncData(local, remoteRaw){
  // данные с GitHub проходят ту же проверку и нормализацию, что импорт файла
  const remoteEntries = (remoteRaw.entries || [])
    .filter(x => x && typeof x.id === 'string' && x.type && x.name)
    .map(x => migrateEntry(JSON.parse(JSON.stringify(x))));
  const remoteRaces = (Array.isArray(remoteRaw.races) ? remoteRaw.races : []).map(sanitizeRace).filter(Boolean);
  const remoteMeta = (remoteRaw.tripMeta && typeof remoteRaw.tripMeta === 'object') ? remoteRaw.tripMeta : {};
  const remoteTomb = normalizeTombstones(remoteRaw.tombstones);
  const e = mergeKind(local.entries.map(x => [x.id, x]), remoteEntries.map(x => [x.id, x]), local.tombstones.entries, remoteTomb.entries);
  const r = mergeKind(local.races.map(x => [x.id, x]), remoteRaces.map(x => [x.id, x]), local.tombstones.races, remoteTomb.races);
  const m = mergeKind(Object.keys(local.tripMeta).map(k => [k, local.tripMeta[k]]), Object.keys(remoteMeta).map(k => [k, remoteMeta[k]]),
                      local.tombstones.tripMeta, remoteTomb.tripMeta);
  return {
    entries: e.pairs.map(p => p[1]),
    races: r.pairs.map(p => p[1]),
    tripMeta: Object.fromEntries(m.pairs),
    tombstones: { entries: e.tomb, races: r.tomb, tripMeta: m.tomb }
  };
}
async function applyMergedLocally(merged){
  const before = new Map(allEntries.map(e => [e.id, itemJson(e)]));
  allEntries = merged.entries.map(x => JSON.parse(JSON.stringify(x)));
  races = merged.races.map(x => JSON.parse(JSON.stringify(x)));
  tripMeta = JSON.parse(JSON.stringify(merged.tripMeta));
  syncTombstones = normalizeTombstones(merged.tombstones);
  let added = 0, updated = 0, removed = 0;
  const now = new Set();
  allEntries.forEach(e => { now.add(e.id); if(!before.has(e.id)) added++; else if(before.get(e.id) !== itemJson(e)) updated++; });
  before.forEach((_, id) => { if(!now.has(id)) removed++; });
  applyingRemote = true;
  try{ await saveData(); } finally{ applyingRemote = false; }
  rebuildAll();
  if(document.getElementById('tableModal') && document.getElementById('tableModal').style.display !== 'none') renderTable();
  const parts = [];
  if(added) parts.push(`новых ${added}`);
  if(updated) parts.push(`изменено ${updated}`);
  if(removed) parts.push(`удалено ${removed}`);
  return parts;
}

// ---- запуск ----
let syncRunning = null, syncAgain = false, syncTimer = null, syncState = 'idle';
function scheduleSync(delay){
  if(READ_ONLY || !readSyncConfig()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(()=> syncNow(), delay == null ? 4000 : delay);
}
async function syncNow(opts){
  opts = opts || {};
  const cfg = readSyncConfig();
  if(READ_ONLY || !cfg) return false;
  if(syncRunning){ syncAgain = true; return syncRunning; }
  if(navigator.onLine === false){ syncState = 'offline'; renderSyncStatus(); return false; }
  syncRunning = (async ()=>{
    syncState = 'running'; renderSyncStatus();
    const pendingAtStart = cfg.pending || 0;
    try{
      for(let attempt = 0; attempt < 4; attempt++){
        const remote = await fetchRemote(cfg);
        const local = currentSyncData();
        const merged = remote.data ? mergeSyncData(local, remote.data) : local;
        let incoming = [];
        if(syncFingerprint(merged) !== syncFingerprint(local)) incoming = await applyMergedLocally(merged);
        const remoteNorm = remote.data ? mergeSyncData({ entries: [], races: [], tripMeta: {}, tombstones: normalizeTombstones(null) }, remote.data) : null;
        if(!remoteNorm || syncFingerprint(currentSyncData()) !== syncFingerprint(remoteNorm)){
          try{
            await putRemote(cfg, serializeSync(currentSyncData()), remote.sha, `Синхронизация: ${syncDeviceLabel()}, записей ${allEntries.length}`);
          }catch(err){
            if(err.kind === 'conflict'){
              // кто-то успел раньше (или GitHub ещё отдаёт прежнюю версию) —
              // чуть ждём, забираем заново и сливаем
              await new Promise(r => setTimeout(r, 600 * (attempt + 1)));
              continue;
            }
            throw err;
          }
        }
        const now = readSyncConfig() || cfg;
        syncPatch({ pending: Math.max(0, (now.pending || 0) - pendingAtStart), lastSyncAt: Date.now(), lastError: null });
        markBackupDone(); // история версий на GitHub — та же резервная копия
        syncState = 'ok';
        if(incoming.length && !opts.quiet) toast('С другого устройства: ' + incoming.join(', '));
        return true;
      }
      throw new SyncError('Файл на GitHub всё время меняется — попробую позже', 'server');
    }catch(err){
      syncPatch({ lastError: err.message || String(err) });
      syncState = err.kind === 'offline' ? 'offline' : 'error';
      if(opts.manual) toast(err.message || 'Синхронизация не удалась');
      return false;
    }finally{
      syncRunning = null;
      renderSyncStatus();
      if(syncAgain){ syncAgain = false; scheduleSync(1500); }
    }
  })();
  return syncRunning;
}

function agoText(ts){
  const s = Math.round((Date.now() - ts) / 1000);
  if(s < 60) return 'только что';
  const m = Math.round(s / 60);
  if(m < 60) return `${m} мин назад`;
  const h = Math.round(m / 60);
  if(h < 24) return `${h} ч назад`;
  return new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}
function renderSyncStatus(){
  const box = document.getElementById('syncStatus');
  if(!box) return;
  const cfg = readSyncConfig();
  document.getElementById('syncConnectForm').style.display = (cfg && !syncReplacing) ? 'none' : 'block';
  document.getElementById('syncConnected').style.display = cfg ? 'block' : 'none';
  const dot = document.getElementById('mnavSyncDot');
  box.className = 'sync-status';
  const hint = document.getElementById('backupHint');
  if(hint) hint.textContent = cfg
    ? 'Данные синхронизируются с закрытым репозиторием на GitHub, там же хранится история версий. Файл — дополнительная подстраховка.'
    : 'Отметки хранятся только в этом браузере на этом устройстве. Файл — подстраховка на случай очистки данных или смены телефона: храните его у себя.';
  if(!cfg){
    box.innerHTML = 'Не подключено — данные только на этом устройстве';
    if(dot) dot.classList.remove('on');
    return;
  }
  const pending = cfg.pending || 0;
  let main, cls;
  if(syncState === 'running'){ main = 'Синхронизация…'; cls = ''; }
  else if(syncState === 'error'){ main = '⚠ ' + escapeHtml(cfg.lastError || 'Синхронизация не удалась'); cls = 'err'; }
  else if(syncState === 'offline' || navigator.onLine === false){
    main = pending ? `Нет сети — не отправлено изменений: <b>${pending}</b>. Отправлю, когда сеть появится` : 'Нет сети — синхронизирую, когда появится';
    cls = 'warn';
  }
  else if(pending){ main = `Не отправлено изменений: <b>${pending}</b>`; cls = 'warn'; }
  else if(cfg.lastSyncAt){ main = `✓ Синхронизировано ${agoText(cfg.lastSyncAt)}`; cls = 'ok'; }
  else { main = 'Подключено, ещё не синхронизировалось'; cls = ''; }
  // срок токена: за две недели до конца — предупреждаем заранее
  let tokenLine = '', tokenSoon = false;
  const expAt = parseTokenExpiry(cfg.tokenExpires);
  if(isFinite(expAt)){
    const days = Math.ceil((expAt - Date.now()) / 86400000);
    const when = new Date(expAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    tokenSoon = days <= 14;
    tokenLine = days < 0 ? `Срок токена истёк ${when} — создайте новый` : tokenSoon ? `⚠ Токен действует до ${when} (осталось ${days} дн.) — пора создать новый` : `токен до ${when}`;
    if(tokenSoon && cls !== 'err') cls = 'warn';
  }
  box.classList.add(cls || 'plain');
  box.innerHTML = `${main}${tokenSoon ? `<br>${escapeHtml(tokenLine)}` : ''}<small>${escapeHtml(cfg.repo)} · ${SYNC_FILE}${tokenLine && !tokenSoon ? ' · ' + escapeHtml(tokenLine) : ''}</small>`;
  if(dot) dot.classList.toggle('on', syncState === 'error' || tokenSoon || (pending > 0 && syncState !== 'running'));
}

async function connectSync(){
  const repo = parseRepo(document.getElementById('syncRepoInput').value);
  const token = document.getElementById('syncTokenInput').value.trim();
  const expVal = document.getElementById('syncTokenExpInput').value;
  if(!repo){ toast('Укажите репозиторий в виде «логин/имя» или ссылкой на него'); return; }
  if(token.length < 20){ toast('Вставьте токен целиком — он начинается с github_pat_'); return; }
  const btn = document.getElementById('syncConnectBtn');
  btn.disabled = true; btn.textContent = 'Проверяю доступ…';
  try{
    const cfg = { repo, token };
    const res = await gh(cfg, 'GET', repoPath(repo));
    if(!res.ok) throw ghFail(res, 'репозиторий');
    const info = await res.json();
    if(!info.private){
      toast('Репозиторий публичный — данные увидят все. Сделайте его закрытым (Settings → Danger Zone → Change visibility) и подключитесь снова');
      return;
    }
    const remote = await fetchRemote(cfg);
    // первая встреча двух непустых наборов — на всякий случай сохраняем свой
    if(remote.data && remote.data.entries.length && allEntries.length){
      try{ downloadBackup('-до-синхронизации', true); }catch(e){}
    }
    const prev = readSyncConfig();
    // срок из заголовка GitHub (если браузеру он доступен) точнее введённого вручную
    const headerExp = res.headers.get('github-authentication-token-expiration');
    const tokenExpires = headerExp || (expVal ? expVal + 'T23:59:00' : null);
    if(prev && prev.repo === repo){
      syncPatch({ token, tokenExpires, lastError: null });
      syncReplacing = false;
      document.getElementById('syncTokenInput').value = '';
      document.getElementById('syncTokenExpInput').value = '';
      syncState = 'idle';
      renderSyncStatus();
      const ok = await syncNow({ manual: true, quiet: true });
      if(ok) toast('Токен заменён, синхронизация работает');
      return;
    }
    writeSyncConfig({ repo, token, tokenExpires, pending: allEntries.length ? 1 : 0, connectedAt: Date.now() });
    syncReplacing = false;
    document.getElementById('syncTokenInput').value = '';
    document.getElementById('syncTokenExpInput').value = '';
    renderSyncStatus();
    const ok = await syncNow({ manual: true, quiet: true });
    if(ok) toast(remote.data ? `Подключено: данные объединены, записей ${allEntries.length}` : 'Подключено: данные отправлены в репозиторий');
  }catch(err){
    toast(err.message || 'Не удалось подключиться');
  }finally{
    btn.disabled = false; btn.textContent = 'Подключить';
  }
}

(function setupSync(){
  const section = document.getElementById('syncSection');
  if(READ_ONLY){ if(section) section.style.display = 'none'; return; }
  document.getElementById('syncConnectBtn').addEventListener('click', connectSync);
  document.getElementById('syncNowBtn').addEventListener('click', ()=> syncNow({ manual: true }));
  document.getElementById('syncHistoryBtn').addEventListener('click', ()=>{
    const cfg = readSyncConfig();
    if(cfg) window.open(`https://github.com/${cfg.repo}/commits/HEAD/${SYNC_FILE}`, '_blank', 'noopener');
  });
  document.getElementById('syncReplaceTokenBtn').addEventListener('click', ()=>{
    const cfg = readSyncConfig();
    syncReplacing = !syncReplacing;
    if(cfg) document.getElementById('syncRepoInput').value = cfg.repo;
    renderSyncStatus();
    if(syncReplacing) document.getElementById('syncTokenInput').focus();
  });
  document.getElementById('syncDisconnectBtn').addEventListener('click', ()=>{
    if(!confirm('Отключить синхронизацию на этом устройстве? Данные здесь останутся, файл на GitHub тоже. Токен будет удалён из этого браузера.')) return;
    writeSyncConfig(null);
    syncState = 'idle';
    renderSyncStatus();
    toast('Синхронизация отключена на этом устройстве');
  });
  window.addEventListener('online', ()=>{ syncState = 'idle'; renderSyncStatus(); scheduleSync(800); });
  window.addEventListener('offline', ()=>{ syncState = 'offline'; renderSyncStatus(); });
  document.addEventListener('visibilitychange', ()=>{
    if(document.visibilityState !== 'visible') return;
    const cfg = readSyncConfig();
    if(cfg && (!cfg.lastSyncAt || Date.now() - cfg.lastSyncAt > 60000 || cfg.pending)) scheduleSync(300);
  });
  // статус «N мин назад» обновляем, пока страница открыта
  setInterval(()=>{ if(document.visibilityState === 'visible') renderSyncStatus(); }, 60000);
})();

