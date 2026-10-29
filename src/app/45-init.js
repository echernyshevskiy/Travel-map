// ---------- init ----------
// в read-only сборке эти элементы всегда скрыты — редактирование недоступно
// в принципе, поэтому даже форма добавления/импорт/массовые действия не нужны
function applyReadOnlyUI(){
  if(!READ_ONLY) return;
  const addSection = document.getElementById('addEntrySection');
  if(addSection) addSection.style.display = 'none';
  const importBtn = document.getElementById('importBtn');
  if(importBtn) importBtn.style.display = 'none';
  const diagnosticsBtn = document.getElementById('openDiagnosticsBtn');
  if(diagnosticsBtn) diagnosticsBtn.style.display = 'none'; // «нажал — исправил» не имеет смысла, когда редактирование заблокировано
  const photoBtn = document.getElementById('openPhotoImportBtn');
  if(photoBtn) photoBtn.style.display = 'none'; // импорт существует только чтобы создавать записи
  // заметки в версию для друзей не попадают — дневник там был бы пустым
  // журнал правок ведётся в браузере автора — у друзей он всегда пустой
  const changelogBtn = document.getElementById('openChangelogBtn');
  if(changelogBtn) changelogBtn.style.display = 'none';
  const diaryBtn = document.getElementById('openDiaryBtn');
  if(diaryBtn && !BAKED_ENTRIES.some(e => e.notes && !e.hidden)) diaryBtn.style.display = 'none';
  const bulkBar = document.getElementById('bulkBar');
  if(bulkBar) bulkBar.style.setProperty('display', 'none', 'important');
  const selectAllTh = document.getElementById('selectAllCheckbox');
  if(selectAllTh) selectAllTh.style.display = 'none';
  const backupHint = document.getElementById('backupHint');
  if(backupHint) backupHint.textContent = 'Это read-only версия карты — редактирование недоступно. Можно скачать снимок данных для себя.';
  const h1 = document.querySelector('header h1');
  if(h1) h1.insertAdjacentHTML('beforeend', ' <span style="font-size:11px;font-style:normal;font-family:\'Twemoji Country Flags\',\'Courier Prime\',monospace;background:var(--amber-dim);color:var(--on-accent);padding:2px 7px;border-radius:10px;vertical-align:middle;">RO · только просмотр</span>');
  const legendVersion = document.getElementById('legendVersion');
  if(legendVersion){
    legendVersion.textContent += '-RO';
    const d = BAKED_SAVED_AT ? new Date(BAKED_SAVED_AT) : null;
    if(d && !isNaN(d)) legendVersion.textContent += ' · данные от ' + d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  document.title += ' · RO';
}

// Боковая панель выросла до двух десятков блоков, а на мобильном видно меньше
// половины экрана. Каждый заголовок теперь сворачивает свой блок, состояние
// запоминается между сессиями.
const COLLAPSE_KEY = 'travel-map-collapsed';
(function makeSectionsCollapsible(){
  const sidebar = document.getElementById('sidebar');
  if(!sidebar) return;
  let saved = {};
  try{ saved = JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '{}'); }catch(e){ saved = {}; }
  sidebar.querySelectorAll('.section').forEach(sec=>{
    const titles = Array.from(sec.children).filter(el => el.classList && el.classList.contains('section-title'));
    titles.forEach(title=>{
      const body = document.createElement('div');
      body.className = 'section-body';
      let node = title.nextSibling;
      while(node && !(node.nodeType === 1 && node.classList && node.classList.contains('section-title'))){
        const next = node.nextSibling;
        body.appendChild(node);
        node = next;
      }
      title.insertAdjacentElement('afterend', body);
      title.classList.add('collapsible');
      const key = (title.textContent || '').trim().slice(0, 40);
      const apply = collapsed => {
        body.style.display = collapsed ? 'none' : '';
        title.classList.toggle('collapsed', collapsed);
        title.setAttribute('aria-expanded', String(!collapsed));
      };
      apply(!!saved[key]);
      title.setAttribute('role', 'button');
      title.setAttribute('tabindex', '0');
      const toggle = ()=>{
        const collapsed = body.style.display !== 'none';
        apply(collapsed);
        saved[key] = collapsed;
        try{ localStorage.setItem(COLLAPSE_KEY, JSON.stringify(saved)); }catch(e){}
      };
      title.addEventListener('click', toggle);
      title.addEventListener('keydown', e=>{ if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); toggle(); } });
    });
  });
})();

