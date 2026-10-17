// ---------- коллекции и чек-листы ----------
// Встроенные списки считаются по вашим отметкам на лету: город засчитан, если
// рядом (20 км) есть отметка города или остановка маршрута; место (чудо света) —
// ещё и если рядом прошёл трек. Свои коллекции хранятся вместе с данными
// (в tripMeta под служебным ключом), поэтому синхронизируются и попадают в
// резервную копию; в версию для друзей не попадают.
const COLLECTION_PREFIX = '__collection:';
const COLLECTIONS_RU = [
  { id: 'golden-ring', group: 'Россия', title: 'Золотое кольцо России', items: [
    ['Сергиев Посад', 56.315, 38.136], ['Переславль-Залесский', 56.737, 38.854], ['Ростов Великий', 57.185, 39.414], ['Ярославль', 57.626, 39.884],
    ['Кострома', 57.768, 40.927], ['Иваново', 57.000, 40.974], ['Суздаль', 56.420, 40.449], ['Владимир', 56.129, 40.407]] },
  { id: 'ru-millions', group: 'Россия', title: 'Города-миллионники России', items: [
    ['Москва', 55.756, 37.617], ['Санкт-Петербург', 59.939, 30.316], ['Новосибирск', 55.030, 82.920], ['Екатеринбург', 56.838, 60.597],
    ['Казань', 55.796, 49.106], ['Красноярск', 56.010, 92.852], ['Нижний Новгород', 56.327, 44.006], ['Челябинск', 55.160, 61.402],
    ['Уфа', 54.735, 55.958], ['Самара', 53.195, 50.101], ['Ростов-на-Дону', 47.222, 39.720], ['Краснодар', 45.035, 38.975],
    ['Омск', 54.989, 73.368], ['Воронеж', 51.661, 39.200], ['Пермь', 58.010, 56.229], ['Волгоград', 48.708, 44.513]] },
  { id: 'wonders', group: 'Мир', title: 'Новые семь чудес света', place: true, items: [
    ['Великая Китайская стена', 40.432, 116.570, 80], ['Петра', 30.329, 35.444, 30], ['Колизей', 41.890, 12.492, 15], ['Чичен-Ица', 20.684, -88.568, 30],
    ['Мачу-Пикчу', -13.163, -72.545, 30], ['Тадж-Махал', 27.175, 78.042, 20], ['Христос-Искупитель', -22.952, -43.211, 20]] }
];
const COLLECTION_CONTINENTS = ['Европа', 'Азия', 'Африка', 'Северная Америка', 'Южная Америка', 'Австралия и Океания'];
const CONTINENT_GEN = { 'Европа': 'Европы', 'Азия': 'Азии', 'Африка': 'Африки', 'Северная Америка': 'Северной Америки', 'Южная Америка': 'Южной Америки', 'Австралия и Океания': 'Австралии и Океании' };
let capitalIndex = null;
function capitalOf(k){
  if(!capitalIndex){
    capitalIndex = new Map();
    getWorldCities().filter(c => c.capital && c.countryKey).forEach(c => {
      if(!capitalIndex.has(c.countryKey)) capitalIndex.set(c.countryKey, []);
      capitalIndex.get(c.countryKey).push(c);
    });
  }
  const list = capitalIndex.get(k) || [];
  if(!list.length) return null;
  const want = normSearch(quizCapital(k));
  return list.find(c => normSearch(c.name) === want) || list.slice().sort((a, b) => b.pop - a.pop)[0];
}
function customCollections(){
  return Object.keys(tripMeta).filter(k => k.startsWith(COLLECTION_PREFIX)).map(k => ({ ...tripMeta[k], id: k, custom: true }))
    .filter(c => c && Array.isArray(c.items)).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}
