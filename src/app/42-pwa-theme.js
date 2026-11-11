// ---------- PWA service worker (only active when hosted over http/https with sw.js present) ----------
if('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('sw.js').catch(()=>{ /* sw.js not present — fine, app still works */ });
  });
}

// ---------- dark/light theme ----------
const THEME_STORAGE_KEY = 'travel-map-theme';
function applyTheme(theme){
  if(theme === 'dark'){
    document.documentElement.setAttribute('data-theme', 'dark');
    document.getElementById('themeToggleBtn').textContent = '☀️';
  } else {
    document.documentElement.removeAttribute('data-theme');
    document.getElementById('themeToggleBtn').textContent = '🌙';
  }
}
// Пока тему не выбирали вручную, она следует системной (и меняется вместе с ней).
// После нажатия на кнопку выбор запоминается и система больше не влияет.
const THEME_SYSTEM_MQ = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
function savedTheme(){
  try{
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return v === 'dark' || v === 'light' ? v : null;
  }catch(e){ return null; }
}
function systemTheme(){ return THEME_SYSTEM_MQ && THEME_SYSTEM_MQ.matches ? 'dark' : 'light'; }
(function initTheme(){
  applyTheme(savedTheme() || systemTheme());
  if(!THEME_SYSTEM_MQ) return;
  const follow = ()=>{ if(!savedTheme()) applyTheme(systemTheme()); };
  if(THEME_SYSTEM_MQ.addEventListener) THEME_SYSTEM_MQ.addEventListener('change', follow);
  else if(THEME_SYSTEM_MQ.addListener) THEME_SYSTEM_MQ.addListener(follow);
})();
document.getElementById('themeToggleBtn').addEventListener('click', ()=>{
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const next = isDark ? 'light' : 'dark';
  applyTheme(next);
  prefSet(THEME_STORAGE_KEY, next);
});