// Навигация по статистике: на телефоне вкладка длинная, поэтому сверху —
// липкая строка с разделами. Нажатие раскрывает раздел (если свёрнут) и
// прокручивает к нему; подсвечивается раздел, который сейчас на экране.
// «Свернуть всё / Развернуть всё» — состояние запоминается как и раньше.
const STATS_NAV = [['Статистика', 'Сводка'], ['По годам', 'По годам'], ['Новых стран', 'Новые страны'], ['Сезонность', 'Сезоны'],
  ['По частям света', 'Части света'], ['Топ-5 стран', 'Страны'], ['Топ-5 городов', 'Города'], ['Топ-5 регионов', 'Регионы'], ['Моря и океаны', 'Моря']];
(function statsNav(){
  const sec = document.getElementById('mnavStatsSection');
  if(!sec) return;
  const titles = [...sec.querySelectorAll(':scope > .section-title')];
  const items = STATS_NAV.map(([start, label]) => ({ label, title: titles.find(t => t.textContent.trim().startsWith(start)) })).filter(x => x.title);
  if(items.length < 3) return;
  const nav = document.createElement('nav');
  nav.className = 'stats-nav';
  nav.setAttribute('aria-label', 'Разделы статистики');
  nav.innerHTML = items.map((x, i) => `<button type="button" data-sn="${i}">${escapeHtml(x.label)}</button>`).join('') +
    '<button type="button" class="sn-all" data-sn-all>Свернуть всё</button>';
  sec.prepend(nav);
  const scroller = () => { const sb = document.getElementById('sidebar'); return sb && sb.scrollHeight > sb.clientHeight ? sb : document.scrollingElement; };
  // на телефоне над строкой липнут шапка листа и переключатель «Записи / Статистика»
  const stickTop = () => {
    const sw = document.getElementById('listSwitch'), cs = sw && getComputedStyle(sw);
    const top = cs && cs.position === 'sticky' && cs.display !== 'none' ? (parseFloat(cs.top) || 0) + sw.offsetHeight : 0;
    nav.style.top = top + 'px';
    return top;
  };
  const isCollapsed = t => t.classList.contains('collapsed');
  const syncAll = () => { nav.querySelector('[data-sn-all]').textContent = items.every(x => isCollapsed(x.title)) ? 'Развернуть всё' : 'Свернуть всё'; };
  nav.addEventListener('click', e => {
    const b = e.target.closest('button');
    if(!b) return;
    if(b.hasAttribute('data-sn-all')){
      const collapse = !items.every(x => isCollapsed(x.title));
      items.forEach(x => { if(isCollapsed(x.title) !== collapse) x.title.click(); });
      syncAll();
      return;
    }
    wanted = +b.dataset.sn;
    const t = items[wanted].title;
    if(isCollapsed(t)) t.click();
    const sc = scroller(), base = sc === document.scrollingElement ? 0 : sc.getBoundingClientRect().top;
    const top = t.getBoundingClientRect().top - base + sc.scrollTop - stickTop() - nav.offsetHeight - 6;
    sc.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    syncAll();
  });
  sec.addEventListener('click', e => { if(e.target.closest('.section-title')) syncAll(); });
  // подсветка текущего раздела при прокрутке
  let raf = 0;
  let wanted = null;
  const mark = () => {
    raf = 0;
    const edge = nav.getBoundingClientRect().bottom + 8;
    let cur = 0;
    items.forEach((x, i) => { if(x.title.getBoundingClientRect().top <= edge) cur = i; });
    // в самом низу последние разделы до верха не доезжают — тогда тот, что выбрали
    const sc = scroller(), atEnd = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 4;
    if(atEnd && wanted !== null && items[wanted].title.getBoundingClientRect().top < innerHeight) cur = wanted;
    nav.querySelectorAll('[data-sn]').forEach(b => {
      const on = +b.dataset.sn === cur;
      b.classList.toggle('on', on);
      // выбранная кнопка — в видимой части строки
      if(on && (b.offsetLeft < nav.scrollLeft || b.offsetLeft + b.offsetWidth > nav.scrollLeft + nav.clientWidth)) nav.scrollLeft = b.offsetLeft - 8;
    });
  };
  const onScroll = () => { if(!raf) raf = requestAnimationFrame(mark); };
  const sb = document.getElementById('sidebar');
  if(sb) sb.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', () => { stickTop(); onScroll(); });
  document.querySelectorAll('#listSwitch [data-lsw]').forEach(b => b.addEventListener('click', () => setTimeout(() => { stickTop(); mark(); }, 0)));
  stickTop(); syncAll(); mark();
})();

