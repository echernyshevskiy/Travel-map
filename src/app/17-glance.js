// ---------- сводка над панелью ----------
// Считается по ВСЕМ данным, а не по текущим фильтрам — в этом её отличие от
// блока статистики ниже. Вторая строка привязана ко времени: именно отношение
// ко «сейчас» делает такую сводку живой, а не ещё одним набором чисел.

function glanceTimeLine(){
  // 1) ближайший старт, если записан — это самое живое, что есть
  const upcoming = races
    .filter(r => raceStatus(r) === 'upcoming' && r.date)
    .map(r => ({ r, left: daysUntil(r.date) }))
    .filter(x => x.left !== null && x.left >= 0)
    .sort((a,b) => a.left - b.left)[0];
  if(upcoming){
    const l = upcoming.left;
    const when = l === 0 ? 'сегодня' : `через ${l} ${daysWord(l)}`;
    return `${escapeHtml(upcoming.r.name)} — <b>${when}</b>`;
  }

  // 2) иначе — сколько прошло с последней поездки
  const visited = allEntries.filter(e => e.status !== 'wishlist' && e.year);
  if(visited.length === 0) return '';
  const withMonth = visited.filter(e => e.month);
  let last = null;
  if(withMonth.length){
    last = withMonth.reduce((a,b)=> (b.year*12+b.month) > (a.year*12+a.month) ? b : a);
  } else {
    last = visited.reduce((a,b)=> b.year > a.year ? b : a);
  }
  const now = new Date();
  const lastAt = last.year*12 + (last.month || 6);
  const nowAt = now.getFullYear()*12 + (now.getMonth()+1);
  const diff = nowAt - lastAt;
  const where = escapeHtml(last.name);
  if(diff <= 0) return `последняя отметка — <b>${where}</b>`;
  if(diff === 1) return `с последней поездки — <b>месяц</b> · ${where}`;
  if(diff < 12) return `с последней поездки — <b>${diff} ${monthsWord(diff)}</b> · ${where}`;
  const years = Math.floor(diff / 12);
  return `с последней поездки — <b>${years} ${years === 1 ? 'год' : years < 5 ? 'года' : 'лет'}</b> · ${where}`;
}

function renderGlance(){
  const bar = document.getElementById('glanceBar');
  if(!bar) return;
  const visited = allEntries.filter(e => e.status !== 'wishlist');
  if(visited.length === 0){ bar.innerHTML = ''; const card = document.getElementById('mapGlance'); if(card) card.style.display = 'none'; return; }

  // Считаем ровно так же, как блок статистики ниже: города включают остановки
  // маршрутов, иначе под одним словом «городов» стояли бы два разных числа.
  const countries = new Set(visited.filter(e => e.type === 'country' && e.countryKey).map(e => e.countryKey));
  const cities = distinctCityKeys(getAllCityVisits(visited));
  const pct = Math.round(countries.size / COUNTRY_LIST.length * 100);

  const nums = [];
  if(countries.size) nums.push(`<span class="glance-num">${countries.size}<small>стран</small></span>`);
  if(cities.size) nums.push(`<span class="glance-num">${cities.size}<small>городов</small></span>`);
  if(countries.size) nums.push(`<span class="glance-num">${pct}%<small>мира</small></span>`);

  const note = glanceTimeLine();
  bar.innerHTML =
    `<div class="glance-nums">${nums.join('<span class="glance-sep">·</span>')}</div>` +
    (note ? `<div class="glance-note">${note}</div>` : '');
  // то же — карточкой на карте (в боковой панели полоса больше не показывается)
  const card = document.getElementById('mapGlance');
  if(card){
    card.style.display = '';
    document.getElementById('mapGlanceFull').innerHTML = '<span class="mg-chev" aria-hidden="true">▾</span>' + bar.innerHTML;
    const parts = [];
    if(countries.size) parts.push(`<b>${countries.size}</b>стр.`);
    if(cities.size) parts.push(`<b>${cities.size}</b>гор.`);
    if(countries.size) parts.push(`<b>${pct}%</b>мира`);
    document.getElementById('mapGlanceCompact').innerHTML = parts.join(' · ') + ' <span class="mg-chev" aria-hidden="true">▸</span>';
  }
}

function updateStats(){
  // Считаем как сводка под шапкой: уникальные страны и города (с остановками
  // маршрутов), без планов. Раньше здесь было число записей — «Стран 63»
  // рядом с «37 стран» в сводке.
  const visited = allEntries.filter(e => e.status !== 'wishlist');
  const countries = new Set(visited.filter(e => e.type === 'country' && e.countryKey).map(e => e.countryKey)).size;
  const cities = distinctCityKeys(getAllCityVisits(visited)).size;
  const routes = visited.filter(e=>e.type==='route');
  const km = routes.reduce((s,r)=> s + (r.distanceKm || 0), 0);
  document.getElementById('statCountries').textContent = countries;
  document.getElementById('statCities').textContent = cities;
  document.getElementById('statRoutes').textContent = routes.length;
  document.getElementById('statKm').textContent = km.toFixed(0);
}

