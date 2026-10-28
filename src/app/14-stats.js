function updateFilteredStats(precomputedVisible){
  const visible = precomputedVisible || allEntries.filter(passesFilter);
  const visited = visible.filter(e => e.status !== 'wishlist');

  const years = new Set(visited.map(e => e.year));

  // «месяцев» и «месяцев подряд» считаются только по записям, где указан
  // и год, и месяц — без месяца календарную позицию точно не определить
  const monthKeys = new Set(visited.filter(e => e.year && e.month).map(e => e.year * 12 + e.month));
  const monthsTraveled = monthKeys.size;
  const sortedMonths = [...monthKeys].sort((a,b) => a - b);
  let monthsStreak = sortedMonths.length > 0 ? 1 : 0;
  let curStreak = monthsStreak;
  for(let i = 1; i < sortedMonths.length; i++){
    curStreak = sortedMonths[i] === sortedMonths[i-1] + 1 ? curStreak + 1 : 1;
    if(curStreak > monthsStreak) monthsStreak = curStreak;
  }

  // Самый долгий перерыв — обратная величина к серии месяцев подряд.
  // Считаем по тем же ключам, чтобы две цифры не могли разойтись.
  // Разрыв между январём и мартом = один пропущенный месяц, поэтому «−1».
  let longestGap = 0, gapFrom = null, gapTo = null;
  for(let i = 1; i < sortedMonths.length; i++){
    const gap = sortedMonths[i] - sortedMonths[i-1] - 1;
    if(gap > longestGap){ longestGap = gap; gapFrom = sortedMonths[i-1]; gapTo = sortedMonths[i]; }
  }
  const keyToLabel = k => {
    const y = Math.floor((k - 1) / 12), m = k - y * 12;
    return `${monthLabel(m) || m} ${y}`;
  };

  const countryKeys = new Set(visited.filter(e => e.type === 'country').map(e => e.countryKey));
  const cityVisits = getAllCityVisits(visited);
  const cityKeys = distinctCityKeys(cityVisits);
  const routes = visited.filter(e => e.type === 'route');
  const running = routes.filter(e => e.activity === 'running').length;
  const hiking = routes.filter(e => e.activity === 'hiking').length;
  const cycling = routes.filter(e => e.activity === 'cycling').length;
  const roadtrip = routes.filter(e => e.activity === 'roadtrip').length;
  const totalElevation = routes.reduce((s,r) => s + (r.elevationGain || 0), 0);
  const longest = routes.slice().sort((a,b) => b.distanceKm - a.distanceKm)[0];

  let farthest = null, farthestDist = -1;
  cityVisits.forEach(c=>{
    if(c.lat == null || c.lng == null) return;
    const d = haversine([HOME_LOCATION.lat, HOME_LOCATION.lng], [c.lat, c.lng]);
    if(d > farthestDist){ farthestDist = d; farthest = c; }
  });

  document.getElementById('statYearsF').textContent = years.size;
  document.getElementById('statMonthsTraveledF').textContent = monthsTraveled;
  document.getElementById('statMonthsStreakF').textContent = monthsStreak;
  document.getElementById('statGapF').textContent = longestGap > 0
    ? `${longestGap} ${longestGap === 1 ? 'месяц' : (longestGap < 5 ? 'месяца' : 'месяцев')} · ${keyToLabel(gapFrom)} → ${keyToLabel(gapTo)}`
    : (sortedMonths.length > 1 ? 'без перерывов' : '—');
  document.getElementById('statCountriesF').textContent = countryKeys.size;
  document.getElementById('statWorldPct').textContent = `${Math.round((countryKeys.size / COUNTRY_LIST.length) * 100)}%`;
  document.getElementById('statCitiesF').textContent = cityKeys.size;
  document.getElementById('statRunningF').textContent = running;
  document.getElementById('statHikingF').textContent = hiking;
  document.getElementById('statCyclingF').textContent = cycling;
  document.getElementById('statRoadtripF').textContent = roadtrip;
  document.getElementById('statElevationF').textContent = `${Math.round(totalElevation).toLocaleString('ru-RU')} м`;
  document.getElementById('statLongestF').textContent = longest ? `${longest.name} · ${longest.distanceKm.toFixed(1)} км` : '—';
  document.getElementById('statHomeF').textContent = HOME_LOCATION.name;
  document.getElementById('statFarthestF').textContent = farthest ? `${farthest.countryKey ? countryFlag(farthest.countryKey) + ' ' : ''}${farthest.name} · ${Math.round(farthestDist).toLocaleString('ru-RU')} км` : '—';

  renderYearChart(visited);
  renderSeasonChart(visited);
  // беговые графики переехали в отдельное окно «Бег» и рисуются при его открытии
  renderContinentStats(visited);

  const countryCounts = {};
  visited.filter(e => e.type === 'country').forEach(e=>{
    countryCounts[e.name] = (countryCounts[e.name] || 0) + 1;
  });
  const topCountries = Object.entries(countryCounts).sort((a,b) => b[1]-a[1]).slice(0,5);

  const cityCounts = {};
  uniqueCityVisits(cityVisits).forEach(c=>{
    if(c.name.trim().toLowerCase() === HOME_CITY_NAME.toLowerCase()) return; // дом — не «визит», ему тут не место
    const key = c.name.trim();
    cityCounts[key] = (cityCounts[key] || 0) + 1;
  });
  const topCities = Object.entries(cityCounts).sort((a,b) => b[1]-a[1]).slice(0,5);

  renderTopList('topCountriesList', topCountries);
  renderTopList('topCitiesList', topCities);
  updateRuRegions(visited);
  renderSeaStats(visited);
  updateHeat(visited);
}