// Свайп вниз закрывает модалку — на телефоне они почти во весь экран, и
// дотягиваться до крестика вверху неудобно. Работает только когда содержимое
// прокручено в самый верх, иначе жест конфликтовал бы с обычной прокруткой.
(function enableModalSwipeClose(){
  const SWIPE_CLOSE_PX = 90;   // порог закрытия
  const SWIPE_MAX_X = 60;      // горизонтальный увод — значит, жест не тот
  document.querySelectorAll('.modal-overlay').forEach(overlay=>{
    const panel = overlay.querySelector('.modal-panel');
    if(!panel) return;
    let startY = 0, startX = 0, tracking = false, scroller = null;

    panel.addEventListener('touchstart', (e)=>{
      if(e.touches.length !== 1) return;
      // ближайший прокручиваемый предок внутри модалки
      scroller = e.target.closest('.table-wrap') || panel;
      if(scroller.scrollTop > 0){ tracking = false; return; }
      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
      tracking = true;
      panel.style.transition = '';
    }, { passive: true });

    panel.addEventListener('touchmove', (e)=>{
      if(!tracking || e.touches.length !== 1) return;
      const dy = e.touches[0].clientY - startY;
      const dx = Math.abs(e.touches[0].clientX - startX);
      if(dx > SWIPE_MAX_X){ tracking = false; panel.style.transform = ''; return; }
      if(dy > 0){
        // тянем панель за пальцем, с сопротивлением
        panel.style.transform = `translateY(${dy * 0.6}px)`;
        panel.style.opacity = String(Math.max(0.55, 1 - dy / 420));
      }
    }, { passive: true });

    const finish = (e)=>{
      if(!tracking) return;
      tracking = false;
      const dy = (e.changedTouches && e.changedTouches[0].clientY - startY) || 0;
      panel.style.transition = 'transform 0.22s ease, opacity 0.22s ease';
      if(dy > SWIPE_CLOSE_PX){
        overlay.style.display = 'none';
        // сбрасываем, иначе при следующем открытии панель окажется сдвинутой
        setTimeout(()=>{ panel.style.transform = ''; panel.style.opacity = ''; panel.style.transition = ''; }, 30);
      } else {
        panel.style.transform = '';
        panel.style.opacity = '';
      }
    };
    panel.addEventListener('touchend', finish, { passive: true });
    panel.addEventListener('touchcancel', finish, { passive: true });
  });
})();

// Легенда сворачивается: на телефоне она закрывает заметную часть карты.
// Состояние запоминается, а на узких экранах по умолчанию свёрнута — там
// карта дороже подсказки, которую обычно читают один раз.
(function setupMapGlanceToggle(){
  const card = document.getElementById('mapGlance');
  if(!card) return;
  const KEY = 'travel-map-glance-collapsed';
  let saved = null;
  try{ saved = localStorage.getItem(KEY); }catch(e){}
  const isNarrow = window.matchMedia && window.matchMedia('(max-width:768px)').matches;
  const apply = state => {
    card.classList.toggle('collapsed', state);
    card.setAttribute('aria-expanded', String(!state));
    card.title = state ? 'Развернуть сводку' : 'Свернуть сводку';
  };
  apply(saved === null ? isNarrow : saved === '1');
  const toggle = ev => {
    if(ev && ev.target && ev.target.closest && ev.target.closest('a')) return;
    const next = !card.classList.contains('collapsed');
    apply(next);
    try{ localStorage.setItem(KEY, next ? '1' : '0'); }catch(e){}
  };
  card.addEventListener('click', toggle);
  card.addEventListener('keydown', e => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); toggle(); } });
  // клики и прокрутка по карточке не должны двигать карту
  if(window.L && L.DomEvent){ L.DomEvent.disableClickPropagation(card); L.DomEvent.disableScrollPropagation(card); }
})();

(function setupLegendToggle(){
  const legend = document.getElementById('legend');
  const btn = document.getElementById('legendToggle');
  const body = document.getElementById('legendBody');
  if(!legend || !btn || !body) return;
  const KEY = 'travel-map-legend-collapsed';
  let saved = null;
  try{ saved = localStorage.getItem(KEY); }catch(e){}
  const isNarrow = window.matchMedia && window.matchMedia('(max-width:768px)').matches;
  const collapsed = saved === null ? isNarrow : saved === '1';
  const apply = state => {
    legend.classList.toggle('collapsed', state);
    btn.setAttribute('aria-expanded', String(!state));
    btn.title = state ? 'Развернуть легенду' : 'Свернуть легенду';
  };
  apply(collapsed);
  btn.addEventListener('click', ()=>{
    const next = !legend.classList.contains('collapsed');
    apply(next);
    try{ localStorage.setItem(KEY, next ? '1' : '0'); }catch(e){}
  });
})();

