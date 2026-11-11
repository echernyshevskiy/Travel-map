// ---------- вкладки боковой панели на компьютере ----------
// Панель была одной лентой в несколько тысяч пикселей. Теперь сверху — поиск
// (всегда на виду) и вкладки; видна одна вкладка, выбранная запоминается.
// Разделы — те же, что у нижних вкладок телефона (атрибут data-mtab), поэтому
// вторая разметка не нужна: «Список» телефона здесь разделён на «Список» и
// «Статистику», «Ещё» без кнопок шапки — это «Данные» (синхронизация и копия).
// Все функции берут состояние из разметки, а не из переменных этого файла:
// mnavShow() из 44-mobile-nav.js может вызвать их раньше, чем файл выполнится.
const SIDE_TAB_KEY = 'travel-map-sidetab';
function sideTabIds(){ return [...document.querySelectorAll('#sideTabs [data-stab]')].filter(b => !b.hidden).map(b => b.dataset.stab); }
// какие элементы панели относятся к вкладке
function sideTabOf(el){
  if(el.id === 'mnavStatsSection') return 'stats';
  if(el.id === 'entryList') return 'list';
  const m = el.dataset.mtab;
  if(m === 'add') return 'add';
  if(m === 'filters') return 'filters';
  if(m === 'more' && el.id !== 'moreSection') return 'data';
  return null;
}
function sideTabsOn(){ return document.body.classList.contains('stabs'); }
function sideTabCurrent(){ return document.body.dataset.stab || null; }
function sideTabShow(tab, opts = {}){
  if(!sideTabsOn()) return;
  const ids = sideTabIds();
  if(!ids.includes(tab)) tab = ids.includes('list') ? 'list' : ids[0];
  const changed = tab !== sideTabCurrent();
  document.body.dataset.stab = tab;
  ['add', 'list', 'stats', 'filters', 'data'].forEach(t => document.body.classList.toggle('stab-' + t, t === tab));
  document.querySelectorAll('#sideTabs [data-stab]').forEach(b => {
    const on = b.dataset.stab === tab;
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
  });
  if(opts.remember !== false){ try{ localStorage.setItem(SIDE_TAB_KEY, tab); }catch(e){ /* без хранилища просто не запоминаем */ } }
  if(changed && opts.keepScroll !== true){ const sb = document.getElementById('sidebar'); if(sb) sb.scrollTop = 0; }
  const btn = document.getElementById('stab-' + tab);
  // в узкой панели вкладки прокручиваются вбок — выбранная должна быть видна
  if(btn && btn.parentElement.scrollWidth > btn.parentElement.clientWidth){
    const bar = btn.parentElement;
    bar.scrollLeft = Math.max(0, btn.offsetLeft - (bar.clientWidth - btn.offsetWidth) / 2);
  }
  if(opts.focus && btn) btn.focus();
}
// вызов из mnavShow(): тот же раздел, что открылся бы на телефоне
function sideTabFromMtab(mtab){
  if(!sideTabsOn() || mtab === 'map') return;
  if(mtab === 'list') sideTabShow(document.body.classList.contains('list-stats') ? 'stats' : 'list');
  else sideTabShow(mtab === 'more' ? 'data' : mtab);
}
// поле поиска: на компьютере — в шапке панели, на телефоне — на прежнем месте во вкладке «Список»
function placeSideSearch(desktop){
  const wrap = document.getElementById('globalSearchWrap');
  const slot = document.getElementById('sideSearchSlot');
  const sec = document.getElementById('mnavSearchSection');
  if(!wrap || !slot || !sec) return;
  if(desktop){ if(wrap.parentElement !== slot) slot.appendChild(wrap); return; }
  const home = sec.querySelector('.section-body') || sec;
  if(wrap.parentElement !== home) home.appendChild(wrap);
}
function sideTabsApplyMode(){
  const desktop = !mnavOn();
  const was = sideTabsOn();
  document.body.classList.toggle('stabs', desktop);
  placeSideSearch(desktop);
  // роли вкладок ставим только здесь: на телефоне те же блоки показывают нижние вкладки
  document.querySelectorAll('#sidebar > *').forEach(el => {
    const tab = sideTabOf(el);
    if(!tab) return;
    if(!el.id) el.id = 'stabpanel-' + tab + '-' + [...el.parentElement.children].indexOf(el);
    if(desktop){ el.setAttribute('role', 'tabpanel'); el.setAttribute('aria-labelledby', 'stab-' + tab); }
    else if(el.getAttribute('role') === 'tabpanel'){ el.removeAttribute('role'); el.removeAttribute('aria-labelledby'); }
  });
  document.querySelectorAll('#sideTabs [data-stab]').forEach(b => {
    const panels = [...document.querySelectorAll('#sidebar > *')].filter(el => sideTabOf(el) === b.dataset.stab).map(el => el.id);
    b.setAttribute('aria-controls', panels.join(' '));
  });
  if(desktop && !was){
    let saved = null;
    try{ saved = localStorage.getItem(SIDE_TAB_KEY); }catch(e){ saved = null; }
    sideTabShow(saved || (READ_ONLY ? 'list' : 'add'), { remember: false });
  }
  if(!desktop && was){
    [...document.body.classList].filter(c => c.startsWith('stab-')).forEach(c => document.body.classList.remove(c));
    delete document.body.dataset.stab;
  }
}
// «/» или Ctrl+K — курсор в поиск (на телефоне сначала открывается список)
function focusGlobalSearch(){
  const input = document.getElementById('globalSearch');
  if(!input) return;
  if(mnavOn()){ setListView('entries'); mnavShow('list'); }
  input.focus();
  input.select();
}
// «Показать в списке» из карточки на карте: вкладка «Список» и прокрутка к записи
function showEntryInList(id){
  const entry = allEntries.find(e => e.id === id);
  if(!entry) return;
  if(!passesFilter(entry)){ toast('Запись скрыта фильтрами — сбросьте их, чтобы увидеть её в списке'); return; }
  map.closePopup();
  if(mnavOn()){ setListView('entries'); mnavShow('list'); } else sideTabShow('list');
  let row = document.querySelector(`#entryList .entry-row[data-entry-id="${CSS.escape(id)}"]`);
  if(!row){
    // запись дальше показанной части списка — раскрываем список до неё
    const visible = allEntries.filter(passesFilter).sort((a,b)=> b.year - a.year || a.name.localeCompare(b.name));
    const idx = visible.findIndex(e => e.id === id);
    if(idx >= 0){ listLimit = Math.max(listLimit, idx + 1); renderList(); }
    row = document.querySelector(`#entryList .entry-row[data-entry-id="${CSS.escape(id)}"]`);
  }
  if(!row) return;
  row.scrollIntoView({ block: 'center' });
  row.classList.add('entry-row-flash');
  setTimeout(() => row.classList.remove('entry-row-flash'), 1600);
}
(function setupSideTabs(){
  if(READ_ONLY){ const b = document.getElementById('stab-add'); if(b) b.hidden = true; }
  const bar = document.getElementById('sideTabs');
  bar.addEventListener('click', e => {
    const b = e.target.closest('[data-stab]');
    if(b) sideTabShow(b.dataset.stab);
  });
  // стрелки, Home и End — по шаблону WAI-ARIA для вкладок
  bar.addEventListener('keydown', e => {
    const ids = sideTabIds();
    const i = ids.indexOf(sideTabCurrent());
    let next = null;
    if(e.key === 'ArrowRight') next = ids[(i + 1) % ids.length];
    else if(e.key === 'ArrowLeft') next = ids[(i - 1 + ids.length) % ids.length];
    else if(e.key === 'Home') next = ids[0];
    else if(e.key === 'End') next = ids[ids.length - 1];
    if(!next) return;
    e.preventDefault();
    sideTabShow(next, { focus: true });
  });
  // поиск из шапки фильтрует список — показываем его
  const input = document.getElementById('globalSearch');
  if(input) input.addEventListener('input', () => {
    if(sideTabsOn() && input.value.trim() && sideTabCurrent() !== 'list') sideTabShow('list', { remember: false });
  });
  document.addEventListener('keydown', e => {
    const t = e.target;
    const typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    const ctrlK = (e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'k' || e.key === 'K' || e.key === 'л' || e.key === 'Л');
    const slash = e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !typing;
    if(!ctrlK && !slash) return;
    // поверх открыто окно — поиск под ним не нужен
    if([...document.querySelectorAll('.modal-overlay, .story-overlay')].some(m => m.style.display && m.style.display !== 'none')) return;
    e.preventDefault();
    focusGlobalSearch();
  });
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-popup-act="inlist"]');
    if(b) showEntryInList(b.dataset.id);
  });
  if(MNAV_MQ.addEventListener) MNAV_MQ.addEventListener('change', sideTabsApplyMode);
  else if(MNAV_MQ.addListener) MNAV_MQ.addListener(sideTabsApplyMode);
  sideTabsApplyMode();
})();
