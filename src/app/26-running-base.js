// ---------- окно «Бег» ----------
function getRuns(){
  return allEntries.filter(e => e.type === 'route' && e.activity === 'running' && e.status !== 'wishlist');
}

// Кнопка появляется только при наличии беговых записей: показывать раздел,
// за которым ничего нет, — вводить в заблуждение.
function updateRunningButton(){
  const btn = document.getElementById('openRunningBtn');
  if(!btn) return;
  // раздел нужен и тогда, когда есть только официальные старты без маршрутов
  btn.style.display = (getRuns().length > 0 || races.length > 0) ? '' : 'none';
}

