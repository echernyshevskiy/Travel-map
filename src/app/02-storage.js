// ---------- persistent service-status indicator ----------
const serviceIssues = new Set();
function reportServiceIssue(label){
  serviceIssues.add(label);
  updateServiceStatus();
}
function clearServiceIssue(label){
  if(serviceIssues.delete(label)) updateServiceStatus();
}
function updateServiceStatus(){
  const el = document.getElementById('serviceStatus');
  if(!el) return;
  if(serviceIssues.size === 0){
    el.style.display = 'none';
    return;
  }
  el.textContent = '⚠ Недоступно: ' + [...serviceIssues].join(', ') + ' — работает офлайн-режим (клик по карте)';
  el.style.display = 'block';
}

let pendingGpxList = []; // array of {coords, distanceKm, fileName, elevationGain, maxElevation, durationMin, profile}
let editingId = null;
let activeYears = new Set(); // empty = all
let activePurposes = new Set(); // empty = all
let activeCompanies = new Set(); // empty = all
let activeCommunities = new Set(); // empty = all
let activeSeasons = new Set(); // empty = all
let activeMonths = new Set(); // empty = all
let activeActivities = new Set(); // empty = all (routes only)
let activeStatuses = new Set(); // empty = all
let activeTrips = new Set(); // empty = all, freeform trip tags
let searchQuery = '';

// timeline state
let timelineYears = [];
let timelineIndex = 0;
let timelineMode = 'cumulative'; // 'cumulative' | 'single'
let timelinePlaying = false;
let timelineTimer = null;
let activeLayerTypes = new Set(['country','city','route']);

function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.display = 'block';
  clearTimeout(t._timer);
  t._timer = setTimeout(()=>{ t.style.display='none'; }, 2600);
}

// ---------- storage ----------
// READ_ONLY и запечённые данные — единственное, что отличает read-only сборку
// от обычной. В рабочей сборке плейсхолдеры подставляются как false / [] / {},
// в read-only — как true и реальный экспорт данных на момент сборки.
// Данные лежат в <script type="application/json" id="baked-data"> внутри
// index.html: в рабочей версии там пусто, в версию для друзей их подставляет
// scripts/build-friends.mjs. JSON-тег, а не константы в коде: код сжимается
// сборщиком, и искать в нём строки стало бы ненадёжно.
const BAKED = (() => { try{ return JSON.parse(document.getElementById('baked-data').textContent) || {}; }catch(e){ return {}; } })();
const READ_ONLY = BAKED.readOnly === true;
const BAKED_ENTRIES = Array.isArray(BAKED.entries) ? BAKED.entries : [];
const BAKED_TRIP_META = BAKED.tripMeta && typeof BAKED.tripMeta === 'object' ? BAKED.tripMeta : {};
const BAKED_RACES = Array.isArray(BAKED.races) ? BAKED.races : [];
// Когда данные для версии друзей последний раз сохранялись (из файла синхронизации);
// в основной версии — null.
const BAKED_SAVED_AT = typeof BAKED.savedAt === 'string' ? BAKED.savedAt : null;
let tripMeta = READ_ONLY ? BAKED_TRIP_META : {}; // { [tripName]: { narrative, coverPhoto } }
// Официальные старты — отдельная сущность, намеренно не связанная с картой:
// у многих забегов трека нет вовсе, а маршруты в приложении про путешествия,
// а не про результат. Хранится в том же объекте, что и записи, поэтому
// попадает в резервную копию и восстанавливается вместе с ними.
let races = READ_ONLY ? (Array.isArray(BAKED_RACES) ? BAKED_RACES : []) : [];
// Для синхронизации: когда что удалено (id → время). Без этого удалённая на
// одном устройстве запись «воскресала» бы с другого, где она ещё есть.
let syncTombstones = { entries: {}, races: {}, tripMeta: {} };
function normalizeTombstones(t){
  const out = { entries: {}, races: {}, tripMeta: {} };
  if(t && typeof t === 'object'){
    ['entries','races','tripMeta'].forEach(k=>{
      const src = t[k];
      if(src && typeof src === 'object') Object.keys(src).forEach(id => { const v = +src[id]; if(isFinite(v) && v > 0) out[k][id] = v; });
    });
  }
  return out;
}
const LOCAL_STORAGE_KEY = 'travel-map-data';

function hasClaudeStorage(){
  // проверяем обе операции: saveData пользуется set, и если реализовано только
  // чтение, запись упала бы в ошибку вместо отката на хранилище браузера
  return typeof window.storage !== 'undefined' && window.storage &&
         typeof window.storage.get === 'function' && typeof window.storage.set === 'function';
}

