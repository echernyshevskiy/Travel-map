// ---------- passport modal ----------
document.getElementById('openPassportBtn').addEventListener('click', ()=>{
  passportSearchQuery = '';
  passportSpread = 0; // открываем с обложки, как настоящую книжку
  document.getElementById('passportSearchInput').value = '';
  renderPassport();
  document.getElementById('passportModal').style.display = 'flex';
});

function renderCalendar(){
  const visited = allEntries.filter(e => e.status !== 'wishlist' && e.year);
  const table = document.getElementById('calendarTable');
  if(visited.length === 0){
    document.getElementById('calendarCount').textContent = '';
    table.innerHTML = `<tr><td style="border:none;color:var(--text-dim);padding:20px 4px;">Пока нет посещённых отметок с указанным годом.</td></tr>`;
    return;
  }
  const minYear = Math.min(...visited.map(e => e.year));
  const maxYear = Math.max(...visited.map(e => e.year));
  const traveled = new Set(visited.filter(e => e.month).map(e => `${e.year}-${e.month}`));

  document.getElementById('calendarCount').textContent = `${minYear}–${maxYear} · ✈️ отмечен месяц, в котором есть хотя бы одна посещённая точка с указанным месяцем`;

  let html = `<thead><tr><th>Год</th>${MONTHS.map(m => `<th>${m.short}</th>`).join('')}</tr></thead><tbody>`;
  for(let year = minYear; year <= maxYear; year++){
    html += `<tr><td>${year}</td>`;
    MONTHS.forEach(m=>{
      const hit = traveled.has(`${year}-${m.key}`);
      html += `<td class="${hit ? 'traveled' : ''}">${hit ? '✈️' : ''}</td>`;
    });
    html += `</tr>`;
  }
  html += '</tbody>';
  table.innerHTML = html;
}

document.getElementById('openCalendarBtn').addEventListener('click', ()=>{
  renderCalendar();
  document.getElementById('calendarModal').style.display = 'flex';
});