function renderYearChart(visited){
  const container = document.getElementById('yearChart');
  const counts = {};
  visited.forEach(e => { counts[e.year] = (counts[e.year] || 0) + 1; });
  const years = Object.keys(counts).map(Number).sort((a,b) => a-b);
  if(years.length === 0){
    container.innerHTML = `<div class="hint">Пока нет данных</div>`;
    return;
  }
  const max = Math.max(...years.map(y => counts[y]));
  container.innerHTML = years.map(y => {
    const h = Math.max(2, Math.round((counts[y] / max) * 52));
    return `<div class="year-bar-wrap" title="${y}: ${counts[y]}">
      <div class="year-bar" style="height:${h}px;"></div>
      <div class="year-bar-label">${String(y).slice(2)}</div>
    </div>`;
  }).join('');
}

// Стандартные дистанции с допуском: GPS почти всегда даёт чуть больше
// официальной длины, плюс тренировочные забеги редко ровно 10,00 км
const RACE_DISTANCES = [
  { key: '5k',   ru: '5 км',           min: 4.6,  max: 5.6 },
  { key: '10k',  ru: '10 км',          min: 9.4,  max: 11.0 },
  { key: 'half', ru: 'Полумарафон',    min: 20.0, max: 22.5 },
  { key: 'full', ru: 'Марафон',        min: 41.0, max: 44.5 },
];

function renderBestPaces(visited){
  const container = document.getElementById('bestPaceList');
  const runs = visited.filter(e => e.type === 'route' && e.activity === 'running' && e.durationMin && e.distanceKm);
  const terrainOf = r => r.terrain || guessTerrain(r.distanceKm, r.elevationGain);
  let html = '';
  [{key:'road',ru:'Шоссе'},{key:'trail',ru:'Трейл'}].forEach(t=>{
    const pool = runs.filter(r => terrainOf(r) === t.key);
    if(pool.length === 0) return;
    const rows = [];
    RACE_DISTANCES.forEach(d=>{
      const inBucket = pool.filter(r => r.distanceKm >= d.min && r.distanceKm <= d.max);
      if(inBucket.length === 0) return;
      const best = inBucket.reduce((a,b) => (a.durationMin/a.distanceKm) <= (b.durationMin/b.distanceKm) ? a : b);
      rows.push({ label: d.ru, pace: best.durationMin/best.distanceKm, entry: best, count: inBucket.length });
    });
    if(rows.length === 0) return;
    html += `<div class="hint" style="margin:6px 0 3px;">${t.ru}</div>` + rows.map(r=>{
      const gpk = (r.entry.elevationGain != null && r.entry.distanceKm)
        ? ` · ${Math.round(r.entry.elevationGain / r.entry.distanceKm)} м/км` : '';
      return `<div class="stat-row">
        <span>${r.label}${r.count > 1 ? ` <span style="opacity:0.6;">из ${r.count}</span>` : ''}</span>
        <b>${formatPace(r.pace)}</b>
      </div>
      <div class="hint" style="margin:-4px 0 2px;">${escapeHtml(r.entry.name)} · ${r.entry.distanceKm.toFixed(1)} км${gpk} · ${monthLabel(r.entry.month) ? monthLabel(r.entry.month) + ' ' : ''}${r.entry.year}</div>`;
    }).join('');
  });
  container.innerHTML = html || `<div class="hint">Нет забегов, попадающих в стандартные дистанции (5 км, 10 км, полумарафон, марафон).</div>`;
}


