// ---------- global search ----------
const globalSearchInput = document.getElementById('globalSearch');
const clearSearchBtn = document.getElementById('clearSearchBtn');

const debouncedApplyFilters = debounce(applyFilters, 150);
globalSearchInput.addEventListener('input', ()=>{
  searchQuery = globalSearchInput.value.trim().toLowerCase();
  clearSearchBtn.style.display = searchQuery ? 'block' : 'none';
  document.getElementById('tableSearchInput').value = globalSearchInput.value;
  debouncedApplyFilters();
});

const debouncedTableFilter = debounce(()=>{ applyFilters(); renderTable(); }, 150);
document.getElementById('tableSearchInput').addEventListener('input', (e)=>{
  searchQuery = e.target.value.trim().toLowerCase();
  globalSearchInput.value = e.target.value;
  clearSearchBtn.style.display = searchQuery ? 'block' : 'none';
  debouncedTableFilter();
});

clearSearchBtn.addEventListener('click', ()=>{
  globalSearchInput.value = '';
  searchQuery = '';
  clearSearchBtn.style.display = 'none';
  applyFilters();
  globalSearchInput.focus();
});

globalSearchInput.addEventListener('keydown', (e)=>{
  if(e.key !== 'Enter') return;
  const firstMatch = allEntries.find(passesFilter);
  if(firstMatch){ closeWorldSuggest(); focusEntry(firstMatch); }
  else if(worldResults.length) pickWorldResult(0); // своих записей нет — первое из карты мира
});

// ---------- поиск по всей карте ----------
// Поле поиска по-прежнему фильтрует ваши записи, а под ним появляется список
// «на карте мира»: страны (встроенные границы и справка), города из встроенного
// справочника — без сети — и, если сеть есть, дополнительно из геокодера.
let worldCities = null;
function getWorldCities(){
  if(worldCities) return worldCities;
  worldCities = WORLD_CITIES_TXT.split('\n').map(line => {
    const [name, lat, lng, key, pop, cap, region] = line.split('|');
    return { name, lat: +lat, lng: +lng, countryKey: key || null, pop: +pop || 0, capital: cap === '1', region: region || '', lc: name.toLowerCase().replace(/ё/g, 'е') };
  });
  return worldCities;
}
// совпадение с начала названия важнее совпадения в середине; дальше — по населению
function localCitySearch(q, limit, bias){
  const n = normSearch(q);
  if(n.length < 2) return [];
  const starts = [], inner = [];
  getWorldCities().forEach(c => {
    const i = c.lc.indexOf(n);
    if(i === 0) starts.push(c);
    else if(i > 0 && (c.lc[i-1] === ' ' || c.lc[i-1] === '-')) inner.push(c);
  });
  const near = c => bias ? -Math.hypot(c.lat - bias[0], (c.lng - bias[1]) * Math.cos(bias[0] * Math.PI / 180)) / 3 : 0;
  const score = c => Math.log10(c.pop + 1) + (c.capital ? 0.6 : 0) + near(c);
  return [...starts.sort((a,b) => score(b) - score(a)), ...inner.sort((a,b) => score(b) - score(a))].slice(0, limit || 8);
}
function localCountrySearch(q, limit){
  const n = normSearch(q);
  if(n.length < 2) return [];
  const starts = [], inner = [];
  COUNTRY_LIST.forEach(c => {
    const ru = normSearch(c.ru), en = String(c.key || '').toLowerCase();
    const info = (typeof COUNTRY_INFO !== 'undefined' && COUNTRY_INFO[c.key]) || {};
    const cap = normSearch(info.capital);
    if(ru.startsWith(n) || en.startsWith(n)) starts.push(c);
    else if(ru.includes(' ' + n) || ru.includes('-' + n) || (cap && cap.startsWith(n))) inner.push(c);
  });
  return [...starts, ...inner].slice(0, limit || 5);
}
// город из справочника в формате результатов геокодера — для формы добавления
function cityAsMatch(c){
  const ru = c.countryKey ? (COUNTRY_RU[c.countryKey] || c.countryKey) : null;
  const where = [c.region, ru].filter(Boolean).join(', ');
  return { name: c.name, full: where ? `${c.name} — ${where}` : c.name, lat: c.lat, lng: c.lng, country: ru,
           countryCode: c.countryKey && COUNTRY_ISO[c.countryKey] || null, countryKey: c.countryKey, offline: true };
}