async function loadData(){
  if(READ_ONLY){
    // сборка для друзей и так приходит без скрытых записей и заметок —
    // здесь страховка на случай, если файл собран из полного бэкапа
    allEntries = JSON.parse(JSON.stringify(BAKED_ENTRIES)).filter(e => !e.hidden).map(e => { delete e.notes; return e; });
    tripMeta = JSON.parse(JSON.stringify(BAKED_TRIP_META));
    return;
  }
  // Запасной путь должен срабатывать не только когда хранилища окружения нет,
  // но и когда оно есть и сломано. Раньше обе попытки были в одном try: любая
  // ошибка первой уводила сразу в общий catch, и данные из браузера уже не
  // читались — то есть механизм запасного пути не работал в том самом случае,
  // ради которого задуман.
  if(hasClaudeStorage()){
    try{
      const res = await window.storage.get('travel-data');
      if(res && res.value){
        const parsed = JSON.parse(res.value);
        allEntries = parsed.entries || [];
        tripMeta = parsed.tripMeta || {};
        races = Array.isArray(parsed.races) ? parsed.races : [];
        syncTombstones = normalizeTombstones(parsed.tombstones);
        return;
      }
    }catch(err){
      // штатное переключение, а не сбой: данные читаются из браузера
      console.warn('Хранилище окружения недоступно — читаем из браузера:', err && err.message);
    }
  }
  try{
    // fall back to the browser's own storage — используется при открытии как
    // обычного файла или установленного PWA вне Claude, где window.storage нет
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if(raw){
      const parsed = JSON.parse(raw);
      allEntries = parsed.entries || [];
      tripMeta = parsed.tripMeta || {};
      races = Array.isArray(parsed.races) ? parsed.races : [];
      syncTombstones = normalizeTombstones(parsed.tombstones);
    }
  }catch(e){
    allEntries = [];
    tripMeta = {};
    races = [];
  }
}
// Данные живут в хранилище браузера: очистка данных сайта, переустановка
// приложения или нехватка места на телефоне — и всё пропадёт. Экспорт есть,
// но о нём надо вспомнить. Считаем изменения с последней копии и мягко
// напоминаем — без модальных окон, просто строкой в разделе копий.
const BACKUP_STATE_KEY = 'travel-map-backup-state';
const BACKUP_REMIND_CHANGES = 25;   // столько изменений — уже жаль потерять
const BACKUP_REMIND_DAYS = 30;

function readBackupState(){
  try{ return JSON.parse(localStorage.getItem(BACKUP_STATE_KEY) || '{}') || {}; }
  catch(e){ return {}; }
}
function writeBackupState(s){
  try{ localStorage.setItem(BACKUP_STATE_KEY, JSON.stringify(s)); }catch(e){}
}
// Просим браузер не удалять данные сайта при нехватке места. Без этого
// хранилище «временное»: Chrome на телефоне вправе очистить его сам. Chrome
// решает молча, Firefox может спросить — поэтому просим не при загрузке, а
// при первом сохранении, когда понятно, что человек ведёт здесь свои данные.
let persistRequested = false;
let storagePersisted = null; // null — неизвестно (браузер не сообщает)
function requestPersistentStorage(){
  if(persistRequested || READ_ONLY) return;
  persistRequested = true;
  try{
    if(!navigator.storage || !navigator.storage.persist) return;
    navigator.storage.persisted().then(already => {
      if(already) return true;
      return navigator.storage.persist();
    }).then(granted => { storagePersisted = !!granted; renderBackupReminder(); }).catch(()=>{});
  }catch(e){}
}
function noteDataChanged(){
  if(READ_ONLY) return;
  requestPersistentStorage();
  const s = readBackupState();
  s.changes = (s.changes || 0) + 1;
  writeBackupState(s);
}
function markBackupDone(){
  writeBackupState({ changes: 0, lastAt: new Date().toISOString() });
  renderBackupReminder();
}