// расстояние Левенштейна — нужно для поиска похожих (возможно, опечатанных) названий городов
function levenshtein(a, b){
  const m = a.length, n = b.length;
  const dp = Array.from({length: m+1}, () => new Array(n+1).fill(0));
  for(let i=0;i<=m;i++) dp[i][0] = i;
  for(let j=0;j<=n;j++) dp[0][j] = j;
  for(let i=1;i<=m;i++){
    for(let j=1;j<=n;j++){
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

function buildDiagSection(title, hint, items, emptyText, renderRow){
  const badge = items.length > 0
    ? `<span class="diag-count-badge">${items.length}</span>`
    : `<span class="diag-count-badge ok">✓</span>`;
  const body = items.length > 0
    ? `<div class="diag-list">${items.map(renderRow).join('')}</div>`
    : `<div class="diag-empty">${emptyText}</div>`;
  return `<div class="diag-section">
    <p class="diag-section-title">${title} ${badge}</p>
    ${hint ? `<div class="diag-section-hint">${hint}</div>` : ''}
    ${body}
  </div>`;
}

// Отклонённые пары похожих названий: список хранится отдельно от данных,
// чтобы не попадать в экспорт и не путать при переносе на другое устройство.
const DISMISSED_PAIRS_KEY = 'travel-map-dismissed-pairs';
function pairKey(a, b){
  return [String(a).trim().toLowerCase(), String(b).trim().toLowerCase()].sort().join('||');
}
function readDismissedPairs(){
  try{ return new Set(JSON.parse(localStorage.getItem(DISMISSED_PAIRS_KEY) || '[]')); }
  catch(e){ return new Set(); }
}
function dismissPair(a, b){
  const s = readDismissedPairs();
  s.add(pairKey(a, b));
  try{ localStorage.setItem(DISMISSED_PAIRS_KEY, JSON.stringify([...s])); }catch(e){}
}
function restoreDismissedPairs(){
  try{ localStorage.removeItem(DISMISSED_PAIRS_KEY); }catch(e){}
}

function computeDiagnostics(){
  const noMonth = allEntries.filter(e => e.status !== 'wishlist' && e.year && !e.month);

  function findSimilarPairs(names){
    const pairs = [];
    // Сравнение попарное, то есть квадратичное, а сам расчёт расстояния ещё и
    // не бесплатный. Отсекаем заведомо непохожие по длине: если длины
    // различаются больше чем на 2, расстояние точно больше 2 — считать нечего.
    const prepared = names.map(n => ({ n, low: n.toLowerCase(), len: n.length }));
    for(let i=0;i<prepared.length;i++){
      for(let j=i+1;j<prepared.length;j++){
        const a = prepared[i], b = prepared[j];
        if(Math.abs(a.len - b.len) > 2) continue;
        if(a.low === b.low) continue;
        const maxLen = Math.max(a.len, b.len);
        // допустимое расстояние для этой пары: не больше 2 и не больше 30% длины.
        // если получается 0, совпадение невозможно и считать нечего
        const allowed = Math.min(2, Math.floor(maxLen * 0.3));
        if(allowed < 1) continue;
        const dist = levenshtein(a.low, b.low);
        if(dist > 0 && dist <= allowed) pairs.push([a.n, b.n]);
      }
    }
    return pairs;
  }

  const cityNames = [...new Set(getAllCityVisits(allEntries).map(c => c.name.trim()).filter(Boolean))];
  // Пары вроде «Коломна ↔ Коломбо» — не ошибка: города разные, просто названия
  // созвучны. Без возможности отметить это проверка вечно показывала бы находку,
  // которую нельзя закрыть, и значок на кнопке терял бы смысл.
  const dismissed = readDismissedPairs();
  const similarPairs = findSimilarPairs(cityNames)
    .filter(([a,b]) => !dismissed.has(pairKey(a,b)));

  const tripNames = [...new Set(allEntries.map(e => e.trip).filter(Boolean).map(t => t.trim()))];
  const similarTripPairs = findSimilarPairs(tripNames)
    .filter(([a,b]) => !dismissed.has(pairKey(a,b)));

  const missingCoords = allEntries.filter(e => e.type === 'route' && e.waypointNames && e.waypointNames.length > 0 &&
    (!e.waypointCoords || e.waypointCoords.length !== e.waypointNames.length || e.waypointCoords.some(c => !c || c[0] == null)));

  const noCountry = allEntries.filter(e => e.type === 'city' && !e.countryKey);

  function looksLikeUrl(raw){
    if(!raw) return true; // пусто — не ошибка, просто не заполнено
    try{ new URL(safeUrl(raw)); return true; }catch(err){ return false; }
  }
  const brokenLinks = [];
  allEntries.forEach(e=>{
    const fields = [
      ['Instagram', e.instagramUrl],
      ['карта', e.mapLinkUrl],
      ['документ', e.docLinkUrl],
    ];
    fields.forEach(([label, value])=>{
      if(value && !looksLikeUrl(value)) brokenLinks.push({ entry: e, label: `${e.name} — ${label}`, value });
    });
    (e.photos || []).forEach((p, i)=>{
      if(p && !looksLikeUrl(p)) brokenLinks.push({ entry: e, label: `${e.name} — фото ${i+1}`, value: p });
    });
  });

  const nonImagePhotos = [];
  allEntries.forEach(e=>{
    (e.photos || []).forEach((p, i)=>{
      const problem = photoLinkProblem(p);
      if(problem) nonImagePhotos.push({ entry: e, label: `${e.name} — фото ${i+1}`, reason: problem });
    });
  });

  // Похоже на одну поездку. Точных дат в записях нет — только год и месяц,
  // поэтому «рядом по времени» = тот же месяц. Одного этого мало: в один месяц
  // могли быть две разные поездки, поэтому внутри месяца ещё делим по географии.
  const TRIP_CLUSTER_KM = 1200;
  const tripSuggestions = [];
  const byMonth = {};
  allEntries.forEach(e=>{
    if(e.trip || e.status === 'wishlist' || !e.year || !e.month) return;
    const k = `${e.year}-${e.month}`;
    (byMonth[k] = byMonth[k] || []).push(e);
  });
  Object.values(byMonth).forEach(group=>{
    if(group.length < 2) return;
    // простая кластеризация: запись присоединяется к кластеру, если она рядом
    // хотя бы с одной его записью
    const pts = group.map(e => ({ e, p: getEntryRepresentativePoint(e) }));
    const clusters = [];
    pts.forEach(item=>{
      if(!item.p){ // без координат географию не проверить — кладём в общий кластер месяца
        const any = clusters.find(c => c.noGeo);
        if(any) any.items.push(item); else clusters.push({ noGeo:true, items:[item] });
        return;
      }
      const near = clusters.find(c => !c.noGeo && c.items.some(x => x.p && haversine(x.p, item.p) <= TRIP_CLUSTER_KM));
      if(near) near.items.push(item); else clusters.push({ noGeo:false, items:[item] });
    });
    clusters.forEach(c=>{
      if(c.items.length < 2) return;
      const entries = c.items.map(x => x.e);
      // имя предлагаем по стране, если она одна на всю группу
      const keys = [...new Set(entries.map(e => e.countryKey).filter(Boolean))];
      const base = keys.length === 1 ? (COUNTRY_RU[keys[0]] || keys[0]) : 'Поездка';
      const first = entries[0];
      const suggested = `${base} · ${monthLabel(first.month) || first.month} ${first.year}`;
      tripSuggestions.push({ entries, suggested, month: first.month, year: first.year });
    });
  });

  // Город за год есть, а отметки страны за тот же год нет. Визиты стран
  // считаются по годам, поэтому такой пропуск молча занижает и топ стран,
  // и «новых стран в год», и фильтр по году.
  const countryYearPresent = new Set();
  allEntries.forEach(e=>{
    if(e.type === 'country' && e.status !== 'wishlist' && e.countryKey && e.year){
      countryYearPresent.add(`${e.countryKey}|${e.year}`);
    }
  });
  const missingMap = {};
  const noteMissing = (countryKey, year, label)=>{
    if(!countryKey || !year || countryKey === HOME_COUNTRY_KEY) return;
    const k = `${countryKey}|${year}`;
    if(countryYearPresent.has(k)) return;
    if(!missingMap[k]) missingMap[k] = { countryKey, year, places: [], source: null };
    if(missingMap[k].places.length < 6 && !missingMap[k].places.includes(label)) missingMap[k].places.push(label);
  };
  allEntries.forEach(e=>{
    if(e.status === 'wishlist' || !e.year) return;
    if(e.type === 'city'){
      noteMissing(e.countryKey, e.year, e.name);
      if(e.countryKey && !missingMap[`${e.countryKey}|${e.year}`]) return;
      if(missingMap[`${e.countryKey}|${e.year}`] && !missingMap[`${e.countryKey}|${e.year}`].source) missingMap[`${e.countryKey}|${e.year}`].source = e;
    } else if(e.type === 'route' && e.waypointCountryKeys && e.waypointNames){
      e.waypointCountryKeys.forEach((k, i)=>{
        noteMissing(k, e.year, e.waypointNames[i]);
        const key = `${k}|${e.year}`;
        if(missingMap[key] && !missingMap[key].source) missingMap[key].source = e;
      });
    }
  });
  const missingCountryYears = Object.values(missingMap).sort((a,b)=> b.year - a.year);

  // Маршруты, у точек которых не определена страна. Это влияет не только на
  // поиск: такие точки не дают флага, не попадают в паспорт, в список поездок
  // страны и в статистику по континентам.
  const routesNoWpCountry = allEntries.filter(e =>
    e.type === 'route' && e.status !== 'wishlist' &&
    Array.isArray(e.waypointNames) && e.waypointNames.length > 0 &&
    !(e.waypointCountryKeys || []).some(Boolean));

  const dupeGroups = {};
  allEntries.forEach(e=>{
    const key = `${e.type}|${e.name.trim().toLowerCase()}|${e.year}|${e.month || 'none'}`;
    (dupeGroups[key] = dupeGroups[key] || []).push(e);
  });
  const duplicateGroups = Object.values(dupeGroups).filter(group => group.length > 1);

  // точки маршрута, стоящие подозрительно далеко от остальных точек ТОГО ЖЕ маршрута —
  // типичный симптом неоднозначного геокодирования (например, «Дублин, Ирландия» превратился
  // в «Дублин, Огайо»): сравниваю расстояние каждой точки до центра масс маршрута с медианным
  // расстоянием остальных точек до того же центра, а не с фиксированным порогом — так работает
  // и для компактной поездки по одному городу, и для растянутого автотрипа через полстраны
  const outlierWaypoints = [];
  allEntries.forEach(e=>{
    if(e.type !== 'route' || !e.waypointCoords || e.waypointNames.length < 3) return;
    const pts = e.waypointCoords.map((c,i) => c ? {i, lat:c[0], lng:c[1]} : null).filter(Boolean);
    if(pts.length < 3) return;
    const centroid = [
      pts.reduce((s,p) => s+p.lat, 0) / pts.length,
      pts.reduce((s,p) => s+p.lng, 0) / pts.length
    ];
    const distances = pts.map(p => ({ i: p.i, dist: haversine(centroid, [p.lat, p.lng]) }));
    const sorted = distances.map(d => d.dist).slice().sort((a,b) => a-b);
    const median = sorted[Math.floor(sorted.length/2)];
    distances.forEach(d=>{
      if(d.dist > 300 && d.dist > median * 4){
        outlierWaypoints.push({ entry: e, name: e.waypointNames[d.i], dist: d.dist });
      }
    });
  });

  // страна, реально указанная у записи, сверяется с тем, в границы какой страны
  // фактически попадают её координаты (та же геометрия, что для клика по карте).
  // Ловит случаи вроде «страна определилась, но не та» — то, что проверка «без
  // страны» пропускает, ведь там страна как раз есть, просто неверная
  const countryMismatches = [];
  allEntries.forEach(e=>{
    if(e.type === 'city' && e.countryKey && e.lat != null && e.lng != null){
      const feature = findCountryFeature({ lat: e.lat, lng: e.lng });
      const actualKey = feature ? feature.properties.name : null;
      if(actualKey && actualKey !== e.countryKey){
        countryMismatches.push({ entry: e, label: e.name, saved: COUNTRY_RU[e.countryKey] || e.countryKey, actual: COUNTRY_RU[actualKey] || actualKey, actualKey, wpIndex: null });
      }
    } else if(e.type === 'route' && e.waypointCoords && e.waypointCountryKeys){
      e.waypointCoords.forEach((c, i)=>{
        const savedKey = e.waypointCountryKeys[i];
        if(!c || c[0] == null || !savedKey) return;
        const feature = findCountryFeature({ lat: c[0], lng: c[1] });
        const actualKey = feature ? feature.properties.name : null;
        if(actualKey && actualKey !== savedKey){
          countryMismatches.push({ entry: e, label: `${e.waypointNames[i]} (${e.name})`, saved: COUNTRY_RU[savedKey] || savedKey, actual: COUNTRY_RU[actualKey] || actualKey, actualKey, wpIndex: i });
        }
      });
    }
  });

  const typeLabel = e => e.type === 'country' ? 'страна' : e.type === 'city' ? 'город' : 'маршрут';

  // Остановки, до которых трек маршрута не доходит ближе 30 км: на карте они
  // остаются в стороне от линии — скорее всего, геокодер нашёл не то место
  const farStops = [];
  allEntries.forEach(e => {
    if(e.type !== 'route' || e.isEstimated || !Array.isArray(e.waypointCoords) || !Array.isArray(e.waypointNames)) return;
    const segs = entrySegments(e).filter(s => s.length >= 2);
    if(!segs.length || segs.reduce((n, s) => n + s.length, 0) <= e.waypointCoords.length) return;
    e.waypointCoords.forEach((c, i) => {
      if(!c || !e.waypointNames[i]) return;
      const s = snapToTrack(c, segs, Infinity);
      if(s && s.km > ROUTE_STOP_SNAP_KM) farStops.push({ entry: e, i, name: e.waypointNames[i], km: s.km });
    });
  });
  farStops.sort((a, b) => b.km - a.km);
  // Вместо города — район, муниципалитет или сельсовет
  const adminNames = [];
  allEntries.forEach(e => {
    if(e.type === 'city' && looksLikeAdminArea(e.name)) adminNames.push({ entry: e, i: null, name: e.name, clean: cleanPlaceName(e.name) });
    if(e.type === 'route' && Array.isArray(e.waypointNames)) e.waypointNames.forEach((n, i) => {
      if(n && looksLikeAdminArea(n)) adminNames.push({ entry: e, i, name: n, clean: cleanPlaceName(n) });
    });
  });
  return { farStops, adminNames, countryMismatches, outlierWaypoints, noMonth, similarPairs, similarTripPairs, missingCoords, brokenLinks, nonImagePhotos, duplicateGroups, noCountry, missingCountryYears, routesNoWpCountry, tripSuggestions, typeLabel };
}

// суммарное число находок — для бейджа на кнопке, чтобы не приходилось
// открывать панель только ради того, чтобы узнать, есть ли что чинить
function countDiagnosticsIssues(){
  try{
    const d = computeDiagnostics();
    return d.farStops.length + d.adminNames.length + d.countryMismatches.length + d.outlierWaypoints.length + d.noMonth.length +
           d.similarPairs.length + d.similarTripPairs.length + d.missingCoords.length +
           d.brokenLinks.length + d.nonImagePhotos.length + d.duplicateGroups.length + d.noCountry.length +
           d.missingCountryYears.length + d.routesNoWpCountry.length;
  }catch(err){
    console.error('countDiagnosticsIssues failed', err);
    return 0;
  }
}

let diagBadgeTimer = null;
function updateDiagnosticsBadge(){
  // Полная проверка данных стоит десятки миллисекунд и висит на каждом
  // изменении данных — вплоть до переключения сердечка. Откладываем расчёт,
  // чтобы он не задерживал видимое обновление интерфейса.
  if(diagBadgeTimer) clearTimeout(diagBadgeTimer);
  diagBadgeTimer = setTimeout(()=>{ diagBadgeTimer = null; computeDiagnosticsBadgeNow(); }, 120);
}

function computeDiagnosticsBadgeNow(){
  const btn = document.getElementById('openDiagnosticsBtn');
  if(!btn || READ_ONLY) return;
  const n = countDiagnosticsIssues();
  const existing = btn.querySelector('.diag-badge');
  if(existing) existing.remove();
  if(n > 0) btn.insertAdjacentHTML('beforeend', `<span class="diag-badge">${n}</span>`);
}

function renderDiagnostics(){
  const container = document.getElementById('diagnosticsBody');
  const { farStops, adminNames, countryMismatches, outlierWaypoints, noMonth, similarPairs, similarTripPairs,
          missingCoords, brokenLinks, nonImagePhotos, duplicateGroups, noCountry,
          missingCountryYears, routesNoWpCountry, tripSuggestions, typeLabel } = computeDiagnostics();

  let html = '';
  html += buildDiagSection(
    'Несовпадение сохранённой и фактической страны',
    'Координаты записи на самом деле попадают в границы другой страны, чем сохранено — обычно значит, что при поиске подтянулся не тот город (например, одноимённый в другой стране).',
    countryMismatches, 'У всех записей сохранённая страна совпадает с той, где реально находятся координаты.',
    (m, i) => `<div class="diag-row" style="cursor:default;">
      <span data-diag-id="${m.entry.id}" style="cursor:pointer;">${escapeHtml(m.label)}</span>
      <div class="diag-row-meta">записано: ${escapeHtml(m.saved)} · по факту: ${escapeHtml(m.actual)}</div>
      <div class="diag-merge">
        <button data-fixcountry-idx="${i}">Исправить на «${escapeHtml(m.actual)}»</button>
      </div>
    </div>`
  );
  if(countryMismatches.length > 1){
    // все находки этой секции обычно относятся к одной причине (сместившаяся
    // граница, неверно выбранный город), поэтому чинить их по одной утомительно
    html += `<div style="padding:0 20px 14px;margin-top:-8px;">
      <button class="cancel-edit" id="fixAllCountriesBtn" style="margin-top:0;">Исправить все ${countryMismatches.length} на фактическую страну</button>
    </div>`;
  }
  html += buildDiagSection(
    'Точки маршрута далеко от остальных',
    'Похоже на ошибку геокодирования — одноимённый город на другом континенте (например, «Дублин, Огайо» вместо «Дублин, Ирландия»). Откройте маршрут и пересоздайте именно эту точку через поиск, явно выбрав нужную страну из списка вариантов.',
    outlierWaypoints, 'Все точки маршрутов стоят рядом друг с другом — аномалий не найдено.',
    o => `<div class="diag-row" data-diag-id="${o.entry.id}">${escapeHtml(o.name)}<div class="diag-row-meta">${escapeHtml(o.entry.name)} · ~${Math.round(o.dist).toLocaleString('ru-RU')} км от остальных точек</div></div>`
  );
  html += buildDiagSection(
    'Остановки далеко от трека',
    'Трек маршрута не проходит ближе 30 км от этой остановки, поэтому на карте точка висит в стороне. Чаще всего геокодер нашёл одноимённое место в другой области или стране — откройте маршрут и выберите остановку заново.',
    farStops, 'Все остановки маршрутов с треками лежат на своих треках.',
    (o, i) => `<div class="diag-row" style="cursor:default;"><span data-diag-id="${o.entry.id}" style="cursor:pointer;">${escapeHtml(cleanPlaceName(o.name))}</span><div class="diag-row-meta">${escapeHtml(o.entry.name)} · ${Math.round(o.km).toLocaleString('ru-RU')} км от трека</div>
      ${!READ_ONLY ? `<div class="diag-merge"><button data-findplace="far:${i}">Выбрать место заново…</button></div><div class="diag-find" hidden></div>` : ''}</div>`
  );
  html += buildDiagSection(
    'Район вместо города',
    'Геокодер записал административную единицу — район, муниципалитет, сельсовет. Где из названия понятно место, его можно сократить одной кнопкой; остальные лучше выбрать заново через поиск.',
    adminNames, 'Все названия — населённые пункты.',
    (o, i) => `<div class="diag-row" style="cursor:default;"><span data-diag-id="${o.entry.id}" style="cursor:pointer;">${escapeHtml(o.name)}</span>
      <div class="diag-row-meta">${o.i == null ? 'город' : 'остановка маршрута «' + escapeHtml(o.entry.name) + '»'}</div>
      ${!READ_ONLY ? `<div class="diag-merge">${o.clean && o.clean !== o.name ? `<button data-fixadmin-idx="${i}">Сократить до «${escapeHtml(o.clean)}»</button>` : ''}<button data-findplace="admin:${i}">Найти населённый пункт…</button></div><div class="diag-find" hidden></div>` : ''}</div>`
  );
  html += buildDiagSection(
    'Записи без месяца',
    'Не учитываются в статистике «Пропутешествовано месяцев», «Месяцев подряд» и в Календаре.',
    noMonth, 'У всех посещённых записей с годом указан и месяц.',
    e => `<div class="diag-row" data-diag-id="${e.id}">${escapeHtml(e.name)}<div class="diag-row-meta">${e.year} · ${typeLabel(e)}</div></div>`
  );
  html += buildDiagSection(
    'Похожие названия городов',
    'Возможные опечатки — один и тот же город под разными написаниями считается как два разных места.',
    similarPairs, 'Явных похожих написаний не найдено.',
    ([a,b]) => `<div class="diag-row" style="cursor:default;">${escapeHtml(a)} ↔ ${escapeHtml(b)}
      ${READ_ONLY ? '' : `<button class="diag-dismiss" data-dismiss-a="${escapeAttr(a)}" data-dismiss-b="${escapeAttr(b)}">это разные места</button>`}
    </div>`
  );
  html += buildDiagSection(
    'Похожие названия поездок',
    'Возможные опечатки — одна и та же поездка под разными написаниями тега считается как две разные в списке поездок.',
    similarTripPairs, 'Явных похожих написаний тегов поездок не найдено.',
    ([a,b]) => `<div class="diag-row" style="cursor:default;">${escapeHtml(a)} ↔ ${escapeHtml(b)}
      ${READ_ONLY ? '' : `<button class="diag-dismiss" data-dismiss-a="${escapeAttr(a)}" data-dismiss-b="${escapeAttr(b)}">это разные поездки</button>`}
    </div>`
  );
  html += buildDiagSection(
    'Маршруты без координат точек',
    'Есть названные города, но не сохранены координаты — не попадут в «Самую дальнюю точку» и на PNG-снимок. Откройте запись и нажмите «Обновить координаты точек маршрута».',
    missingCoords, 'У всех маршрутов с названными городами координаты сохранены.',
    e => `<div class="diag-row" data-diag-id="${e.id}">${escapeHtml(e.name)}<div class="diag-row-meta">${e.year} · ${e.waypointNames.length} точек</div></div>`
  );
  html += buildDiagSection(
    'Возможно нерабочие ссылки',
    'Значение не похоже на ссылку — вероятно, вставлен не тот текст или адрес обрезался при копировании.',
    brokenLinks, 'Все указанные ссылки похожи на настоящие адреса.',
    b => `<div class="diag-row" data-diag-id="${b.entry.id}">${escapeHtml(b.label)}<div class="diag-row-meta">${escapeHtml(b.value)}</div></div>`
  );
  html += buildDiagSection(
    'Фото не отобразятся',
    'Ссылка ведёт на страницу или альбом, а не на сам файл изображения — в карточках останется пустое место. Нужна прямая ссылка на картинку.',
    nonImagePhotos, 'Все ссылки на фото ведут прямо на изображения.',
    n => `<div class="diag-row" data-diag-id="${n.entry.id}">${escapeHtml(n.label)}<div class="diag-row-meta">${escapeHtml(n.reason)}</div></div>`
  );
  html += buildDiagSection(
    'Возможные дубли записей',
    'Одинаковый тип, название, год и месяц (если указан) — вероятно, добавлено случайно дважды. Один и тот же город в разные месяцы не считается дублем.',
    duplicateGroups, 'Явных дублей не найдено.',
    group => `<div class="diag-row" data-diag-id="${group[0].id}">${escapeHtml(group[0].name)}<div class="diag-row-meta">${monthLabel(group[0].month) ? monthLabel(group[0].month) + ' ' : ''}${group[0].year} · ${typeLabel(group[0])} · ${group.length} записи</div></div>`
  );
  html += buildDiagSection(
    'Города без определённой страны',
    'Не удалось сопоставить страну — не будет флага и информации о стране в попапе.',
    noCountry, 'У всех городов определена страна.',
    e => `<div class="diag-row" data-diag-id="${e.id}">${escapeHtml(e.name)}<div class="diag-row-meta">${e.year}</div></div>`
  );
  html += buildDiagSection(
    'Есть города, но страна за этот год не отмечена',
    'Визиты стран считаются по годам, поэтому такой пропуск занижает топ стран, «новых стран в год» и выдачу при фильтре по году.',
    missingCountryYears, 'Для каждого года, где есть города, отмечена и страна.',
    (m, i) => `<div class="diag-row" style="cursor:default;">
      ${countryFlag(m.countryKey) ? countryFlag(m.countryKey) + ' ' : ''}${escapeHtml(COUNTRY_RU[m.countryKey] || m.countryKey)} · ${m.year}
      <div class="diag-row-meta">${escapeHtml(m.places.join(', '))}${m.places.length >= 6 ? ' …' : ''}</div>
      <div class="diag-merge">
        <button data-addcountry-idx="${i}">Отметить страну за ${m.year}</button>
      </div>
    </div>`
  );
  html += buildDiagSection(
    'У точек маршрута не определена страна',
    'Такие точки не дают флага, не попадают в паспорт, в список поездок страны и не находятся поиском по стране. Обновление заново находит города по их названиям.',
    routesNoWpCountry, 'У всех маршрутов с точками страны определены.',
    (e, i) => `<div class="diag-row" style="cursor:default;">
      ${escapeHtml(e.name)}
      <div class="diag-row-meta">${e.year || ''} · точек: ${e.waypointNames.length} — ${escapeHtml(e.waypointNames.slice(0,4).join(', '))}${e.waypointNames.length > 4 ? ' …' : ''}</div>
    </div>`
  );
  if(routesNoWpCountry.length && !READ_ONLY){
    const totalPts = routesNoWpCountry.reduce((s,e)=> s + e.waypointNames.length, 0);
    html += `<div style="padding:0 20px 14px;margin-top:-8px;">
      <button class="cancel-edit" id="fixWpCountriesBtn" style="margin-top:0;">Определить страны для ${routesNoWpCountry.length} ${routesNoWpCountry.length === 1 ? 'маршрута' : 'маршрутов'}</button>
      <div class="hint">Точек всего ${totalPts}. Поиск идёт по одной точке в секунду — займёт около ${Math.ceil(totalPts * 1.1 / 60)} мин. Окно можно не закрывать.</div>
    </div>`;
  }
  const dismissedCount = readDismissedPairs().size;
  if(dismissedCount && !READ_ONLY){
    html += `<div style="padding:0 20px 12px;">
      <button class="cancel-edit" id="restorePairsBtn" style="margin-top:0;">Показать скрытые пары (${dismissedCount})</button>
    </div>`;
  }
  html += buildDiagSection(
    'Похоже на одну поездку',
    'Записи одного месяца, расположенные рядом друг с другом и пока не собранные в поездку. Название можно изменить перед объединением.',
    tripSuggestions, 'Все записи либо уже собраны в поездки, либо не похожи на одну.',
    (s, i) => `<div class="diag-row" style="cursor:default;">
      ${s.entries.map(e => escapeHtml(e.name)).join(' · ')}
      <div class="diag-row-meta">${monthLabel(s.month) || s.month} ${s.year} · записей: ${s.entries.length}</div>
      <div class="diag-merge">
        <input type="text" value="${escapeAttr(s.suggested)}" data-merge-name="${i}" aria-label="Название поездки">
        <button data-merge-idx="${i}">Объединить</button>
      </div>
    </div>`
  );

  container.innerHTML = html;
  container.querySelectorAll('[data-diag-id]').forEach(row=>{
    row.addEventListener('click', ()=>{
      const entry = allEntries.find(e => e.id === row.dataset.diagId);
      if(!entry) return;
      document.getElementById('diagnosticsModal').style.display = 'none';
      startEdit(entry);
    });
  });

  // применяет фактическую страну: у города это поле записи, у маршрута —
  // страна конкретной точки в массиве
  function applyCountryFix(m){
    if(!m || !m.actualKey) return false;
    if(m.wpIndex === null || m.wpIndex === undefined){
      m.entry.countryKey = m.actualKey;
    } else {
      if(!Array.isArray(m.entry.waypointCountryKeys)) return false;
      m.entry.waypointCountryKeys[m.wpIndex] = m.actualKey;
    }
    return true;
  }

  container.querySelectorAll('[data-fixcountry-idx]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const m = countryMismatches[parseInt(btn.dataset.fixcountryIdx, 10)];
      if(!m || !m.actualKey) return;
      recordBulkAction('исправление страны', [m.entry], ['countryKey','waypointCountryKeys'], []);
      if(!applyCountryFix(m)) return;
      btn.disabled = true;
      const saved = await saveData();
      rebuildAll();
      renderDiagnostics();
      if(saved) showUndoToast(`Страна исправлена: ${m.label} → ${m.actual}`);
    });
  });

  // замена района или далёкой остановки на найденный населённый пункт:
  // поиск начинается с догадки по названию и смещён к прежней точке
  container.querySelectorAll('[data-findplace]').forEach(btn => {
    btn.addEventListener('click', () => {
      const [kind, idx] = btn.dataset.findplace.split(':');
      const o = (kind === 'far' ? farStops : adminNames)[parseInt(idx, 10)];
      const box = btn.closest('.diag-row').querySelector('.diag-find');
      if(!o || !box) return;
      if(!box.hidden){ box.hidden = true; return; }
      box.hidden = false;
      const here = o.i == null ? (o.entry.lat != null ? [o.entry.lat, o.entry.lng] : null) : ((o.entry.waypointCoords || [])[o.i] || null);
      box.innerHTML = `<div class="search-wrap"><input type="text" autocomplete="off" placeholder="Название посёлка или города" value="${escapeAttr(placeStemGuess(o.name))}">
        <div class="suggest-box" style="display:none;"></div></div>`;
      const inp = box.querySelector('input'), sug = box.querySelector('.suggest-box');
      let timer = 0, seq = 0, found = [];
      const run = () => {
        const q = inp.value.trim();
        if(q.length < 2){ sug.style.display = 'none'; return; }
        const my = ++seq;
        sug.innerHTML = '<div class="suggest-empty">Ищу…</div>'; sug.style.display = 'block';
        queryNominatimSettlements(q, here).then(list => {
          if(my !== seq) return;
          found = list.slice(0, 8);
          sug.innerHTML = found.length ? found.map((m, j) => `<div class="suggest-item" data-place-pick="${j}">${escapeHtml(m.full)}${here ? ` <small style="color:var(--text-dim);">· ${Math.round(haversine(here, [m.lat, m.lng]))} км</small>` : ''}</div>`).join('')
            : '<div class="suggest-empty">Ничего не найдено — попробуйте другое написание</div>';
        }).catch(() => { if(my === seq) sug.innerHTML = '<div class="suggest-empty">Поиск недоступен — нужна сеть</div>'; });
      };
      inp.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 450); });
      sug.addEventListener('click', e => {
        const el = e.target.closest('[data-place-pick]');
        if(el) diagReplacePlace(o, found[+el.dataset.placePick]);
      });
      inp.focus();
      run();
    });
  });

  container.querySelectorAll('[data-fixadmin-idx]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const o = adminNames[parseInt(btn.dataset.fixadminIdx, 10)];
      if(!o || !o.clean) return;
      recordBulkAction('сокращение названия', [o.entry], ['name', 'waypointNames'], []);
      if(o.i == null) o.entry.name = o.clean;
      else o.entry.waypointNames[o.i] = o.clean;
      btn.disabled = true;
      const saved = await saveData();
      rebuildAll();
      renderDiagnostics();
      if(saved) showUndoToast(`Название: ${o.name} → ${o.clean}`);
    });
  });

  document.querySelectorAll('[data-dismiss-a]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      dismissPair(btn.dataset.dismissA, btn.dataset.dismissB);
      renderDiagnostics();
      updateDiagnosticsBadge();
      toast('Пара скрыта — вернуть можно внизу раздела');
    });
  });
  const restoreBtn = document.getElementById('restorePairsBtn');
  if(restoreBtn){
    restoreBtn.addEventListener('click', ()=>{
      restoreDismissedPairs();
      renderDiagnostics();
      updateDiagnosticsBadge();
      toast('Скрытые пары возвращены');
    });
  }

  const fixWpBtn = document.getElementById('fixWpCountriesBtn');
  if(fixWpBtn){
    fixWpBtn.addEventListener('click', async ()=>{
      fixWpBtn.disabled = true;
      recordBulkAction('определение стран у точек', routesNoWpCountry, ['waypointCoords','waypointCountryKeys'], []);
      let doneRoutes = 0, failed = 0;
      for(const entry of routesNoWpCountry){
        const res = await refetchRouteWaypoints(entry, (i, total)=>{
          fixWpBtn.textContent = `Маршрут ${doneRoutes + 1} из ${routesNoWpCountry.length}: точка ${i} из ${total}…`;
        });
        failed += res.failCount;
        doneRoutes++;
      }
      const saved = await saveData();
      rebuildAll();
      renderDiagnostics();
      if(saved) showUndoToast(failed
        ? `Обработано маршрутов: ${doneRoutes}, не найдено точек: ${failed}`
        : `Страны определены для ${doneRoutes} маршрутов`);
    });
  }

  const fixAllBtn = document.getElementById('fixAllCountriesBtn');
  if(fixAllBtn){
    fixAllBtn.addEventListener('click', async ()=>{
      const touched = [...new Set(countryMismatches.map(m => m.entry))];
      recordBulkAction('исправление стран', touched, ['countryKey','waypointCountryKeys'], []);
      let n = 0;
      countryMismatches.forEach(m => { if(applyCountryFix(m)) n++; });
      if(n === 0) return;
      fixAllBtn.disabled = true;
      const saved = await saveData();
      rebuildAll();
      renderDiagnostics();
      if(saved) showUndoToast(`Исправлено записей: ${n}`);
    });
  }

  container.querySelectorAll('[data-addcountry-idx]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const m = missingCountryYears[parseInt(btn.dataset.addcountryIdx, 10)];
      if(!m) return;
      // контекст берём у записи, которая и выявила пропуск: обычно это та же
      // поездка, с той же целью и компанией
      const src = m.source || {};
      const ruName = COUNTRY_RU[m.countryKey] || m.countryKey;
      allEntries.push({
        id: genId(), type: 'country', name: ruName, year: m.year, month: src.month,
        photos: [], notes: '',
        purpose: src.purpose || 'tourism',
        company: src.company, community: src.community, season: src.season,
        color: DEFAULT_COLOR.country, status: 'visited',
        trip: src.trip, tripOrder: src.trip ? nextTripOrder(src.trip) : undefined,
        countryKey: m.countryKey
      });
      recordBulkAction('отметку страны', null, [], [allEntries[allEntries.length-1].id]);
      btn.disabled = true;
      const saved = await saveData();
      rebuildAll();
      renderDiagnostics();
      if(saved) showUndoToast(`Отмечена страна: ${ruName}, ${m.year}`);
    });
  });

  container.querySelectorAll('[data-merge-idx]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const idx = parseInt(btn.dataset.mergeIdx, 10);
      const s = tripSuggestions[idx];
      if(!s) return;
      const input = container.querySelector(`[data-merge-name="${idx}"]`);
      const name = (input && input.value.trim()) || s.suggested;
      // порядок остановок задаём последовательно, как при добавлении вручную
      recordBulkAction(`объединение в «${name}»`, s.entries, ['trip','tripOrder'], []);
      s.entries.forEach(e=>{
        e.trip = name;
        e.tripOrder = nextTripOrder(name);
      });
      btn.disabled = true;
      const saved = await saveData();
      rebuildAll();
      renderDiagnostics(); // пересчитываем: эта группа больше не предложение
      if(saved) showUndoToast(`Собрано в поездку «${name}»: ${s.entries.length}`);
    });
  });
}


