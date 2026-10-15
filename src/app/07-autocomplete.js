// ---------- selection tag helper ----------
function setSelectedTag(containerId, label, onClear){
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  const tag = document.createElement('div');
  tag.className = 'selected-tag';
  tag.innerHTML = `<span>✓ ${escapeHtml(label)}</span>`;
  const btn = document.createElement('button');
  btn.textContent = '✕';
  btn.title = 'Сбросить выбор';
  btn.addEventListener('click', onClear);
  tag.appendChild(btn);
  container.appendChild(tag);
}
function clearCountrySelection(){
  pendingCountryKey = null;
  document.getElementById('countrySelectedTag').innerHTML = '';
  document.getElementById('countrySearch').value = '';
}
function clearCitySelection(){
  pendingLatLng = null;
  pendingCityName = null;
  pendingCityCountry = null;
  pendingCityCountryCode = null;
  pendingCityCountryKey = null;
  document.getElementById('citySelectedTag').innerHTML = '';
  document.getElementById('citySearch').value = '';
  document.getElementById('cityCountrySuggest').innerHTML = '';
  const ccSel = document.getElementById('fieldCityCountry');
  if(ccSel) ccSel.value = '';
}

// ---------- country autocomplete (local list) ----------
const countrySearchInput = document.getElementById('countrySearch');
const countrySuggestBox = document.getElementById('countrySuggest');
let countryHlIndex = -1;
let countryMatches = [];

countrySearchInput.addEventListener('input', ()=>{
  const q = countrySearchInput.value.trim().toLowerCase();
  countryHlIndex = -1;
  if(!q){ countrySuggestBox.style.display = 'none'; return; }
  countryMatches = COUNTRY_LIST_SELECTABLE.filter(c => c.ru.toLowerCase().includes(q)).slice(0, 8);
  renderCountrySuggestions();
});
countrySearchInput.addEventListener('keydown', (e)=>{
  if(countrySuggestBox.style.display === 'none') return;
  if(e.key === 'ArrowDown'){ e.preventDefault(); countryHlIndex = Math.min(countryHlIndex+1, countryMatches.length-1); renderCountrySuggestions(); }
  else if(e.key === 'ArrowUp'){ e.preventDefault(); countryHlIndex = Math.max(countryHlIndex-1, 0); renderCountrySuggestions(); }
  else if(e.key === 'Enter'){ e.preventDefault(); const idx = countryHlIndex >= 0 ? countryHlIndex : 0; if(countryMatches[idx]) pickCountry(countryMatches[idx]); }
  else if(e.key === 'Escape'){ countrySuggestBox.style.display = 'none'; }
});
document.addEventListener('click', (e)=>{
  if(!countrySearchInput.contains(e.target) && !countrySuggestBox.contains(e.target)) countrySuggestBox.style.display = 'none';
});
function renderCountrySuggestions(){
  if(countryMatches.length === 0){
    countrySuggestBox.innerHTML = `<div class="suggest-empty">Ничего не найдено</div>`;
    countrySuggestBox.style.display = 'block';
    return;
  }
  countrySuggestBox.innerHTML = '';
  countryMatches.forEach((m, i)=>{
    const el = document.createElement('div');
    el.className = 'suggest-item' + (i === countryHlIndex ? ' hl' : '');
    el.textContent = m.ru;
    el.addEventListener('click', ()=> pickCountry(m));
    countrySuggestBox.appendChild(el);
  });
  countrySuggestBox.style.display = 'block';
}
function pickCountry(m){
  pendingCountryKey = m.key;
  countrySearchInput.value = '';
  countrySuggestBox.style.display = 'none';
  setSelectedTag('countrySelectedTag', m.ru, clearCountrySelection);
  if(!document.getElementById('fieldName').value.trim()){
    document.getElementById('fieldName').value = m.ru;
  }
}

// ---------- city autocomplete (Nominatim live search, results in Russian) ----------
const citySearchInput = document.getElementById('citySearch');
const citySuggestBox = document.getElementById('citySuggest');
let cityHlIndex = -1;
let cityMatches = [];
let cityDebounceTimer = null;