function renderBackupReminder(){
  const el = document.getElementById('backupReminder');
  if(!el || READ_ONLY) return;
  // при подключённой синхронизации копии хранятся в истории репозитория
  const syncCfg = (typeof readSyncConfig === 'function') ? readSyncConfig() : null;
  if(syncCfg && syncCfg.lastSyncAt && Date.now() - syncCfg.lastSyncAt < 14 * 86400000){ el.style.display = 'none'; return; }
  const s = readBackupState();
  const changes = s.changes || 0;
  const days = s.lastAt ? Math.floor((Date.now() - new Date(s.lastAt).getTime()) / 86400000) : null;
  const manyChanges = changes >= BACKUP_REMIND_CHANGES;
  const longAgo = s.lastAt && days >= BACKUP_REMIND_DAYS && changes > 0;
  const neverSaved = !s.lastAt && changes >= BACKUP_REMIND_CHANGES;
  if(!manyChanges && !longAgo && !neverSaved){ el.style.display = 'none'; return; }
  const wordChanges = changes === 1 ? 'изменение' : (changes < 5 ? 'изменения' : 'изменений');
  const when = s.lastAt
    ? (days === 0 ? 'сегодня' : days === 1 ? 'вчера' : `${days} дн. назад`)
    : 'копия ещё не скачивалась';
  const volatile = storagePersisted === false ? ' Браузер не гарантирует сохранность при нехватке места.' : '';
  el.innerHTML = `С последней копии: <b>${changes}</b> ${wordChanges} · ${escapeHtml(when)}.<br>Стоит скачать файл — данные хранятся только в этом браузере.${volatile}`;
  el.style.display = 'block';
}

// ---------- журнал изменений ----------
// Сравниваем снимок данных до и после сохранения: так журнал ведётся сам,
// без правки двух десятков мест, которые меняют записи.
const CHANGELOG_KEY = 'travel-map-changelog';
const CHANGELOG_MAX = 300; // храним последние записи, иначе журнал раздуется
let changelogSnapshot = null;

function snapshotForLog(){
  const m = new Map();
  allEntries.forEach(e => m.set(e.id, { name: e.name, type: e.type, year: e.year, month: e.month,
    status: e.status, trip: e.trip, notes: (e.notes||'').length, photos: (e.photos||[]).length }));
  return m;
}
function readChangelog(){
  try{ return JSON.parse(localStorage.getItem(CHANGELOG_KEY) || '[]') || []; }catch(e){ return []; }
}
function writeChangelog(list){
  try{ localStorage.setItem(CHANGELOG_KEY, JSON.stringify(list.slice(0, CHANGELOG_MAX))); }catch(e){}
}
const LOG_FIELD_RU = { name:'название', type:'тип', year:'год', month:'месяц',
  status:'статус', trip:'поездка', notes:'заметка', photos:'фото' };

function recordChangelog(){
  if(READ_ONLY) return;
  const after = snapshotForLog();
  const before = changelogSnapshot;
  changelogSnapshot = after;
  if(!before) return; // первый снимок — сравнивать не с чем
  const events = [];
  const now = new Date().toISOString();
  after.forEach((v, id)=>{
    if(!before.has(id)) events.push({ at: now, act: 'add', id, name: v.name, type: v.type });
  });
  before.forEach((v, id)=>{
    if(!after.has(id)){ events.push({ at: now, act: 'del', id, name: v.name, type: v.type }); return; }
    const now2 = after.get(id);
    const changed = Object.keys(LOG_FIELD_RU).filter(k => v[k] !== now2[k]);
    if(changed.length) events.push({ at: now, act: 'edit', id, name: now2.name, type: now2.type, fields: changed });
  });
  if(events.length === 0) return;
  writeChangelog([...events.reverse(), ...readChangelog()]);
}

async function saveData(){
  if(READ_ONLY){
    toast('Это read-only версия карты — изменения не сохраняются');
    return false;
  }
  // отметить, что изменилось с прошлого сохранения (время правки, удаления) —
  // по этим отметкам синхронизация решает, чья версия записи новее
  const syncChanged = stampSyncChanges();
  const payload = JSON.stringify({entries: allEntries, tripMeta, races, tombstones: syncTombstones});
  // Та же причина, что и при загрузке: сбой хранилища окружения не должен
  // отменять запись в браузер. Пробуем первое, при неудаче идём во второе.
  if(hasClaudeStorage()){
    try{
      const res = await window.storage.set('travel-data', payload, false);
      if(res){
        noteDataChanged();
        renderBackupReminder();
        recordChangelog();
        afterLocalSave(syncChanged);
        return true;
      }
    }catch(err){
      console.warn('Хранилище окружения недоступно — пишем в браузер:', err && err.message);
    }
  }
  try{
    localStorage.setItem(LOCAL_STORAGE_KEY, payload);
    noteDataChanged();
    renderBackupReminder();
    recordChangelog();
    afterLocalSave(syncChanged);
    return true;
  }catch(e){
    toast('Ошибка сохранения — изменения видны только в этой сессии и не сохранятся при перезагрузке');
    return false;
  }
}

