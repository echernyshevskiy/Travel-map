// ---------- импорт из фотографий ----------
let photoClusters = [];

function readFileHead(file, bytes){
  // читаем только начало файла: метаданные лежат в первых килобайтах,
  // тянуть в память снимок на 15 МБ незачем
  return new Promise(resolve=>{
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve(null);
    reader.readAsArrayBuffer(file.slice(0, bytes || 256 * 1024));
  });
}

// полоска прогресса: первая половина — чтение файлов, вторая — названия мест
function setPhotoProgress(v){
  const bar = document.getElementById('photoProgress');
  if(!bar) return;
  if(v == null){ bar.style.display = 'none'; return; }
  bar.style.display = 'block';
  bar.value = Math.max(0, Math.min(1, v));
}
async function handlePhotoFiles(files){
  const status = document.getElementById('photoStatus');
  const results = document.getElementById('photoResults');
  results.innerHTML = '';
  photoClusters = [];
  const list = Array.from(files);
  if(list.length === 0) return;
  const items = [];
  let noMeta = 0, heic = 0;
  for(let i = 0; i < list.length; i++){
    const f = list[i];
    if(i % 10 === 0){ status.textContent = `Читаю ${i+1} из ${list.length}…`; setPhotoProgress(i / list.length * 0.5); }
    const buf = await readFileHead(f);
    let meta = buf ? readPhotoMeta(buf) : null;
    if(!meta && buf){
      meta = await readHeicMeta(f, buf);
      if(meta) heic++;
    }
    const date = (meta && meta.date && parseExifDate(meta.date)) || dateFromFilename(f.name);
    if(!date){ noMeta++; continue; }
    items.push({ name: f.name, date, lat: meta ? meta.lat : null, lng: meta ? meta.lng : null });
  }
  const clusters = clusterPhotos(items);
  photoClusters = clusters;
  const withGeo = clusters.filter(c => c.lat !== null).length;
  status.textContent = `Прочитано ${items.length} из ${list.length}` +
    (noMeta ? ` · без даты: ${noMeta}` : '') +
    (heic ? ` · из них HEIC: ${heic}` : '') +
    ` · поездок: ${clusters.length}, из них с координатами: ${withGeo}`;

  if(clusters.length === 0){
    setPhotoProgress(null);
    results.innerHTML = `<div class="hint" style="padding:0 20px 20px;">Не удалось определить дату ни у одного снимка. Обычно так бывает с пересланными через мессенджеры файлами.</div>`;
    return;
  }
  renderPhotoClusters();
  // названия мест подтягиваем по одному, чтобы не заваливать бесплатный геокодер
  for(let i = 0; i < clusters.length; i++){
    const c = clusters[i];
    if(c.lat === null) continue;
    status.textContent = `Определяю место ${i+1} из ${clusters.length}…`;
    setPhotoProgress(0.5 + i / clusters.length * 0.5);
    try{
      const r = await reverseGeocode(c.lat, c.lng);
      if(r){ c.place = r.name; c.countryKey = r.countryKey; }
    }catch(e){ /* без названия — пользователь впишет сам */ }
    renderPhotoClusters();
    // темп запросов держит nominatimThrottle
  }
  status.textContent = `Готово. Проверьте и отметьте, что добавить.`;
  setPhotoProgress(1);
  setTimeout(()=> setPhotoProgress(null), 1200);
}