citySearchInput.addEventListener('input', ()=>{
  const q = citySearchInput.value.trim();
  clearTimeout(cityDebounceTimer);
  if(!q || q.length < 2){ citySuggestBox.style.display = 'none'; return; }
  citySuggestBox.innerHTML = `<div class="suggest-empty">Поиск…</div>`;
  citySuggestBox.style.display = 'block';
  cityDebounceTimer = setTimeout(()=> fetchCitySuggestions(q), 700);
});
citySearchInput.addEventListener('keydown', (e)=>{
  if(citySuggestBox.style.display === 'none') return;
  if(e.key === 'ArrowDown'){ e.preventDefault(); cityHlIndex = Math.min(cityHlIndex+1, cityMatches.length-1); renderCitySuggestions(); }
  else if(e.key === 'ArrowUp'){ e.preventDefault(); cityHlIndex = Math.max(cityHlIndex-1, 0); renderCitySuggestions(); }
  else if(e.key === 'Enter'){ e.preventDefault(); const idx = cityHlIndex >= 0 ? cityHlIndex : 0; if(cityMatches[idx]) pickCity(cityMatches[idx]); }
  else if(e.key === 'Escape'){ citySuggestBox.style.display = 'none'; }
});
document.addEventListener('click', (e)=>{
  if(!citySearchInput.contains(e.target) && !citySuggestBox.contains(e.target)) citySuggestBox.style.display = 'none';
});
async function fetchCitySuggestions(q){
  try{
    const seq = ++suggestSeq.city;
    const quick = localCitySearch(q, 8).map(cityAsMatch);
    if(quick.length){ cityMatches = quick; cityHlIndex = -1; renderCitySuggestions(); }
    const res = await queryNominatimSettlements(q).catch(err => { if(quick.length) return []; throw err; });
    if(seq !== suggestSeq.city) return; // пока ждали, пользователь набрал дальше
    cityMatches = mergeSettlementMatches(res, quick);
    cityHlIndex = -1;
    renderCitySuggestions();
    clearServiceIssue('поиск городов');
  }catch(err){
    citySuggestBox.innerHTML = `<div class="suggest-empty">Нет соединения — попробуйте указать точку кликом на карте</div>`;
    reportServiceIssue('поиск городов');
  }
}
function renderCitySuggestions(){
  if(cityMatches.length === 0){
    citySuggestBox.innerHTML = `<div class="suggest-empty">Ничего не найдено</div>`;
    citySuggestBox.style.display = 'block';
    return;
  }
  citySuggestBox.innerHTML = '';
  cityMatches.forEach((m, i)=>{
    const el = document.createElement('div');
    el.className = 'suggest-item' + (i === cityHlIndex ? ' hl' : '');
    el.textContent = m.full;
    el.addEventListener('click', ()=> pickCity(m));
    citySuggestBox.appendChild(el);
  });
  citySuggestBox.style.display = 'block';
}
function pickCity(m){
  pendingLatLng = { lat: m.lat, lng: m.lng };
  pendingCityName = m.name;
  pendingCityCountry = m.country || null;
  pendingCityCountryCode = m.countryCode || null;
  pendingCityCountryKey = findAnyCountryKeyByRuName(m.country, m.countryCode);
  const ccSel = document.getElementById('fieldCityCountry');
  if(ccSel) ccSel.value = pendingCityCountryKey || '';
  citySearchInput.value = '';
  citySuggestBox.style.display = 'none';
  setSelectedTag('citySelectedTag', m.full, clearCitySelection);
  if(!document.getElementById('fieldName').value.trim()){
    document.getElementById('fieldName').value = m.name;
  }
  renderCityCountrySuggest();
}

function findCountryKeyByRuName(ruName, isoCode){
  if(isoCode){
    const key = ISO_TO_COUNTRY_KEY[isoCode.toUpperCase()];
    if(key && key !== HOME_COUNTRY_KEY) return key;
    if(key === HOME_COUNTRY_KEY) return null; // этот список намеренно не предлагает "отметить Россию"
  }
  if(!ruName) return null;
  const target = ruName.trim().toLowerCase();
  const match = COUNTRY_LIST_SELECTABLE.find(c => c.ru.toLowerCase() === target);
  return match ? match.key : null;
}
function findAnyCountryKeyByRuName(ruName, isoCode){
  if(isoCode){
    const key = ISO_TO_COUNTRY_KEY[isoCode.toUpperCase()];
    if(key) return key;
  }
  if(!ruName) return null;
  const target = ruName.trim().toLowerCase();
  const match = COUNTRY_LIST.find(c => c.ru.toLowerCase() === target);
  return match ? match.key : null;
}

// Контекст берётся из той же формы, что заполняет пользователь. Один и тот же
// блок чтения полей и создания записи страны стоял в двух подсказках — по
// городу и по точкам маршрута. При добавлении поля в форму их легко было
// развести, поэтому вынесен в общее место.
function readFormContext(){
  const company = document.getElementById('fieldCompany').value;
  return {
    year: parseInt(document.getElementById('fieldYear').value) || new Date().getFullYear(),
    month: parseInt(document.getElementById('fieldMonth').value) || undefined,
    purpose: document.getElementById('fieldPurpose').value,
    company,
    community: company === 'group' ? (document.getElementById('fieldCommunity').value || undefined) : undefined,
    season: document.getElementById('fieldSeason').value,
    trip: document.getElementById('fieldTrip').value.trim(),
  };
}

