// ---------- окна: кнопка «Назад» и фокус ----------
// Окна открываются и закрываются сменой style.display в разных разделах кода.
// Чтобы не трогать каждое место, здесь один общий механизм, который следит за
// видимостью всех окон:
//  • открытое окно добавляет шаг в историю браузера — системная кнопка или жест
//    «Назад» закрывает верхнее окно, а не уводит со страницы;
//  • окно, закрытое крестиком, Esc или щелчком по фону, убирает свой шаг, чтобы
//    следующий «Назад» не срабатывал вхолостую;
//  • фокус переходит в окно, Tab ходит по кругу внутри него, после закрытия
//    фокус возвращается на кнопку, которая окно открыла.
// Шаги истории взаимозаменяемы: важно лишь, чтобы их было столько же, сколько
// открыто окон (и панель вкладок на телефоне — см. 44-mobile-nav.js).
const DIALOG_SELECTOR = '.modal-overlay, .story-overlay';
const dialogInfo = new Map(); // окно → { shown, pushed, opener }

function dialogShown(el){ return el.style.display !== 'none' && el.style.display !== ''; }
function dialogEls(){ return [...document.querySelectorAll(DIALOG_SELECTOR)]; }
// верхнее открытое окно: у всех окон одинаковый слой, выше лежит последнее в разметке
function topDialog(){
  const open = dialogEls().filter(dialogShown);
  return open.length ? open[open.length - 1] : null;
}
// Учёт своих шагов истории. Переход назад в браузере асинхронный, поэтому
// новые шаги не добавляются, пока наш переход не завершился (иначе при быстрых
// открытиях-закрытиях счёт сбивался и «Назад» уводил со страницы).
const histSteps = { depth: 0, pendingBack: 0, deferredPush: 0, inFlight: false, timer: null, flushQueued: false };
function historyFlush(){
  histSteps.flushQueued = false;
  if(histSteps.inFlight) return; // продолжим, когда придёт popstate
  // открытие и закрытие за один такт взаимно гасятся
  const cancel = Math.min(histSteps.pendingBack, histSteps.deferredPush);
  histSteps.pendingBack -= cancel; histSteps.deferredPush -= cancel;
  while(histSteps.deferredPush > 0){
    histSteps.deferredPush--;
    try{ history.pushState({ travelMapStep: true }, ''); histSteps.depth++; }catch(e){ logError('шаг истории для окна', e); }
  }
  const n = Math.min(histSteps.pendingBack, histSteps.depth); // дальше своих шагов не уходим
  histSteps.pendingBack = 0;
  if(!n) return;
  histSteps.depth -= n;
  histSteps.inFlight = true;
  clearTimeout(histSteps.timer);
  // если popstate так и не пришёл — не держим учёт заблокированным
  histSteps.timer = setTimeout(()=>{ if(histSteps.inFlight){ histSteps.inFlight = false; historyFlush(); } }, 1500);
  try{ history.go(-n); }catch(e){ histSteps.inFlight = false; histSteps.depth += n; }
}
function historyQueueFlush(){
  if(histSteps.flushQueued) return;
  histSteps.flushQueued = true;
  setTimeout(historyFlush, 0);
}
// «Назад» без последствий: убрать свой шаг истории, ничего не закрывая
function historyBackSilently(){
  if(histSteps.deferredPush > 0){ histSteps.deferredPush--; return; }
  histSteps.pendingBack++;
  historyQueueFlush();
}
// добавить шаг истории (окно или панель открылись)
function historyPushStep(){
  if(histSteps.pendingBack > 0){ histSteps.pendingBack--; return true; } // гасим ожидающий «назад»
  if(histSteps.inFlight || histSteps.flushQueued){ histSteps.deferredPush++; historyQueueFlush(); return true; }
  try{ history.pushState({ travelMapStep: true }, ''); histSteps.depth++; return true; }catch(e){ return false; }
}

