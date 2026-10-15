// ---------- нижние вкладки на телефоне ----------
// Раскладка включается только на узком и достаточно высоком экране — та же
// граница, что в CSS. Кнопки шапки переезжают во вкладку «Ещё» (сами элементы,
// не копии — обработчики на них остаются), при выходе возвращаются на место.
const MNAV_MQ = window.matchMedia('(max-width:768px) and (min-height:601px)');
const MNAV_TITLES = { list: 'Записи', filters: 'Фильтры', add: 'Новая отметка', more: 'Ещё' };
let mnavTab = 'map';
function mnavOn(){ return document.body.classList.contains('mnav'); }
function setListView(view){
  document.body.classList.toggle('list-stats', view === 'stats');
  document.querySelectorAll('#listSwitch [data-lsw]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.lsw === view)));
  const sb = document.getElementById('sidebar');
  if(sb && mnavOn()) sb.scrollTop = 0;
}
document.querySelectorAll('#listSwitch [data-lsw]').forEach(b => b.addEventListener('click', () => setListView(b.dataset.lsw)));
function mnavShow(tab){
  if(!mnavOn()) return;
  if(READ_ONLY && tab === 'add') tab = 'map';
  const wasOpen = mnavTab !== 'map';
  const changed = tab !== mnavTab;
  mnavTab = tab;
  const body = document.body;
  ['list','filters','add','more'].forEach(t => body.classList.toggle('mtab-' + t, t === tab));
  body.classList.toggle('mtab-open', tab !== 'map');
  document.querySelectorAll('[data-mtab-btn]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.mtabBtn === tab)));
  const title = document.getElementById('mnavSheetTitle');
  if(title) title.textContent = tab === 'add' && editingId ? 'Правка отметки' : (MNAV_TITLES[tab] || '');
  if(changed && tab !== 'map') document.getElementById('sidebar').scrollTop = 0;
  // «Назад» на Android закрывает панель, а не уходит со страницы
  if(tab !== 'map' && !wasOpen){
    try{ history.pushState({ mnavSheet: true }, ''); }catch(e){}
  } else if(tab === 'map' && wasOpen && history.state && history.state.mnavSheet){
    try{ history.back(); }catch(e){}
  }
}
window.addEventListener('popstate', ()=>{
  if(mnavOn() && mnavTab !== 'map'){
    mnavTab = 'map'; // уже ушли назад по истории — второй раз не возвращаемся
    ['list','filters','add','more'].forEach(t => document.body.classList.remove('mtab-' + t));
    document.body.classList.remove('mtab-open');
    document.querySelectorAll('[data-mtab-btn]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.mtabBtn === 'map')));
  }
});
function mnavApplyMode(){
  const on = MNAV_MQ.matches;
  const was = mnavOn();
  document.body.classList.toggle('mnav', on);
  const actions = document.querySelector('.header-actions');
  const slot = document.getElementById('moreActionsSlot');
  const header = document.querySelector('header');
  if(actions && slot && header){
    if(on && actions.parentElement !== slot) slot.appendChild(actions);
    if(!on && actions.parentElement !== header) header.appendChild(actions);
  }
  if(on && !was){ mnavTab = 'map'; mnavShow('map'); }
  if(!on && was){
    ['list','filters','add','more'].forEach(t => document.body.classList.remove('mtab-' + t));
    document.body.classList.remove('mtab-open');
    mnavTab = 'map';
  }
  if(on !== was) setTimeout(()=> map.invalidateSize(), 60);
}
function updateMnavBadge(){
  const dot = document.getElementById('mnavFilterDot');
  if(dot) dot.classList.toggle('on', !!anyFilterActive());
}
(function setupMobileNav(){
  if(READ_ONLY){
    const addBtn = document.querySelector('[data-mtab-btn="add"]');
    if(addBtn) addBtn.style.display = 'none';
  }
  document.querySelectorAll('[data-mtab-btn]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const tab = btn.dataset.mtabBtn;
      // повторное нажатие на открытую вкладку убирает панель
      mnavShow(tab === mnavTab ? 'map' : tab);
    });
  });
  document.getElementById('mnavCloseBtn').addEventListener('click', ()=> mnavShow('map'));
  // смахивание шапки панели вниз закрывает её
  const head = document.getElementById('mnavSheetHead');
  let y0 = null;
  head.addEventListener('touchstart', e => { y0 = e.touches[0].clientY; }, { passive: true });
  head.addEventListener('touchmove', e => {
    if(y0 === null) return;
    if(e.touches[0].clientY - y0 > 60){ y0 = null; mnavShow('map'); }
  }, { passive: true });
  head.addEventListener('touchend', ()=>{ y0 = null; }, { passive: true });
  if(MNAV_MQ.addEventListener) MNAV_MQ.addEventListener('change', mnavApplyMode);
  else if(MNAV_MQ.addListener) MNAV_MQ.addListener(mnavApplyMode);
  mnavApplyMode();
})();