function makeCountryEntry(key, ctx){
  return {
    id: genId(), type: 'country', name: COUNTRY_RU[key] || key, countryKey: key,
    photos: [], notes: '', color: DEFAULT_COLOR.country, status: 'visited',
    tripOrder: nextTripOrder(ctx.trip), ...ctx
  };
}

function suggestMissingCountriesForWaypoints(waypoints){
  const container = document.getElementById('routeCountrySuggest');
  container.innerHTML = '';
  const keys = [...new Set(waypoints.map(w => w.countryKey).filter(k => k && k !== HOME_COUNTRY_KEY))];
  const missing = keys.filter(key => !allEntries.some(e => e.type === 'country' && e.countryKey === key && e.status !== 'wishlist'));
  if(missing.length === 0) return;

  const names = missing.map(key => COUNTRY_RU[key] || key);
  const banner = document.createElement('div');
  banner.className = 'selected-tag';
  banner.style.borderColor = 'var(--amber-dim)';
  banner.innerHTML = `<span>Также отметить как посещённые страны маршрута: ${names.map(escapeHtml).join(', ')}?</span>`;
  const btn = document.createElement('button');
  btn.textContent = missing.length > 1 ? 'Отметить все' : 'Отметить';
  btn.style.color = 'var(--amber)';
  btn.style.fontWeight = '600';
  btn.addEventListener('click', async ()=>{
    const ctx = readFormContext();
    missing.forEach(key => allEntries.push(makeCountryEntry(key, ctx)));
    const saved = await saveData();
    rebuildAll();
    if(saved) toast(`Добавлено стран: ${missing.length}`);
    container.innerHTML = '';
  });
  banner.appendChild(btn);
  container.appendChild(banner);
}

function renderCityCountrySuggest(){
  const container = document.getElementById('cityCountrySuggest');
  container.innerHTML = '';
  if(!pendingCityCountry) return;
  const key = findCountryKeyByRuName(pendingCityCountry, pendingCityCountryCode);
  if(!key) return;
  // Сверяемся с годом из формы, а не «отмечена ли страна вообще». Визиты
  // считаются по годам (топ стран, фильтр по году, календарь, новые страны
  // в год), поэтому при заполнении прошлых поездок отметка за другой год
  // не должна отменять предложение.
  const formYear = parseInt(document.getElementById('fieldYear').value, 10);
  const sameCountry = allEntries.filter(e => e.type === 'country' && e.countryKey === key);
  const visitedYears = [...new Set(sameCountry.filter(e => e.status !== 'wishlist').map(e => e.year))].sort((a,b)=>a-b);
  const existingVisited = sameCountry.find(e => e.status !== 'wishlist' && e.year === formYear);
  if(existingVisited) return;
  const existingWishlist = sameCountry.find(e => e.status === 'wishlist');
  const ruName = COUNTRY_RU[key] || pendingCityCountry;
  const banner = document.createElement('div');
  banner.className = 'selected-tag';
  banner.style.borderColor = 'var(--amber-dim)';
  const btn = document.createElement('button');
  btn.style.color = 'var(--amber)';
  btn.style.fontWeight = '600';

  if(existingWishlist){
    banner.innerHTML = `<span>«${escapeHtml(ruName)}» у вас в планах — отметить как посещённую?</span>`;
    btn.textContent = 'Отметить';
    btn.addEventListener('click', async ()=>{
      const year = parseInt(document.getElementById('fieldYear').value) || new Date().getFullYear();
      const month = parseInt(document.getElementById('fieldMonth').value) || undefined;
      existingWishlist.status = 'visited';
      existingWishlist.year = year;
      existingWishlist.month = month;
      const saved = await saveData();
      rebuildAll();
      if(saved) toast(`«${ruName}» отмечена как посещённая`);
      container.innerHTML = '';
    });
  } else {
    banner.innerHTML = visitedYears.length
      ? `<span>«${escapeHtml(ruName)}» уже отмечена за ${visitedYears.join(', ')} — добавить отметку и за ${formYear || 'этот год'}?</span>`
      : `<span>Также отметить «${escapeHtml(ruName)}» как посещённую?</span>`;
    btn.textContent = 'Добавить';
    btn.addEventListener('click', async ()=>{
      allEntries.push(makeCountryEntry(key, readFormContext()));
      const saved = await saveData();
      rebuildAll();
      if(saved) toast(`Добавлено: ${ruName}`);
      container.innerHTML = '';
    });
  }
  banner.appendChild(btn);
  container.appendChild(banner);
}