function dialogFocusables(el){
  return [...el.querySelectorAll('a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])')]
    .filter(n => !n.disabled && n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden');
}
function dialogFocusInitial(el){
  if(el.contains(document.activeElement)) return; // код окна уже поставил фокус сам
  const title = el.querySelector('.modal-header h2, h2, h3');
  if(title && title.getClientRects().length){
    if(!title.hasAttribute('tabindex')) title.setAttribute('tabindex', '-1');
    try{ title.focus({ preventScroll: true }); }catch(e){ /* старый браузер без preventScroll — фокус не критичен */ }
    if(document.activeElement === title) return;
  }
  const first = dialogFocusables(el)[0];
  if(first){ try{ first.focus({ preventScroll: true }); }catch(e){ /* как выше */ } }
}
function dialogRestoreFocus(el, opener){
  const a = document.activeElement;
  if(a && a !== document.body && !el.contains(a)) return; // фокус уже увели намеренно
  if(!opener || !opener.isConnected || !opener.getClientRects().length) return;
  try{ opener.focus({ preventScroll: true }); }catch(e){ /* кнопка, открывшая окно, уже исчезла */ }
}

function dialogOnChange(el){
  const info = dialogInfo.get(el);
  const shown = dialogShown(el);
  if(shown === info.shown) return;
  info.shown = shown;
  if(shown){
    const a = document.activeElement;
    info.opener = a && a !== document.body && !el.contains(a) ? a : null;
    info.pushed = historyPushStep();
    dialogFocusInitial(el);
  } else {
    if(info.pushed){ info.pushed = false; historyBackSilently(); }
    dialogRestoreFocus(el, info.opener);
    info.opener = null;
  }
}
function dialogCloseByBack(el){
  const info = dialogInfo.get(el);
  if(info) info.pushed = false; // шаг истории уже снят самим «Назад»
  // закрываем тем же крестиком — у окон бывает своя уборка при закрытии
  const btn = el.querySelector('[id^="close"]');
  if(btn) btn.click();
  if(dialogShown(el)) el.style.display = 'none';
}

(function setupDialogs(){
  const mo = new MutationObserver(records => {
    const seen = new Set();
    records.forEach(r => { if(!seen.has(r.target)){ seen.add(r.target); dialogOnChange(r.target); } });
  });
  dialogEls().forEach(el => {
    dialogInfo.set(el, { shown: dialogShown(el), pushed: false, opener: null });
    mo.observe(el, { attributes: true, attributeFilter: ['style'] });
    if(el.classList.contains('story-overlay')){
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
    }
  });
  // свой обработчик ставится раньше обработчика вкладок телефона и при
  // необходимости не пускает событие дальше
  window.addEventListener('popstate', (e)=>{
    if(histSteps.inFlight){
      // это наш собственный переход назад
      histSteps.inFlight = false;
      clearTimeout(histSteps.timer);
      e.stopImmediatePropagation();
      historyFlush();
      return;
    }
    if(histSteps.depth > 0) histSteps.depth--; // человек нажал «Назад» — снят один наш шаг
    const top = topDialog();
    if(top){
      e.stopImmediatePropagation();
      dialogCloseByBack(top);
    }
  });
  // Tab и Shift+Tab не выходят за пределы верхнего окна
  document.addEventListener('keydown', (e)=>{
    if(e.key !== 'Tab' || e.altKey || e.ctrlKey || e.metaKey) return;
    const top = topDialog();
    if(!top) return;
    const list = dialogFocusables(top);
    if(!list.length){ e.preventDefault(); return; }
    const first = list[0], last = list[list.length - 1];
    const a = document.activeElement;
    const inside = top.contains(a) && list.includes(a);
    if(!inside){
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    } else if(e.shiftKey && a === first){
      e.preventDefault(); last.focus();
    } else if(!e.shiftKey && a === last){
      e.preventDefault(); first.focus();
    }
  });
})();
