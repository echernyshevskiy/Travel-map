// ---------- доступность для экранного диктора и клавиатуры ----------
// Подписи полей в разметке сделаны соседними <label> без связи с полем —
// глазами понятно, а диктор поле не называет. Связываем автоматически, в том
// числе в формах, которые рисуются позже (старты, коллекции, «Проверка данных»).
function a11yControlOf(el){
  if(!el) return null;
  if(/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return el;
  const inner = el.querySelectorAll ? el.querySelectorAll('input:not([type=hidden]), select, textarea') : [];
  return inner.length === 1 ? inner[0] : null;
}
let a11yUid = 0;
function a11yLinkLabels(root){
  (root || document).querySelectorAll('label:not([for])').forEach(lb => {
    if(lb.querySelector('input, select, textarea')) return; // поле внутри подписи — связь уже есть
    let sib = lb.nextElementSibling, ctl = null;
    for(let i = 0; i < 2 && sib && !ctl; i++, sib = sib.nextElementSibling){ if(sib.tagName === 'LABEL') break; ctl = a11yControlOf(sib); }
    if(!ctl) return;
    if(!ctl.id) ctl.id = 'a11y-f' + (++a11yUid);
    lb.htmlFor = ctl.id;
  });
  // поля без подписи вовсе — называем по подсказке внутри поля или всплывающей подсказке
  (root || document).querySelectorAll('input:not([type=hidden]):not([aria-label]):not([aria-labelledby]), select:not([aria-label]):not([aria-labelledby]), textarea:not([aria-label])').forEach(c => {
    if(c.labels && c.labels.length) return;
    const name = c.getAttribute('placeholder') || c.getAttribute('title');
    if(name) c.setAttribute('aria-label', name);
  });
}
// у окон — название из их заголовка; прокручиваемые области доступны с клавиатуры
function a11yDialogs(){
  document.querySelectorAll('.modal-overlay').forEach(m => {
    const h = m.querySelector('h2, h3');
    if(h && !m.hasAttribute('aria-labelledby')){
      if(!h.id) h.id = m.id + 'Title';
      m.setAttribute('aria-labelledby', h.id);
    }
    m.setAttribute('aria-modal', 'true');
    m.querySelectorAll('.table-wrap').forEach(w => { if(!w.hasAttribute('tabindex')) w.setAttribute('tabindex', '0'); });
  });
}
a11yDialogs();
a11yLinkLabels();
{
  // следим только за панелью и окнами: карта меняет разметку на каждом кадре
  let pending = false;
  const mo = new MutationObserver(() => {
    if(pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; a11yLinkLabels(); });
  });
  [document.getElementById('sidebar'), ...document.querySelectorAll('.modal-overlay')].filter(Boolean)
    .forEach(el => mo.observe(el, { childList: true, subtree: true }));
}