async function diagReplacePlace(o, m){
  if(!o || !m) return;
  const e = o.entry;
  const key = m.countryKey || findAnyCountryKeyByRuName(m.country, m.countryCode) || null;
  recordBulkAction('замену места', [e], [...WAYPOINT_GEOMETRY_FIELDS, 'lat', 'lng', 'countryKey'], []);
  let geo = { rebuilt: false };
  if(o.i == null){
    e.name = m.name; e.lat = m.lat; e.lng = m.lng;
    if(key) e.countryKey = key;
  } else {
    const oldNames = e.waypointNames.slice();
    const n = e.waypointNames.length;
    e.waypointNames = e.waypointNames.slice();
    e.waypointCoords = (Array.isArray(e.waypointCoords) ? e.waypointCoords : Array(n).fill(null)).slice();
    e.waypointCountryKeys = (Array.isArray(e.waypointCountryKeys) ? e.waypointCountryKeys : Array(n).fill(null)).slice();
    e.waypointNames[o.i] = m.name;
    e.waypointCoords[o.i] = [m.lat, m.lng];
    e.waypointCountryKeys[o.i] = key;
    // у записанного трека линия не меняется, у маршрута «по городам» — перестраивается
    geo = await rebuildRouteGeometry(e, oldNames);
  }
  const saved = await saveData();
  rebuildAll();
  renderDiagnostics();
  updateDiagnosticsBadge();
  if(saved) showUndoToast(`${cleanPlaceName(o.name)} → ${m.name}` + geometryToastSuffix(geo));
}
