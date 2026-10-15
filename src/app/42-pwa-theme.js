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
(function initTheme(){
  let saved = null;
  try{ saved = localStorage.getItem(THEME_STORAGE_KEY); }catch(e){}
  applyTheme(saved === 'dark' ? 'dark' : 'light');
})();
document.getElementById('themeToggleBtn').addEventListener('click', ()=>{
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const next = isDark ? 'light' : 'dark';
  applyTheme(next);
  try{ localStorage.setItem(THEME_STORAGE_KEY, next); }catch(e){}
});