// Всемирное наследие ЮНЕСКО: src/data/unesco.json собирается scripts/build-unesco.mjs
// из данных whc.unesco.org — [id, название, lat, lng, категория c/n/m, страна, год включения, транснациональный].
// Культурный объект засчитывается в 10 км от отметки или трека, природный и
// смешанный — в 30 км (у парков и заповедников точка — лишь их середина).
const UNESCO_CAT = { c: 'культурный', n: 'природный', m: 'смешанный' };
let unescoItems = null;
function unescoCollection(){
  if(!unescoItems) unescoItems = JSON.parse(UNESCO_TXT).map(([uid, name, lat, lng, cat, key, year, multi]) =>
    ({ kind: 'place', name, lat, lng, r: cat === 'c' ? 10 : 30, key: key || null, cat, inscribed: year, uid, multi: !!multi }));
  return { id: 'unesco', group: 'Мир', title: 'Всемирное наследие ЮНЕСКО', big: true, items: unescoItems };
}
// все коллекции в одном виде: { id, group, title, items: [{ kind, name, lat, lng, r, key }] }
function allCollections(){
  const out = COLLECTIONS_RU.map(c => ({ id: c.id, group: c.group, title: c.title,
    items: c.items.map(([name, lat, lng, r]) => ({ kind: c.place ? 'place' : 'city', name, lat, lng, r: r || (c.place ? 30 : 20) })) }));
  out.push(unescoCollection());
  out.splice(2, 0, { id: 'ru-regions', group: 'Россия', title: 'Регионы России', items: RU_REGIONS.map(r => ({ kind: 'region', name: r.name })) });
  const countries = quizCountries();
  COLLECTION_CONTINENTS.forEach(cont => {
    const keys = countries.filter(k => COUNTRY_CONTINENT[k] === cont);
    out.push({ id: 'cap-' + cont, group: 'Столицы', title: 'Столицы ' + CONTINENT_GEN[cont], items: keys.map(k => {
      const c = capitalOf(k);
      // у карликовых государств столица в паре километров от соседнего города (Ватикан — Рим, Монако — Ницца)
      const g = getCountryGeometry(k), small = g && geomAreaKm2(g) < 1000;
      return c ? { kind: 'city', name: quizCapital(k) || c.name, lat: c.lat, lng: c.lng, r: small ? 2.5 : 20, key: k } : null;
    }).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name, 'ru')) });
    out.push({ id: 'cnt-' + cont, group: 'Страны', title: 'Страны ' + CONTINENT_GEN[cont], items: keys.map(k => ({ kind: 'country', key: k, name: COUNTRY_RU[k] || k }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru')) });
  });
  customCollections().forEach(c => out.push({ id: c.id, group: 'Свои', title: c.name || 'Без названия', custom: true,
    items: c.items.map(it => it.kind === 'country' ? { kind: 'country', key: it.key, name: COUNTRY_RU[it.key] || it.key }
                                                   : { kind: 'city', name: it.name, lat: it.lat, lng: it.lng, r: 20, key: it.countryKey || null }) }));
  return out;
}
// Сетка 0,5° для поиска «что рядом»: в коллекции ЮНЕСКО больше тысячи объектов,
// и перебор всех отметок и точек треков для каждого занимал бы секунды.
const COLL_GRID = 0.5, COLL_GRID_W = 360 / COLL_GRID;
function collGridAdd(grid, v){
  const k = Math.floor(v.lat / COLL_GRID) * 10000 + ((Math.floor(v.lng / COLL_GRID) % COLL_GRID_W) + COLL_GRID_W) % COLL_GRID_W;
  let a = grid.get(k);
  if(!a) grid.set(k, a = []);
  a.push(v);
}
function collGridNear(grid, lat, lng, r){
  const dy = Math.ceil(r / 111 / COLL_GRID);
  const dx = Math.min(COLL_GRID_W / 2, Math.ceil(r / (111 * Math.max(0.05, Math.cos(lat * Math.PI / 180))) / COLL_GRID));
  const cy = Math.floor(lat / COLL_GRID), cx = Math.floor(lng / COLL_GRID);
  let year = null, hit = false;
  for(let y = cy - dy; y <= cy + dy; y++) for(let x = cx - dx; x <= cx + dx; x++){
    const a = grid.get(y * 10000 + ((x % COLL_GRID_W) + COLL_GRID_W) % COLL_GRID_W);
    if(a) a.forEach(v => { if(haversine([v.lat, v.lng], [lat, lng]) <= r){ hit = true; if(v.year && (!year || v.year < year)) year = v.year; } });
  }
  return hit ? { got: true, year } : null;
}
// точки посещений: отметки городов и остановки маршрутов (с годом)
function collectionVisitIndex(){
  const visited = allEntries.filter(e => e.status !== 'wishlist');
  const pts = new Map();
  getAllCityVisits(visited).forEach(v => { if(v.lat != null && v.lng != null) collGridAdd(pts, v); });
  const countries = new Map();
  visited.forEach(e => { if(e.type === 'country' && e.countryKey){ const y = countries.get(e.countryKey); if(!y || e.year < y) countries.set(e.countryKey, e.year); } });
  // дом — тоже «посещённая» страна
  if(!countries.has(HOME_COUNTRY_KEY)) countries.set(HOME_COUNTRY_KEY, null);
  // треки нужны только для мест (чудеса света, ЮНЕСКО) — прореживаем
  const tracks = new Map();
  visited.filter(e => e.type === 'route').forEach(e => {
    const c = getEntryCoords(e) || [];
    const step = Math.max(1, Math.floor(c.length / 400));
    for(let i = 0; i < c.length; i += step) collGridAdd(tracks, { lat: c[i][0], lng: c[i][1], year: e.year });
  });
  const regions = ruRegionsState && ruRegionsState.visited ? ruRegionsState.visited : new Map();
  return { pts, countries, tracks, regions };
}
function collectionItemStatus(it, idx){
  if(it.kind === 'country'){ return idx.countries.has(it.key) ? { got: true, year: idx.countries.get(it.key) } : { got: false }; }
  if(it.kind === 'region'){ return idx.regions.has(it.name) ? { got: true, year: null } : { got: false }; }
  const byPoint = collGridNear(idx.pts, it.lat, it.lng, it.r || 20);
  if(byPoint) return byPoint;
  if(it.kind === 'place'){
    const byTrack = collGridNear(idx.tracks, it.lat, it.lng, it.r || 30);
    if(byTrack) return byTrack;
  }
  return { got: false };
}
function collectionProgress(col, idx){
  const st = col.items.map(it => collectionItemStatus(it, idx));
  return { st, got: st.filter(s => s.got).length, total: col.items.length };
}
function collRing(got, total, size){
  const r = (size - 6) / 2, c = 2 * Math.PI * r, f = total ? got / total : 0;
  return `<svg class="coll-ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--line)" stroke-width="4"/>
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${f >= 1 ? 'var(--amber)' : 'var(--sage)'}" stroke-width="4" stroke-linecap="round"
      stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${size/2} ${size/2})"/>
    <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-family="Playfair Display, serif" font-style="italic" font-weight="700" font-size="${size > 50 ? 14 : 11}" fill="var(--text)">${f >= 1 ? '✓' : Math.round(f * 100) + '%'}</text></svg>`;
}
let collectionOpenId = null;
function renderCollections(){
  const body = document.getElementById('collectionsBody');
  const idx = collectionVisitIndex();
  const cols = allCollections();
  document.getElementById('collectionsTitle').textContent = 'Коллекции';
  if(collectionOpenId){
    const col = cols.find(c => c.id === collectionOpenId);
    if(col) return renderCollectionDetail(col, idx);
    collectionOpenId = null;
  }
  const groups = ['Россия', 'Мир', 'Столицы', 'Страны', 'Свои'];
  let html = '';
  groups.forEach(g => {
    const list = cols.filter(c => c.group === g);
    if(!list.length && !(g === 'Свои' && !READ_ONLY)) return;
    html += `<div class="coll-group">${g === 'Свои' ? 'Свои коллекции' : g}</div><div class="coll-grid">`;
    list.forEach(c => {
      const p = collectionProgress(c, idx);
      html += `<button class="coll-card${p.got === p.total && p.total ? ' done' : ''}" data-coll="${escapeAttr(c.id)}">${collRing(p.got, p.total, 46)}
        <span><b>${escapeHtml(c.title)}</b><small>${p.got} из ${p.total}${p.got === p.total && p.total ? ' · собрана' : ''}</small></span></button>`;
    });
    html += `</div>`;
    if(g === 'Свои' && !READ_ONLY){
      html += `<div class="coll-new"><input type="text" id="collNewName" placeholder="Название, например «Озёра Карелии»" maxlength="60">
        <button class="cancel-edit" id="collNewBtn" style="margin:0;width:auto;padding:6px 14px;">Создать</button></div>
        <div class="hint">Свою коллекцию можно собрать из любых городов и стран.</div>`;
    }
  });
  body.innerHTML = html;
  body.onclick = null;
  body.querySelectorAll('[data-coll]').forEach(b => b.addEventListener('click', () => { collectionOpenId = b.dataset.coll; renderCollections(); }));
  const nb = document.getElementById('collNewBtn');
  if(nb) nb.addEventListener('click', async () => {
    const name = document.getElementById('collNewName').value.trim();
    if(!name){ toast('Назовите коллекцию'); return; }
    const id = COLLECTION_PREFIX + genId();
    tripMeta[id] = { kind: 'collection', name, items: [], createdAt: Date.now() };
    await saveData();
    collectionOpenId = id;
    renderCollections();
  });
}
function renderCollectionDetail(col, idx){
  const body = document.getElementById('collectionsBody');
  const p = collectionProgress(col, idx);
  document.getElementById('collectionsTitle').textContent = col.title;
  const order = col.items.map((it, i) => ({ it, s: p.st[i], i }));
  // сначала не собранные — к ним вопрос «куда дальше»
  order.sort((a, b) => (a.s.got - b.s.got) || a.it.name.localeCompare(b.it.name, 'ru'));
  const canMap = col.items.some(it => it.lat != null || it.kind === 'country' || it.kind === 'region');
  let html = `<button class="cancel-edit" id="collBack" style="margin:0 0 8px;width:auto;padding:5px 12px;">← Все коллекции</button>
    <div class="coll-head">${collRing(p.got, p.total, 64)}<div><div class="coll-big">${p.got} из ${p.total}</div>
    <div class="hint" style="margin:0;">${p.got === p.total && p.total ? 'Коллекция собрана!' : `Осталось ${p.total - p.got}`}</div></div></div>
    <div class="coll-bar"><i style="width:${p.total ? (p.got / p.total * 100).toFixed(1) : 0}%;"></i></div>
    <div class="coll-actions">
      ${canMap ? `<button class="cancel-edit" id="collMapBtn">Показать на карте</button>` : ''}
      ${col.custom && !READ_ONLY ? `<button class="cancel-edit" id="collRename">Переименовать</button><button class="cancel-edit" id="collDelete">Удалить коллекцию</button>` : ''}
    </div>`;
  if(col.custom && !READ_ONLY){
    html += `<div class="search-wrap" style="margin-bottom:8px;"><input type="text" id="collAddInput" placeholder="Добавить город или страну…" autocomplete="off">
      <div class="suggest-box" id="collAddSuggest" style="display:none;"></div></div>`;
  }
  if(!col.items.length) html += `<div class="hint">Пока пусто — найдите город или страну в поле выше.</div>`;
  const row = ({ it, s, i }, inGroup) => {
    const sub = it.uid ? [inGroup ? '' : (COUNTRY_RU[it.key] || it.key || ''), UNESCO_CAT[it.cat], it.multi ? 'в нескольких странах' : ''].filter(Boolean).join(', ')
      : it.kind === 'country' ? 'страна' : it.kind === 'region' ? 'регион' : it.kind === 'place' ? 'место' : (it.key ? (COUNTRY_RU[it.key] || '') : '');
    const flag = it.kind === 'country' ? countryFlag(it.key) + ' ' : (it.key && !col.big ? countryFlag(it.key) + ' ' : '');
    return `<div class="coll-item${s.got ? ' got' : ''}"><span class="ci-mark">${s.got ? '✓' : ''}</span>
      <span class="ci-name">${flag}${escapeHtml(it.name)}<small>${escapeHtml([sub, s.got && s.year ? (s.year + '') : (s.got ? 'есть' : '')].filter(Boolean).join(' · '))}</small></span>
      <span class="ci-act">${it.uid ? `<a class="cancel-edit" href="https://whc.unesco.org/ru/list/${+it.uid}/" target="_blank" rel="noopener" title="Описание на сайте ЮНЕСКО">ⓘ</a>` : ''}
        ${it.lat != null ? `<button class="cancel-edit" data-ci-map="${i}" title="Показать на карте">на карте</button>` : ''}
        ${!s.got && !READ_ONLY && it.kind !== 'region' ? `<button class="cancel-edit" data-ci-plan="${i}" title="Добавить в планы">в планы</button>` : ''}
        ${col.custom && !READ_ONLY ? `<button class="cancel-edit" data-ci-del="${i}" title="Убрать из коллекции">✕</button>` : ''}</span></div>`;
  };
  // большой список (ЮНЕСКО) — поиск и группы по странам, строки группы рисуются при раскрытии
  let groups = null;
  if(col.big){
    const byKey = new Map();
    order.forEach(o => { const k = o.it.key || ''; if(!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(o); });
    groups = [...byKey.entries()].map(([k, list]) => ({ k, name: k ? (COUNTRY_RU[k] || k) : 'Открытое море', list, got: list.filter(o => o.s.got).length }))
      .sort((a, b) => (b.got > 0) - (a.got > 0) || (a.k === HOME_COUNTRY_KEY ? -1 : b.k === HOME_COUNTRY_KEY ? 1 : 0) || a.name.localeCompare(b.name, 'ru'));
    html += `<div class="hint" style="margin:0 0 8px;">Объект засчитывается, если рядом есть ваша отметка, остановка или трек. Список и описания — на <a href="https://whc.unesco.org/ru/list/" target="_blank" rel="noopener" style="color:inherit;">whc.unesco.org</a>.</div>
      <div class="search-wrap" style="margin-bottom:8px;"><input type="text" id="collSearch" placeholder="Найти объект или страну…" autocomplete="off"></div>
      <div id="collSearchRes"></div><div id="collGroups">` +
      groups.map((g, gi) => `<details class="coll-cc" data-cc="${gi}"${g.k === HOME_COUNTRY_KEY && g.got ? ' open' : ''}><summary>${g.k ? countryFlag(g.k) + ' ' : ''}${escapeHtml(g.name)}<small>${g.got} из ${g.list.length}</small></summary><div class="coll-cc-body"></div></details>`).join('') + `</div>`;
  } else {
    html += order.map(o => row(o)).join('');
  }
  body.innerHTML = html;
  document.getElementById('collBack').addEventListener('click', () => { collectionOpenId = null; renderCollections(); });
  const mb = document.getElementById('collMapBtn');
  if(mb) mb.addEventListener('click', () => showCollectionOnMap(col, p));
  if(groups){
    const fill = d => { const b = d.querySelector('.coll-cc-body'); if(!b.childElementCount) b.innerHTML = groups[+d.dataset.cc].list.map(o => row(o, true)).join(''); };
    body.querySelectorAll('details.coll-cc').forEach(d => { if(d.open) fill(d); d.addEventListener('toggle', () => { if(d.open) fill(d); }); });
    const inp = document.getElementById('collSearch'), res = document.getElementById('collSearchRes'), gw = document.getElementById('collGroups');
    inp.addEventListener('input', () => {
      const q = normSearch(inp.value.trim());
      if(q.length < 2){ res.innerHTML = ''; gw.style.display = ''; return; }
      const hits = order.filter(o => normSearch(o.it.name).includes(q) || (o.it.key && normSearch(COUNTRY_RU[o.it.key] || '').includes(q)));
      gw.style.display = 'none';
      res.innerHTML = hits.length ? hits.slice(0, 80).map(o => row(o)).join('') + (hits.length > 80 ? `<div class="hint">…и ещё ${hits.length - 80} — уточните запрос</div>` : '')
        : `<div class="hint">Ничего не найдено</div>`;
    });
  }
  // строки большого списка появляются позже — обработчики делегированы
  body.onclick = e => {
    const mapBtn = e.target.closest('[data-ci-map]'), planBtn = e.target.closest('[data-ci-plan]');
    if(mapBtn) showCollItemOnMap(col.items[+mapBtn.dataset.ciMap]);
    else if(planBtn) addCollItemToPlans(col, col.items[+planBtn.dataset.ciPlan], planBtn);
  };
  if(col.custom && !READ_ONLY){
    const meta = tripMeta[col.id];
    const persist = async () => { meta.updatedAt = Date.now(); await saveData(); renderCollections(); };
    body.querySelectorAll('[data-ci-del]').forEach(b => b.addEventListener('click', () => { meta.items.splice(+b.dataset.ciDel, 1); persist(); }));
    document.getElementById('collRename').addEventListener('click', () => {
      const n = prompt('Название коллекции', meta.name || '');
      if(n && n.trim()){ meta.name = n.trim().slice(0, 60); persist(); }
    });
    document.getElementById('collDelete').addEventListener('click', async () => {
      if(!confirm(`Удалить коллекцию «${meta.name}»? Отметки на карте не пострадают.`)) return;
      delete tripMeta[col.id];
      collectionOpenId = null;
      await saveData();
      renderCollections();
    });
    const inp = document.getElementById('collAddInput'), box = document.getElementById('collAddSuggest');
    let found = [];
    inp.addEventListener('input', () => {
      const q = inp.value.trim();
      if(q.length < 2){ box.style.display = 'none'; return; }
      // страны — только по названию (иначе на «Тбилиси» первой выпадала Грузия как страна)
      found = [...localCountrySearch(q, 6).filter(c => normSearch(c.ru).includes(normSearch(q))).slice(0, 3).map(c => ({ kind: 'country', key: c.key, label: `${countryFlag(c.key)} ${c.ru} — страна` })),
               ...localCitySearch(q, 8).map(c => ({ kind: 'city', name: c.name, lat: c.lat, lng: c.lng, countryKey: c.countryKey,
                 label: `${c.countryKey ? countryFlag(c.countryKey) + ' ' : ''}${c.name}${c.region ? ', ' + c.region : ''}${c.countryKey ? ' — ' + (COUNTRY_RU[c.countryKey] || '') : ''}` }))];
      box.innerHTML = found.length ? found.map((f, j) => `<div class="suggest-item" data-ca="${j}">${escapeHtml(f.label)}</div>`).join('') : `<div class="suggest-empty">Ничего не найдено в справочнике</div>`;
      box.style.display = 'block';
      box.querySelectorAll('[data-ca]').forEach(el => el.addEventListener('click', () => {
        const f = found[+el.dataset.ca];
        const dup = meta.items.some(x => f.kind === 'country' ? x.kind === 'country' && x.key === f.key : x.kind !== 'country' && normSearch(x.name) === normSearch(f.name) && Math.abs(x.lat - f.lat) < 0.2);
        if(!dup) meta.items.push(f.kind === 'country' ? { kind: 'country', key: f.key } : { kind: 'city', name: f.name, lat: f.lat, lng: f.lng, countryKey: f.countryKey || null });
        persist();
      }));
    });
  }
}
function showCollItemOnMap(it){
  document.getElementById('collectionsModal').style.display = 'none';
  mnavShow('map');
  map.setView([it.lat, it.lng], it.uid && it.cat !== 'c' ? 8 : 9);
  showSearchPin({ name: it.name, lat: it.lat, lng: it.lng, countryKey: it.key || (findCountryFeature({ lat: it.lat, lng: it.lng }) || { properties: {} }).properties.name || null });
}
async function addCollItemToPlans(col, it, btn){
  const base = { id: genId(), year: new Date().getFullYear(), photos: [], notes: `Из коллекции «${col.title}»`, purpose: 'tourism', status: 'wishlist', favorite: false };
  if(it.kind === 'country'){
    allEntries.push({ ...base, type: 'country', name: COUNTRY_RU[it.key] || it.key, countryKey: it.key, color: DEFAULT_COLOR.country });
  } else {
    const ck = it.key || ((findCountryFeature({ lat: it.lat, lng: it.lng }) || { properties: {} }).properties.name) || null;
    allEntries.push({ ...base, type: 'city', name: it.name, lat: it.lat, lng: it.lng, countryKey: ck, color: DEFAULT_COLOR.city });
  }
  recordBulkAction('добавление в планы', null, [], [allEntries[allEntries.length - 1].id]);
  btn.remove();
  const saved = await saveData();
  rebuildAll();
  if(saved) showUndoToast(`В планах: ${it.name}`);
}
// коллекция на карте: собранное — зелёным, остальное — пунктирным кольцом
let collectionLayer = null;
function hideCollectionOnMap(){
  if(collectionLayer){ map.removeLayer(collectionLayer); collectionLayer = null; }
  document.getElementById('collectionChip').style.display = 'none';
}
function showCollectionOnMap(col, p){
  hideCollectionOnMap();
  collectionLayer = L.layerGroup().addTo(map);
  const pts = [];
  col.items.forEach((it, i) => {
    const got = p.st[i].got;
    let ll = null;
    if(it.lat != null) ll = [it.lat, it.lng];
    else if(it.kind === 'country'){ const a = countryAnchor(it.key, countryBounds(it.key)); if(a) ll = [a.lat, a.lng]; }
    else if(it.kind === 'region'){ const r = RU_REGIONS.find(x => x.name === it.name); if(r) ll = polyLabelPoint(mainRing(r.geometry)); }
    if(!ll) return;
    pts.push(ll);
    const mk = L.circleMarker(ll, { pane: 'routePane', renderer: routeRenderer, radius: got ? 6 : 6.5,
      color: got ? '#2B3B2E' : '#A6592E', weight: got ? 1.5 : 2, dashArray: got ? null : '3,3', fillColor: got ? '#3F5240' : '#F3ECD8', fillOpacity: got ? 1 : 0.9 })
      .bindTooltip(`${got ? '✓ ' : ''}${escapeHtml(it.name)}`, { permanent: col.items.length <= 20, direction: 'right', offset: [6, 0], className: 'tp-map-label' });
    mk.addTo(collectionLayer);
  });
  const chip = document.getElementById('collectionChip');
  chip.innerHTML = `<b>${escapeHtml(col.title)}</b><span>${p.got}/${p.total}</span><button title="Убрать с карты" aria-label="Убрать коллекцию с карты">✕</button>`;
  chip.style.display = 'flex';
  chip.querySelector('button').addEventListener('click', hideCollectionOnMap);
  document.getElementById('collectionsModal').style.display = 'none';
  mnavShow('map');
  if(pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.15), { maxZoom: 9 });
}
document.getElementById('openCollectionsBtn').addEventListener('click', () => {
  collectionOpenId = null;
  renderCollections();
  document.getElementById('collectionsModal').style.display = 'flex';
});
document.getElementById('closeCollectionsModal').addEventListener('click', () => { document.getElementById('collectionsModal').style.display = 'none'; });
document.getElementById('collectionsModal').addEventListener('click', e => { if(e.target.id === 'collectionsModal') e.target.style.display = 'none'; });