let worldSuggestSeq = 0;
let worldResults = [];
let worldHl = -1;
let searchPinLayer = null;
function closeWorldSuggest(){
  const box = document.getElementById('worldSuggest');
  if(box) box.style.display = 'none';
  worldHl = -1;
}
function popText(k){ return k >= 1000 ? `${(k/1000).toFixed(k >= 10000 ? 0 : 1).replace('.', ',')} млн` : `${k} тыс.`; }
function renderWorldSuggest(q, online){
  const box = document.getElementById('worldSuggest');
  if(!box) return;
  if(normSearch(q).length < 2){ box.style.display = 'none'; worldResults = []; return; }
  const countries = localCountrySearch(q, 4);
  const cities = localCitySearch(q, 6);
  worldResults = [];
  const mine = allEntries.filter(passesFilter).length;
  const visitedKeys = new Set(allEntries.filter(e => e.type === 'country' && e.status !== 'wishlist').map(e => e.countryKey));
  const plannedKeys = new Set(allEntries.filter(e => e.type === 'country' && e.status === 'wishlist').map(e => e.countryKey));
  let html = `<div class="ws-head">Ваши записи: ${mine}${mine ? ' — в списке ниже' : ''}</div>`;
  if(countries.length){
    html += `<div class="ws-head">Страны</div>`;
    countries.forEach(c => {
      const info = (COUNTRY_INFO[c.key] || {});
      const mark = c.key === HOME_COUNTRY_KEY ? 'дом' : visitedKeys.has(c.key) ? 'были' : plannedKeys.has(c.key) ? 'в планах' : '';
      worldResults.push({ kind: 'country', key: c.key });
      html += `<div class="suggest-item ws-item" data-ws="${worldResults.length-1}">${countryFlag(c.key) || ''} ${escapeHtml(c.ru)}${mark ? `<span class="ws-mine">${mark}</span>` : ''}<span class="ws-sub">${escapeHtml(info.capital || '')}</span></div>`;
    });
  }
  const cityHtml = list => list.map(c => {
    worldResults.push({ kind: 'city', city: c });
    const ru = c.countryKey ? (COUNTRY_RU[c.countryKey] || c.countryKey) : '';
    return `<div class="suggest-item ws-item" data-ws="${worldResults.length-1}">${c.countryKey ? (countryFlag(c.countryKey) || '') : '📍'} ${escapeHtml(c.name)}<span class="ws-sub">${escapeHtml(c.region || ru)}${c.capital ? ' · столица' : c.pop ? ' · ' + popText(c.pop) : ''}</span></div>`;
  }).join('');
  if(cities.length) html += `<div class="ws-head">Города</div>` + cityHtml(cities);
  if(online && online.length) html += `<div class="ws-head">Ещё по карте</div>` + cityHtml(online);
  if(!countries.length && !cities.length && !(online && online.length)){
    html += `<div class="suggest-empty">${navigator.onLine === false ? 'В справочнике не найдено, а для поиска мелких мест нужна сеть' : 'Ищу на карте мира…'}</div>`;
  }
  box.innerHTML = html;
  box.style.display = 'block';
  worldHl = -1;
}
async function updateWorldSuggest(q){
  const seq = ++worldSuggestSeq;
  renderWorldSuggest(q, null);
  if(normSearch(q).length < 3 || navigator.onLine === false) return;
  // мелкие места — у геокодера; он отвечает не быстрее раза в секунду
  await new Promise(r => setTimeout(r, 650));
  if(seq !== worldSuggestSeq) return;
  try{
    const res = await queryNominatimSettlements(q, null, { networkOnly: true });
    if(seq !== worldSuggestSeq) return;
    const local = localCitySearch(q, 6);
    const extra = res.filter(m => !local.some(c => c.name === m.name && Math.abs(c.lat - m.lat) < 0.3 && Math.abs(c.lng - m.lng) < 0.3))
      .slice(0, 5)
      .map(m => ({ name: m.name, lat: m.lat, lng: m.lng, countryKey: findAnyCountryKeyByRuName(m.country, m.countryCode), pop: 0, capital: false }));
    renderWorldSuggest(q, extra);
  }catch(e){
    if(seq === worldSuggestSeq) renderWorldSuggest(q, null);
  }
}
function showSearchPin(c){
  if(searchPinLayer){ map.removeLayer(searchPinLayer); searchPinLayer = null; }
  const ru = c.countryKey ? (COUNTRY_RU[c.countryKey] || c.countryKey) : '';
  const info = c.countryKey ? (COUNTRY_INFO[c.countryKey] || {}) : {};
  const own = allEntries.filter(e => e.type === 'city' && e.name.trim().toLowerCase() === c.name.trim().toLowerCase());
  const visitedYears = [...new Set(own.filter(e => e.status !== 'wishlist').map(e => e.year))].sort();
  const html = `<div class="cpop">
    <div class="cpop-flag">${c.countryKey ? (countryFlag(c.countryKey) || '') : '📍'}</div>
    <b class="cpop-name">${escapeHtml(c.name)}</b>
    <div class="cpop-status">${escapeHtml([c.region, ru, c.capital ? 'столица' : '', c.pop ? popText(c.pop) + ' жителей' : ''].filter(Boolean).join(' · '))}</div>
    ${visitedYears.length ? `<div class="cpop-status">Вы были здесь: ${visitedYears.join(', ')}</div>` : own.length ? `<div class="cpop-status">В планах</div>` : ''}
    ${info.lang ? `<div class="cpop-status" style="font-size:11px;">${escapeHtml(['язык: ' + info.lang, info.currency ? 'валюта: ' + info.currency : ''].filter(Boolean).join(' · '))}</div>` : ''}
    ${READ_ONLY ? '' : `<div class="cpop-actions" style="margin-top:8px;">
      <button class="cpop-btn" data-ws-act="add">+ добавить как город</button>
      <button class="cpop-btn" data-ws-act="wish">Хочу посетить</button>
    </div>`}
  </div>`;
  searchPinLayer = L.marker([c.lat, c.lng], { icon: L.divIcon({ className: '', html: '<div class="search-pin"></div>', iconSize: [16,16], iconAnchor: [8,8] }), zIndexOffset: 1000 })
    .addTo(map).bindPopup(html, { minWidth: 200, maxWidth: 280 });
  map.setView([c.lat, c.lng], Math.max(map.getZoom(), 8));
  searchPinLayer.openPopup();
  searchPinLayer.on('popupclose', ()=>{ setTimeout(()=>{ if(searchPinLayer && !searchPinLayer.isPopupOpen()){ map.removeLayer(searchPinLayer); searchPinLayer = null; } }, 0); });
  setTimeout(()=>{
    const el = searchPinLayer && searchPinLayer.getPopup() && searchPinLayer.getPopup().getElement();
    if(!el) return;
    L.DomEvent.disableClickPropagation(el);
    guardPopupClicks(el);
    el.querySelectorAll('[data-ws-act]').forEach(btn => btn.addEventListener('click', async ()=>{
      if(btn.dataset.wsAct === 'add'){
        map.closePopup();
        prefillCityForm(c.name, L.latLng(c.lat, c.lng), c.countryKey);
      } else {
        const entry = { id: genId(), type: 'city', name: c.name, year: new Date().getFullYear(), lat: c.lat, lng: c.lng,
          countryKey: c.countryKey, photos: [], notes: '', purpose: 'tourism', color: DEFAULT_COLOR.city, status: 'wishlist', favorite: false };
        allEntries.push(entry);
        recordBulkAction('город в планах', null, [], [entry.id]);
        map.closePopup();
        const saved = await saveData();
        rebuildAll();
        if(saved) showUndoToast(`${c.name}: в планах`);
      }
    }));
  }, 0);
}
// форма «новый город» с уже выбранным местом — из поиска и из «Что здесь?»
function prefillCityForm(name, latlng, countryKey){
  exitEditMode(true);
  const typeBtn = document.querySelector('.type-btn[data-type="city"]');
  if(typeBtn) typeBtn.click();
  pendingLatLng = latlng;
  pendingCityName = name;
  pendingCityCountryKey = countryKey || null;
  const sel = document.getElementById('fieldCityCountry');
  if(sel) sel.value = countryKey || '';
  const nameField = document.getElementById('fieldName');
  if(nameField) nameField.value = name;
  setSelectedTag('citySelectedTag', `${name}: ${latlng.lat.toFixed(3)}, ${latlng.lng.toFixed(3)}`, clearCitySelection);
  const section = document.getElementById('addEntrySection');
  if(section && section.classList.contains('collapsed')) section.classList.remove('collapsed');
  mnavShow('add');
  if(nameField) nameField.scrollIntoView({ block: 'center' });
  toast(`Проверьте год и остальные поля для «${name}»`);
}
function pickWorldResult(i){
  const r = worldResults[i];
  if(!r) return;
  closeWorldSuggest();
  mnavShow('map');
  if(r.kind === 'country'){
    const b = countryBounds(r.key);
    if(b) map.fitBounds(b, { padding: [30, 30], maxZoom: 6 });
    setTimeout(()=> openCountryPopup(r.key, countryAnchor(r.key, b)), 350);
  } else {
    showSearchPin(r.city);
  }
}
(function setupWorldSearch(){
  const input = document.getElementById('globalSearch');
  const box = document.getElementById('worldSuggest');
  if(!input || !box) return;
  const upd = debounce(()=> updateWorldSuggest(input.value), 180);
  input.addEventListener('input', upd);
  input.addEventListener('focus', ()=>{ if(normSearch(input.value).length >= 2) updateWorldSuggest(input.value); });
  box.addEventListener('mousedown', e => e.preventDefault()); // не терять фокус поля при клике по списку
  box.addEventListener('click', e => {
    const it = e.target.closest('[data-ws]');
    if(it) pickWorldResult(+it.dataset.ws);
  });
  input.addEventListener('keydown', e => {
    if(box.style.display === 'none') return;
    const items = [...box.querySelectorAll('[data-ws]')];
    if(e.key === 'ArrowDown' || e.key === 'ArrowUp'){
      e.preventDefault();
      worldHl = Math.max(0, Math.min(items.length - 1, worldHl + (e.key === 'ArrowDown' ? 1 : -1)));
      items.forEach((el, i) => el.classList.toggle('hl', i === worldHl));
      if(items[worldHl]) items[worldHl].scrollIntoView({ block: 'nearest' });
    } else if(e.key === 'Escape'){
      closeWorldSuggest();
    } else if(e.key === 'Enter' && worldHl >= 0){
      e.preventDefault(); e.stopImmediatePropagation();
      pickWorldResult(+items[worldHl].dataset.ws);
    }
  });
  input.addEventListener('blur', ()=> setTimeout(closeWorldSuggest, 150));
  document.getElementById('clearSearchBtn').addEventListener('click', closeWorldSuggest);
})();