(async function init(){
  try{
    applyReadOnlyUI();
  }catch(err){
    console.error('applyReadOnlyUI failed', err);
  }
  try{
    renderHomeRegion();
  }catch(err){
    console.error('renderHomeRegion failed', err);
  }
  try{
    await loadData();
    dropUnusableEntries(); // до журнала, синхронизации и первой отрисовки
  }catch(err){
    console.error('loadData failed', err);
    allEntries = [];
    tripMeta = {};
  }
  try{
    rebuildAll();
  }catch(err){
    showFatalErrorBanner('Не удалось инициализировать интерфейс: ' + (err && err.message ? err.message : err) + '.');
  }
  try{
    applyTripFromUrl();
  }catch(err){
    console.error('applyTripFromUrl failed', err);
  }
  try{
    renderBackupReminder();
  }catch(err){
    console.error('renderBackupReminder failed', err);
  }
  // опорный снимок для журнала: изменения считаются относительно него
  try{ changelogSnapshot = snapshotForLog(); }catch(err){ console.error('changelog init failed', err); }
  // и для синхронизации — после нормализации записей, чтобы она не считалась правкой
  try{ snapshotSyncBase(); renderSyncStatus(); }catch(err){ console.error('sync init failed', err); }
  if(!READ_ONLY && readSyncConfig()) scheduleSync(1500);
  // восстанавливаем выбранную подложку — если человек однажды переключился на
  // контуры, незачем каждый раз снова упираться в недоступные плитки
  // Проверку файла делаем ПЕРВОЙ и отдельно: на локальном файле хранилище
  // браузера может быть недоступно, и тогда чтение настройки бросит исключение
  // раньше, чем мы успеем переключиться на контуры.
  const isLocalFile = !SERVED_OVER_HTTP; // файл с диска, встроенный предпросмотр и т. п.
  if(isLocalFile){
    // Файл открыт с диска: заголовок Referer в этом случае не отправляется,
    // а без него OpenStreetMap отдаёт картинку «Access blocked» вместо карты.
    // Это не сбой связи — картинка загружается успешно, поэтому обычное
    // переключение по ошибке плиток не срабатывает. Включаем контуры сразу.
    try{
      setBasemap('plain');
      setTimeout(()=> toast('Файл открыт с диска — подложка карты недоступна, включены контуры стран. По ссылке в браузере карта работает полностью'), 900);
    }catch(err){ console.warn('не удалось включить контуры', err); }
  } else {
    try{
      const savedBase = localStorage.getItem('travel-map-basemap');
      if(savedBase && savedBase !== 'street') setBasemap(savedBase);
    }catch(err){ console.warn('настройка подложки недоступна', err); }
  }

  // если при загрузке пришлось переписать ссылки на фото — сохраняем один раз,
  // иначе в резервную копию попадал бы старый, неотображаемый вид
  if(migrationChanged && !READ_ONLY){
    try{ await saveData(); }catch(err){ console.error('post-migration save failed', err); }
  }

  // кнопка «наверх» появляется, только когда есть куда прокручивать
  const sidebarEl = document.getElementById('sidebar');
  const topBtn = document.getElementById('scrollTopBtn');
  if(sidebarEl && topBtn){
    const syncTopBtn = ()=>{ topBtn.style.display = sidebarEl.scrollTop > 260 ? 'flex' : 'none'; };
    sidebarEl.addEventListener('scroll', syncTopBtn);
    topBtn.addEventListener('click', ()=>{
      // scrollTo с плавной прокруткой поддерживают не все браузеры (заметно на
      // старых Safari) — там просто прыгаем наверх, лишь бы кнопка работала
      if(typeof sidebarEl.scrollTo === 'function'){
        try{ sidebarEl.scrollTo({ top: 0, behavior: 'smooth' }); return; }catch(e){}
      }
      sidebarEl.scrollTop = 0;
    });
    syncTopBtn();
  }

  // ярлыки на иконке приложения (долгое нажатие): ?action=add и ?action=quiz
  try{
    const params = new URLSearchParams(location.search);
    const action = params.get('action');
    if(action){
      params.delete('action');
      const q = params.toString();
      history.replaceState(history.state, '', location.pathname + (q ? '?' + q : '') + location.hash);
      setTimeout(()=>{
        if(action === 'quiz') openQuiz();
        else if(action === 'add' && !READ_ONLY){
          if(mnavOn()) mnavShow('add');
          else document.getElementById('addEntrySection').scrollIntoView({ block: 'start' });
        }
      }, 300);
    }
  }catch(e){}

  // прячем заставку в любом случае — даже если инициализация где-то споткнулась,
  // иначе пользователь останется смотреть на неё вечно
  const boot = document.getElementById('bootOverlay');
  if(boot){
    boot.classList.add('hiding');
    setTimeout(()=>{ if(boot.parentNode) boot.parentNode.removeChild(boot); }, 400);
  }
})();