// Кэш геокодера: повторный поиск того же города и названия мест для фото из
// одной поездки не ходят в сеть заново. Храним до 400 последних ответов, 60 дней.
const GEO_CACHE_KEY = 'travel-map-geocache';
const GEO_CACHE_MAX = 400, GEO_CACHE_TTL = 60 * 86400000;
let geoCacheMem = null;
function geoCacheGet(key){
  try{
    if(!geoCacheMem) geoCacheMem = JSON.parse(localStorage.getItem(GEO_CACHE_KEY) || '{}');
    const hit = geoCacheMem[key];
    if(hit && Date.now() - hit.t < GEO_CACHE_TTL) return hit.v;
  }catch(e){}
  return undefined;
}
function geoCachePut(key, value){
  try{
    if(!geoCacheMem) geoCacheMem = JSON.parse(localStorage.getItem(GEO_CACHE_KEY) || '{}');
    geoCacheMem[key] = { t: Date.now(), v: value };
    const keys = Object.keys(geoCacheMem);
    if(keys.length > GEO_CACHE_MAX){
      keys.sort((a, b) => geoCacheMem[a].t - geoCacheMem[b].t).slice(0, keys.length - GEO_CACHE_MAX).forEach(k => delete geoCacheMem[k]);
    }
    localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(geoCacheMem));
  }catch(e){}
}
// ближайший город из встроенного справочника — для фото без сети
function nearestLocalCity(lat, lng, maxKm){
  let best = null, bestD = maxKm || 40;
  const cl = Math.cos(lat * Math.PI / 180);
  getWorldCities().forEach(c => {
    const d = Math.hypot((c.lng - lng) * cl, c.lat - lat) * 111;
    if(d < bestD){ bestD = d; best = c; }
  });
  return best;
}
async function reverseGeocode(lat, lng){
  const key = 'r:' + lat.toFixed(2) + ',' + lng.toFixed(2);
  const cached = geoCacheGet(key);
  if(cached !== undefined) return cached;
  const offline = () => { const c = nearestLocalCity(lat, lng, 40); return c ? { name: c.name, countryKey: c.countryKey } : null; };
  if(navigator.onLine === false || nominatimDown()) return offline();
  let r;
  try{ r = await reverseGeocodeOnline(lat, lng); }
  catch(e){ return offline(); }
  geoCachePut(key, r);
  return r;
}
async function reverseGeocodeOnline(lat, lng){
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1&accept-language=ru&zoom=10&lat=${lat}&lon=${lng}`;
  const d = await nominatimJson(url) || {};
  const a = d.address || {};
  const name = cleanPlaceName(a.city || a.town || a.village || a.municipality || a.county || a.state || '') || null;
  if(!name) return null;
  return { name, countryKey: findAnyCountryKeyByRuName(a.country, a.country_code ? a.country_code.toUpperCase() : null) };
}

function fmtPhotoRange(c){
  const m = mm => monthLabel(mm) || mm;
  if(c.from.year === c.to.year && c.from.month === c.to.month){
    return c.from.day === c.to.day
      ? `${c.from.day} ${m(c.from.month)} ${c.from.year}`
      : `${c.from.day}–${c.to.day} ${m(c.from.month)} ${c.from.year}`;
  }
  return `${c.from.day} ${m(c.from.month)} ${c.from.year} — ${c.to.day} ${m(c.to.month)} ${c.to.year}`;
}

// Проверяем, не занесена ли эта поездка уже вручную. Сравниваем по году и
// месяцу, а внутри — по близости координат либо по названию: одно место могло
// быть записано под чуть другим именем.
const PHOTO_SAME_PLACE_KM = 60;
function findExistingForCluster(c){
  const candidates = allEntries.filter(e =>
    e.status !== 'wishlist' && e.year === c.from.year &&
    (e.month === c.from.month || e.month === c.to.month));
  if(candidates.length === 0) return null;
  // по координатам надёжнее, чем по названию
  if(c.lat !== null){
    const near = candidates.find(e =>
      e.type === 'city' && e.lat != null && haversine([e.lat, e.lng], [c.lat, c.lng]) <= PHOTO_SAME_PLACE_KM);
    if(near) return near;
  }
  if(c.place){
    const target = c.place.trim().toLowerCase();
    const byName = candidates.find(e => (e.name || '').trim().toLowerCase() === target);
    if(byName) return byName;
  }
  return null;
}

function renderPhotoClusters(){
  const results = document.getElementById('photoResults');
  photoClusters.forEach(c => { c.existing = findExistingForCluster(c); });
  const dupes = photoClusters.filter(c => c.existing).length;
  results.innerHTML = photoClusters.map((c,i) => `
    <div class="diag-row" style="cursor:default;${c.existing ? 'opacity:0.72;' : ''}">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
        <input type="checkbox" data-photo-pick="${i}" ${(c.lat !== null && !c.existing) ? 'checked' : ''}>
        <b style="font-weight:600;">${fmtPhotoRange(c)}</b>
      </label>
      <div class="diag-row-meta">снимков: ${c.photos.length}${c.geoCount ? ` · с координатами: ${c.geoCount}` : ' · координат нет'}</div>
      ${c.existing ? `<div class="diag-row-meta" style="color:var(--amber);">уже есть: «${escapeHtml(c.existing.name)}» ${monthLabel(c.existing.month) || ''} ${c.existing.year}</div>` : ''}
      <div class="diag-merge" style="flex-direction:column;align-items:stretch;">
        <div class="search-wrap" style="width:100%;">
          <input type="text" data-photo-name="${i}" value="${escapeAttr(c.place || '')}" placeholder="${c.lat !== null ? 'определяю место…' : 'начните вводить город…'}" aria-label="Название места" autocomplete="off">
          <div class="suggest-box" data-photo-suggest="${i}" style="display:none;"></div>
        </div>
      </div>
    </div>
  `).join('') + `<div style="padding:10px 20px 20px;">
      <button class="cancel-edit" id="photoApplyBtn" style="margin-top:0;">Добавить отмеченные</button>
      <div class="hint">${dupes ? `Похоже, уже занесено: ${dupes} — снял отметки, но добавить всё равно можно. ` : ''}Добавятся как города с указанным месяцем и годом.</div>
    </div>`;
  const apply = document.getElementById('photoApplyBtn');
  if(apply) apply.addEventListener('click', applyPhotoClusters);

  // Подсказки городов. Без них у поездки без геометок оставалось голое название:
  // запись создавалась без координат и на карту не попадала вовсе.
  results.querySelectorAll('[data-photo-name]').forEach(input=>{
    const idx = parseInt(input.dataset.photoName, 10);
    const box = results.querySelector(`[data-photo-suggest="${idx}"]`);
    let timer = null;
    input.addEventListener('input', ()=>{
      const q = input.value.trim();
      const cluster = photoClusters[idx];
      if(cluster){ cluster.place = q; cluster.lat = null; cluster.lng = null; cluster.countryKey = null; }
      clearTimeout(timer);
      if(q.length < 2){ box.style.display = 'none'; return; }
      timer = setTimeout(async ()=>{
        try{
          const seq = ++suggestSeq.photo;
          const matches = await queryNominatimSettlements(q);
          if(seq !== suggestSeq.photo) return;
          if(matches.length === 0){
            box.innerHTML = `<div class="suggest-empty">Ничего не найдено</div>`;
            box.style.display = 'block';
            return;
          }
          box.innerHTML = matches.map((m,j) => `<div class="suggest-item" data-pick="${j}">${escapeHtml(m.full)}</div>`).join('');
          box.style.display = 'block';
          box.querySelectorAll('[data-pick]').forEach(el=>{
            el.addEventListener('click', ()=>{
              const m = matches[parseInt(el.dataset.pick, 10)];
              const cl = photoClusters[idx];
              if(!cl) return;
              cl.place = m.name;
              cl.lat = m.lat;
              cl.lng = m.lng;
              cl.countryKey = findAnyCountryKeyByRuName(m.country, m.countryCode);
              input.value = m.name;
              box.style.display = 'none';
              renderPhotoClusters(); // перерисовываем: место найдено, проверка на дубли могла измениться
            });
          });
          clearServiceIssue('поиск городов');
        }catch(err){
          box.innerHTML = `<div class="suggest-empty">Нет соединения — попробуйте позже</div>`;
          box.style.display = 'block';
          reportServiceIssue('поиск городов');
        }
      }, 700);
    });
  });
}

async function applyPhotoClusters(){
  if(READ_ONLY){ toast('Это read-only версия — добавление недоступно'); return; }
  const results = document.getElementById('photoResults');
  let added = 0;
  const createdIds = [];
  photoClusters.forEach((c,i)=>{
    const cb = results.querySelector(`[data-photo-pick="${i}"]`);
    if(!cb || !cb.checked) return;
    const nameInput = results.querySelector(`[data-photo-name="${i}"]`);
    const name = (nameInput && nameInput.value.trim()) || c.place;
    if(!name) return; // без названия запись бессмысленна
    allEntries.push({
      id: genId(), type: 'city', name, year: c.from.year, month: c.from.month,
      lat: c.lat, lng: c.lng, countryKey: c.countryKey || null,
      photos: [], notes: `Из фотографий: ${c.photos.length} шт., ${fmtPhotoRange(c)}`,
      purpose: 'tourism', season: seasonForMonth(c.from.month),
      color: DEFAULT_COLOR.city, status: 'visited', favorite: false
    });
    createdIds.push(allEntries[allEntries.length-1].id);
    added++;
  });
  if(added === 0){ toast('Не отмечено ни одной поездки с названием'); return; }
  recordBulkAction(`импорт из фото (${added})`, null, [], createdIds);
  // запись без координат не получит точку на карте — предупреждаем, а не молчим
  const noCoords = createdIds.filter(id => {
    const e = allEntries.find(x => x.id === id);
    return e && (e.lat == null || e.lng == null);
  }).length;
  const saved = await saveData();
  rebuildAll();
  document.getElementById('photoImportModal').style.display = 'none';
  if(saved) showUndoToast(noCoords
    ? `Добавлено: ${added}, без координат: ${noCoords} — их не будет на карте`
    : `Добавлено записей: ${added}`);
}