// Сезонность: сколько отметок приходится на каждый месяц, сложенные за все
// годы. Календарь показывает конкретные месяцы конкретных лет, а здесь видно
// общую привычку — когда вы обычно уезжаете, а когда почти никогда.
// Новых стран в год: для каждой страны берём самый ранний год визита и считаем,
// сколько стран «открылось» в каждом году. Отличается от графика «По годам»,
// который считает все отметки: повторные поездки сюда не попадают.
//
// Считаем по ВСЕМ записям, а не по отфильтрованным, и это осознанно: «впервые»
// имеет смысл только относительно полной истории. При фильтре по одному году
// каждая страна в нём выглядела бы новой, что попросту неверно. В заголовке
// раздела это оговорено, чтобы расхождение с остальными графиками не удивляло.
function renderNewCountriesChart(){
  const container = document.getElementById('newCountriesChart');
  const hint = document.getElementById('newCountriesHint');
  if(!container) return;
  const firstYear = {};
  allEntries.forEach(e=>{
    if(e.type !== 'country' || e.status === 'wishlist' || !e.year || !e.countryKey) return;
    if(firstYear[e.countryKey] === undefined || e.year < firstYear[e.countryKey]) firstYear[e.countryKey] = e.year;
  });
  const keys = Object.keys(firstYear);
  if(keys.length === 0){
    container.innerHTML = `<div class="hint">Пока нет отмеченных стран с указанным годом</div>`;
    if(hint) hint.textContent = '';
    return;
  }
  const counts = {};
  keys.forEach(k=>{ counts[firstYear[k]] = (counts[firstYear[k]] || 0) + 1; });
  const years = Object.keys(counts).map(Number).sort((a,b)=>a-b);
  // непрерывный ряд лет: год без новых стран — тоже часть картины, пропуск в
  // ряду создавал бы ложное впечатление, что открытия шли без паузы
  const full = [];
  for(let y = years[0]; y <= years[years.length-1]; y++) full.push(y);
  const max = Math.max(...full.map(y => counts[y] || 0));
  let running = 0;
  container.innerHTML = full.map(y=>{
    const n = counts[y] || 0;
    running += n;
    const h = n === 0 ? 0 : Math.max(4, Math.round((n / max) * 44));
    const title = n === 0
      ? `${y}: новых стран нет, всего к концу года: ${running}`
      : `${y}: +${n} ${n === 1 ? 'страна' : (n < 5 ? 'страны' : 'стран')}, всего к концу года: ${running}`;
    return `<div class="year-bar-wrap" title="${title}">
      <div class="pace-value-label">${n || ''}</div>
      <div class="year-bar" style="height:${h}px;${n === 0 ? 'background:repeating-linear-gradient(45deg,var(--line),var(--line) 2px,transparent 2px 4px);min-height:3px;' : 'background:var(--amber);'}"></div>
      <div class="year-bar-label">${String(y).slice(2)}</div>
    </div>`;
  }).join('');
  const best = full.reduce((a,y) => (counts[y] || 0) > (counts[a] || 0) ? y : a, full[0]);
  if(hint) hint.textContent = `Всего стран: ${keys.length} · самый насыщенный год — ${best} (+${counts[best] || 0})`;
}

function renderSeasonChart(visited){
  const container = document.getElementById('seasonChart');
  if(!container) return;
  const counts = new Array(13).fill(0);
  visited.forEach(e=>{ if(e.month >= 1 && e.month <= 12) counts[e.month]++; });
  const max = Math.max(...counts.slice(1));
  if(max === 0){
    container.innerHTML = `<div class="hint" style="grid-column:1/-1;">Ни у одной записи не указан месяц — сезонность посчитать не из чего</div>`;
    return;
  }
  container.innerHTML = MONTHS.map(m=>{
    const n = counts[m.key];
    const h = n === 0 ? 0 : Math.max(4, Math.round((n / max) * 44));
    const cls = n === 0 ? 'zero' : (n === max ? 'peak' : '');
    return `<div class="season-col" title="${m.ru}: ${n}">
      <div class="season-cnt">${n || ''}</div>
      <div class="season-bar ${cls}" style="height:${h}px;"></div>
      <div class="season-lbl">${m.short}</div>
    </div>`;
  }).join('');
}

function renderContinentStats(visited){
  const container = document.getElementById('continentStats');
  const countryEntries = visited.filter(e => e.type === 'country');
  const visitedKeys = new Set(countryEntries.map(e => e.countryKey));
  const byContinent = {};
  visitedKeys.forEach(key=>{
    const cont = COUNTRY_CONTINENT[key];
    if(!cont) return;
    byContinent[cont] = (byContinent[cont] || 0) + 1;
  });
  container.innerHTML = CONTINENT_ORDER.map(cont=>{
    const total = CONTINENT_TOTALS[cont] || 0;
    const count = byContinent[cont] || 0;
    const pct = total > 0 ? Math.round((count/total)*100) : 0;
    return `<div class="continent-row">
      <div class="continent-name">${cont}</div>
      <div class="continent-bar-track"><div class="continent-bar-fill" style="width:${pct}%;"></div></div>
      <div class="continent-pct">${count}/${total} · ${pct}%</div>
    </div>`;
  }).join('');
}


function renderTopList(containerId, items){
  const container = document.getElementById(containerId);
  if(items.length === 0){
    container.innerHTML = `<div class="hint">Пока нет данных</div>`;
    return;
  }
  container.innerHTML = items.map(([name, count], i) => `
    <div class="top-item">
      <span class="top-rank">${i+1}</span>
      <span class="top-name">${escapeHtml(name)}</span>
      <span class="top-count">${count} ${pluralVisits(count)}</span>
    </div>
  `).join('');
}

