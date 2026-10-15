// ---------- квиз ----------
// Четыре режима: флаг → страна, страна → столица, столица → страна и «Где это?»
// (клик по чистой карте). Формат: раунд из 10 вопросов или марафон до первой
// ошибки. Набор: весь мир, часть света или «мои» страны. Рекорды — в браузере.
// В квиз входят страны ООН и Ватикан; территории и частично признанные — нет.
const QUIZ_EXCLUDE = new Set(['Antarctica','Bermuda','Falkland Islands','French Guiana','French Southern and Antarctic Lands',
  'Greenland','Kosovo','New Caledonia','Northern Cyprus','Puerto Rico','Somaliland','Taiwan','West Bank','Western Sahara']);
// у этих стран столица спорная или их несколько — в вопросах о столицах их нет
const QUIZ_NO_CAPITAL = new Set(['Bolivia','South Africa','Israel']);
// пояснения после ответа, где столица — не самый известный город
const QUIZ_CAPITAL_NOTES = {
  'Benin': 'Официальная столица — Порто-Ново, правительство работает в Котону.',
  'Ivory Coast': 'Официальная столица — Ямусукро, крупнейший город — Абиджан.',
  'Sri Lanka': 'Официальная столица — Шри-Джаяварденепура-Котте, пригород Коломбо.',
  'Netherlands': 'Столица — Амстердам, но правительство и король — в Гааге.',
  'Malaysia': 'Столица — Куала-Лумпур, правительство переехало в Путраджаю.',
  'Swaziland': 'Административная столица — Мбабане, королевская и законодательная — Лобамба.',
  'United Republic of Tanzania': 'Официальная столица — Додома, крупнейший город — Дар-эс-Салам.',
  'Nigeria': 'Столица с 1991 года — Абуджа, крупнейший город — Лагос.',
  'Myanmar': 'Столица с 2005 года — Нейпьидо, крупнейший город — Янгон.',
  'Turkey': 'Столица — Анкара, крупнейший город — Стамбул.',
  'Australia': 'Столица — Канберра, а не Сидней или Мельбурн.',
  'Canada': 'Столица — Оттава, а не Торонто.',
  'Brazil': 'Столица — Бразилиа, построена с нуля в 1960 году.',
  'Kazakhstan': 'Столица — Астана, до 1997 года — Алматы.',
  'Burundi': 'Столица с 2019 года — Гитега, до этого — Бужумбура.',
  'Switzerland': 'Официально столицы нет: Берн — «федеральный город».',
  'Pakistan': 'Столица — Исламабад, крупнейший город — Карачи.',
  'Morocco': 'Столица — Рабат, крупнейший город — Касабланка.',
  'New Zealand': 'Столица — Веллингтон, крупнейший город — Окленд.',
  'Vietnam': 'Столица — Ханой, крупнейший город — Хошимин.',
};
// похожие флаги: друг для друга в варианты ответа не попадают
const QUIZ_FLAG_LOOKALIKES = [
  ['Chad','Romania','Andorra','Moldova'], ['Monaco','Indonesia','Poland'], ['Ireland','Ivory Coast'], ['Italy','Mexico'],
  ['Netherlands','Luxembourg'], ['Australia','New Zealand'], ['Colombia','Ecuador','Venezuela'], ['Senegal','Mali','Guinea','Cameroon'],
  ['Qatar','Bahrain'], ['Egypt','Syria','Iraq','Yemen'], ['Honduras','Nicaragua','El Salvador'], ['Slovenia','Slovakia','Russia','Republic of Serbia'],
  ['Norway','Iceland'], ['Niger','India'], ['Haiti','Liechtenstein']
];
const QUIZ_MODES = {
  flag:    { title: 'Флаг → страна', sub: 'Чей это флаг?' },
  capital: { title: 'Страна → столица', sub: 'Какая столица у страны?' },
  country: { title: 'Столица → страна', sub: 'Столицей чего является город?' },
  map:     { title: 'Где это?', sub: 'Найдите страну на карте' },
  ruregion:{ title: 'Регионы России', sub: 'Найдите регион на карте' },
};
const QUIZ_REGION_SETS = [['all','Все регионы'], ['visited', READ_ONLY ? 'Где был автор' : 'Где я был'], ['unvisited', READ_ONLY ? 'Где автор не был' : 'Ещё не был']];
const isMapMode = mode => mode === 'map' || mode === 'ruregion';
// регионы, где были: по всем посещённым записям, без учёта фильтров карты
function quizVisitedRegions(){
  try{ return new Set(computeRuRegions(allEntries.filter(e => e.status !== 'wishlist')).visited.keys()); }
  catch(e){ return new Set(); }
}
const quizIsRegion = () => quizState && quizState.mode === 'ruregion';
function quizName(k){ return quizIsRegion() ? k : (COUNTRY_RU[k] || k); }
function quizFlag(k){ return quizIsRegion() ? '' : (countryFlag(k) || ''); }
function quizGeom(k){
  if(quizIsRegion()){ const r = RU_REGIONS.find(x => x.name === k); return r ? r.geometry : null; }
  return getCountryGeometry(k);
}
function quizBounds(k){
  if(!quizIsRegion()) return countryBounds(k);
  const g = quizGeom(k);
  if(!g) return null;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  const all = polys.flatMap(p => p[0]);
  const xs = all.map(c => c[0]);
  // Чукотка пересекает линию перемены дат — берём её основной контур
  const use = (Math.max(...xs) - Math.min(...xs)) > 300
    ? polys.map(p => p[0]).sort((a, b) => b.length - a.length).find(r => Math.max(...r.map(c=>c[0])) > 0) : all;
  return L.latLngBounds(use.map(c => [c[1], c[0]]));
}
const QUIZ_SETS = [
  ['world','Весь мир'], ['Европа','Европа'], ['Азия','Азия'], ['Африка','Африка'],
  ['Северная Америка','Северная Америка'], ['Южная Америка','Южная Америка'], ['Австралия и Океания','Океания'],
  // в версии для друзей «мои» — это страны автора карты
  ['visited', READ_ONLY ? 'Где был автор' : 'Где я был'], ['planned', READ_ONLY ? 'Планы автора' : 'Мои планы']
];
const QUIZ_KEY = 'travel-map-quiz';
const QUIZ_ROUND = 10;
let quizState = null; // текущая игра

function quizStore(){
  try{ return Object.assign({ mode: 'flag', format: 'round', set: 'world', records: {}, stats: {} }, JSON.parse(localStorage.getItem(QUIZ_KEY) || '{}')); }
  catch(e){ return { mode: 'flag', format: 'round', set: 'world', records: {}, stats: {} }; }
}
function quizSave(st){ try{ localStorage.setItem(QUIZ_KEY, JSON.stringify(st)); }catch(e){} }
const quizCountries = () => COUNTRY_LIST.map(c => c.key).filter(k => !QUIZ_EXCLUDE.has(k));
const quizCapital = k => ((COUNTRY_INFO[k] || {}).capital || '').trim();
const normQ = s => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/^эль-/, '');
function quizVisitedKeys(){
  const set = new Set(allEntries.filter(e => e.type === 'country' && e.status !== 'wishlist' && e.countryKey).map(e => e.countryKey));
  set.add(HOME_COUNTRY_KEY); // в своей стране вы, конечно, были
  return set;
}
function quizPlannedKeys(){
  return new Set(allEntries.filter(e => e.type === 'country' && e.status === 'wishlist' && e.countryKey).map(e => e.countryKey));
}
function quizEligible(mode, k){
  if(mode === 'capital') return !!quizCapital(k) && !QUIZ_NO_CAPITAL.has(k);
  if(mode === 'country'){
    const cap = quizCapital(k);
    // «Монако — столица чего?» — не вопрос
    return !!cap && !QUIZ_NO_CAPITAL.has(k) && !normQ(COUNTRY_RU[k]).includes(normQ(cap)) && !normQ(cap).includes(normQ(COUNTRY_RU[k]));
  }
  if(mode === 'map') return !!getCountryGeometry(k);
  return !!countryFlag(k);
}
function quizPool(mode, set){
  if(mode === 'ruregion'){
    let names = RU_REGIONS.map(r => r.name);
    if(set === 'visited'){ const v = quizVisitedRegions(); names = names.filter(n => v.has(n)); }
    else if(set === 'unvisited'){ const v = quizVisitedRegions(); names = names.filter(n => !v.has(n)); }
    return names;
  }
  let keys = quizCountries().filter(k => quizEligible(mode, k));
  if(set === 'visited'){ const v = quizVisitedKeys(); keys = keys.filter(k => v.has(k)); }
  else if(set === 'planned'){ const pl = quizPlannedKeys(); keys = keys.filter(k => pl.has(k)); }
  else if(set !== 'world') keys = keys.filter(k => COUNTRY_CONTINENT[k] === set);
  return keys;
}
function shuffle(a){ for(let i = a.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function quizLookalikes(k){
  const g = QUIZ_FLAG_LOOKALIKES.find(gr => gr.includes(k));
  return new Set(g || []);
}
// три неверных варианта: сначала из той же части света, чтобы не было слишком просто
function quizOptions(mode, target){
  const avoid = mode === 'flag' ? quizLookalikes(target) : new Set();
  const all = quizCountries().filter(k => k !== target && !avoid.has(k) && (mode === 'capital' ? !!quizCapital(k) : true));
  const same = shuffle(all.filter(k => COUNTRY_CONTINENT[k] === COUNTRY_CONTINENT[target]));
  const other = shuffle(all.filter(k => COUNTRY_CONTINENT[k] !== COUNTRY_CONTINENT[target]));
  const picked = [];
  const label = k => mode === 'capital' ? quizCapital(k) : COUNTRY_RU[k];
  const used = new Set([normQ(label(target))]);
  for(const k of [...same, ...other]){
    if(picked.length >= 3) break;
    const l = normQ(label(k));
    if(used.has(l)) continue;
    used.add(l); picked.push(k);
  }
  return shuffle([target, ...picked]);
}
function quizTravelNote(k){
  if(quizIsRegion()){
    try{
      const places = computeRuRegions(allEntries.filter(e => e.status !== 'wishlist')).visited.get(k);
      return places ? `Вы были здесь: ${[...places].slice(0, 5).join(', ')}${places.size > 5 ? ' и ещё ' + (places.size - 5) : ''}` : '';
    }catch(e){ return ''; }
  }
  if(k === HOME_COUNTRY_KEY) return 'Ваш дом';
  const own = allEntries.filter(e => e.type === 'country' && e.countryKey === k);
  const years = [...new Set(own.filter(e => e.status !== 'wishlist').map(e => e.year).filter(Boolean))].sort((a,b)=>a-b);
  if(years.length) return `Вы были здесь: ${years.join(', ')}`;
  if(own.some(e => e.status === 'wishlist')) return 'В ваших планах';
  return '';
}
const quizRecordKey = (mode, format, set) => `${mode}|${format}|${set}`;

function openQuiz(){
  if(quizMapActive()) return; // идёт «Где это?»
  quizState = null;
  renderQuizSetup();
  document.getElementById('quizModal').style.display = 'flex';
}
function closeQuiz(){
  if(quizState && isMapMode(quizState.mode)) quizMapStop();
  quizState = null;
  document.getElementById('quizModal').style.display = 'none';
}
function renderQuizSetup(){
  const st = quizStore();
  const sets = st.mode === 'ruregion' ? QUIZ_REGION_SETS : QUIZ_SETS;
  if(!sets.some(x => x[0] === st.set)){ st.set = sets[0][0]; quizSave(st); } // у регионов свои наборы
  const body = document.getElementById('quizBody');
  const pool = quizPool(st.mode, st.set);
  const rec = st.records[quizRecordKey(st.mode, st.format, st.set)];
  const stat = st.stats[st.mode];
  body.innerHTML = `
    <div class="quiz-label">Режим</div>
    <div class="quiz-modes">${Object.entries(QUIZ_MODES).map(([k, m]) =>
      `<button class="quiz-mode${st.mode === k ? ' active' : ''}" data-qmode="${k}"><b>${m.title}</b><span>${m.sub}</span></button>`).join('')}</div>
    <div class="quiz-label">Формат</div>
    <div class="quiz-chips">
      <div class="chip${st.format === 'round' ? ' active' : ''}" data-qformat="round">Раунд · ${QUIZ_ROUND} вопросов</div>
      <div class="chip${st.format === 'marathon' ? ' active' : ''}" data-qformat="marathon">Марафон · до первой ошибки</div>
    </div>
    <div class="quiz-label">${st.mode === 'ruregion' ? 'Регионы' : 'Страны'}</div>
    <div class="quiz-chips">${sets.map(([k, label]) => {
      const n = quizPool(st.mode, k).length;
      return `<div class="chip${st.set === k ? ' active' : ''}${n ? '' : ' disabled'}" data-qset="${k}">${escapeHtml(label)}${k === 'visited' || k === 'planned' || k === 'unvisited' ? ` · ${n}` : ''}</div>`;
    }).join('')}</div>
    <div class="quiz-record">
      ${pool.length ? `В наборе ${st.mode === 'ruregion' ? 'регионов' : 'стран'}: <b>${pool.length}</b>${st.format === 'round' && pool.length < QUIZ_ROUND ? ` — раунд будет короче` : ''}` : 'В этом наборе нет подходящих стран'}<br>
      ${rec ? (st.format === 'round' ? `Рекорд: <b>${rec.best} из ${rec.total}</b> · ${new Date(rec.at).toLocaleDateString('ru-RU')}` : `Рекорд серии: <b>${rec.best}</b> · ${new Date(rec.at).toLocaleDateString('ru-RU')}`) : 'Рекорда в этой комбинации пока нет'}
      ${stat && stat.answered ? `<br>Всего ответов в режиме: <b>${stat.answered}</b>, верно <b>${Math.round(stat.correct / stat.answered * 100)}%</b>` : ''}
    </div>
    <button class="save-btn quiz-start" id="quizStartBtn"${pool.length ? '' : ' disabled'}>Начать</button>`;
  body.querySelectorAll('[data-qmode]').forEach(b => b.addEventListener('click', ()=>{ const s2 = quizStore(); s2.mode = b.dataset.qmode; quizSave(s2); renderQuizSetup(); }));
  body.querySelectorAll('[data-qformat]').forEach(b => b.addEventListener('click', ()=>{ const s2 = quizStore(); s2.format = b.dataset.qformat; quizSave(s2); renderQuizSetup(); }));
  body.querySelectorAll('[data-qset]').forEach(b => b.addEventListener('click', ()=>{ const s2 = quizStore(); s2.set = b.dataset.qset; quizSave(s2); renderQuizSetup(); }));
  document.getElementById('quizStartBtn').addEventListener('click', ()=> quizStart());
}
function quizStart(){
  const st = quizStore();
  const pool = shuffle(quizPool(st.mode, st.set));
  if(!pool.length) return;
  quizState = {
    mode: st.mode, format: st.format, set: st.set,
    queue: st.format === 'round' ? pool.slice(0, QUIZ_ROUND) : pool,
    i: 0, correct: 0, mistakes: [], answered: false, active: true
  };
  if(isMapMode(st.mode)){ quizMapStart(); return; }
  renderQuizQuestion();
}
function quizCount(ok){
  const st = quizStore();
  const s = st.stats[quizState.mode] || { answered: 0, correct: 0 };
  s.answered++; if(ok) s.correct++;
  st.stats[quizState.mode] = s;
  quizSave(st);
}
function renderQuizQuestion(){
  const q = quizState, k = q.queue[q.i];
  q.answered = false;
  q.options = quizOptions(q.mode, k);
  const body = document.getElementById('quizBody');
  const progress = q.format === 'round' ? `Вопрос ${q.i + 1} из ${q.queue.length}` : `Марафон · вопрос ${q.i + 1}`;
  let prompt;
  if(q.mode === 'flag') prompt = `<div class="quiz-flag">${countryFlag(k)}</div><div class="quiz-q">Чей это флаг?</div>`;
  else if(q.mode === 'capital') prompt = `<div class="quiz-q">${countryFlag(k) || ''} ${escapeHtml(COUNTRY_RU[k])}</div><div class="quiz-hint">Какая столица у этой страны?</div>`;
  else prompt = `<div class="quiz-q">«${escapeHtml(quizCapital(k))}»</div><div class="quiz-hint">Столица какой страны?</div>`;
  const label = o => q.mode === 'capital' ? escapeHtml(quizCapital(o)) : escapeHtml(COUNTRY_RU[o]);
  body.innerHTML = `
    <div class="quiz-progress"><span>${progress}</span><span>верно: ${q.correct}</span></div>
    <div class="quiz-prompt">${prompt}</div>
    <div class="quiz-options">${q.options.map((o, i) => `<button class="quiz-opt" data-qopt="${i}"><kbd>${i+1}</kbd>${label(o)}</button>`).join('')}</div>
    <div class="quiz-feedback" id="quizFeedback"></div>
    <div class="quiz-actions" id="quizNext" style="display:none;"><button class="save-btn" id="quizNextBtn">Дальше →</button></div>`;
  body.querySelectorAll('[data-qopt]').forEach(b => b.addEventListener('click', ()=> quizAnswer(+b.dataset.qopt)));
}
function quizAnswer(i){
  const q = quizState;
  if(!q || q.answered || isMapMode(q.mode)) return;
  q.answered = true;
  const k = q.queue[q.i];
  const chosen = q.options[i];
  const ok = chosen === k;
  if(ok) q.correct++; else q.mistakes.push({ key: k, chosen });
  quizCount(ok);
  const btns = document.querySelectorAll('#quizBody [data-qopt]');
  btns.forEach((b, j) => { b.disabled = true; if(q.options[j] === k) b.classList.add('right'); else if(j === i) b.classList.add('wrong'); });
  const facts = [];
  if(q.mode === 'flag') facts.push(`${countryFlag(k)} ${COUNTRY_RU[k]}${quizCapital(k) ? ' · столица — ' + quizCapital(k) : ''}`);
  else facts.push(`${countryFlag(k)} ${COUNTRY_RU[k]} — ${quizCapital(k)}`);
  if(QUIZ_CAPITAL_NOTES[k] && q.mode !== 'flag') facts.push(QUIZ_CAPITAL_NOTES[k]);
  const trip = quizTravelNote(k);
  document.getElementById('quizFeedback').innerHTML =
    `<b>${ok ? '✓ Верно' : '✗ Неверно'}</b> · ${escapeHtml(facts[0])}` +
    (facts[1] ? `<br><span style="color:var(--text-dim);">${escapeHtml(facts[1])}</span>` : '') +
    (trip ? `<br><span class="quiz-trip">${escapeHtml(trip)}</span>` : '');
  const last = q.i + 1 >= q.queue.length || (q.format === 'marathon' && !ok);
  const next = document.getElementById('quizNext');
  next.style.display = 'flex';
  document.getElementById('quizNextBtn').textContent = last ? 'Итог →' : 'Дальше →';
  document.getElementById('quizNextBtn').addEventListener('click', ()=> quizNext(ok));
  document.getElementById('quizNextBtn').focus();
}
function quizNext(lastOk){
  const q = quizState;
  if(!q) return;
  const finished = q.i + 1 >= q.queue.length || (q.format === 'marathon' && !lastOk);
  if(finished){ quizFinish(); return; }
  q.i++;
  if(isMapMode(q.mode)) quizMapQuestion(); else renderQuizQuestion();
}
function quizFinish(){
  const q = quizState;
  q.active = false;
  if(isMapMode(q.mode)) quizMapStop();
  const st = quizStore();
  const key = quizRecordKey(q.mode, q.format, q.set);
  const prev = st.records[key];
  const score = q.correct;
  // в марафоне считается серия; если прошли весь набор без ошибок — тоже рекорд
  const better = !prev || score > prev.best || (q.format === 'round' && score === prev.best && q.queue.length > prev.total);
  if(better && score > 0){ st.records[key] = { best: score, total: q.queue.length, at: Date.now() }; quizSave(st); }
  const perfect = q.format === 'marathon' && score === q.queue.length;
  const label = k => q.mode === 'capital' ? quizCapital(k) : COUNTRY_RU[k];
  const body = document.getElementById('quizBody');
  body.innerHTML = `
    <div class="quiz-result">
      <div class="quiz-label">${escapeHtml(QUIZ_MODES[q.mode].title)} · ${escapeHtml(([...QUIZ_SETS, ...QUIZ_REGION_SETS].find(s => s[0] === q.set) || [null, ''])[1])}</div>
      <div class="quiz-score">${q.format === 'round' ? `${score} из ${q.queue.length}` : score}</div>
      <div>${q.format === 'round' ? 'правильных ответов' : (perfect ? 'весь набор без единой ошибки!' : 'правильных ответов подряд')}</div>
      ${better && score > 0 ? `<div class="quiz-badge">${prev ? 'Новый рекорд!' : 'Первый рекорд'}</div>` : (prev ? `<div class="quiz-record">Рекорд: <b>${prev.best}${q.format === 'round' ? ' из ' + prev.total : ''}</b></div>` : '')}
    </div>
    ${q.mistakes.length ? `<div class="quiz-label">Ошибки</div><div class="quiz-mistakes">${q.mistakes.map(m =>
      `${quizFlag(m.key)} <b>${escapeHtml(quizName(m.key))}</b>${q.mode === 'flag' || isMapMode(q.mode) ? '' : ' — ' + escapeHtml(quizCapital(m.key))}` +
      (m.chosen ? ` <span style="color:var(--text-dim);">(вы ${isMapMode(q.mode) ? 'попали' : 'ответили'}: ${escapeHtml(isMapMode(q.mode) ? m.chosen : label(m.chosen))})</span>` : '')).join('<br>')}</div>` : ''}
    <div class="quiz-actions">
      <button class="save-btn" id="quizAgainBtn">Ещё раз</button>
      <button class="cancel-edit" id="quizSetupBtn">Другой режим</button>
    </div>`;
  document.getElementById('quizModal').style.display = 'flex';
  document.getElementById('quizAgainBtn').addEventListener('click', ()=> quizStart());
  document.getElementById('quizSetupBtn').addEventListener('click', ()=>{ quizState = null; renderQuizSetup(); });
}

// ---- «Где это?» ----
let quizMarks = null, quizPrevBasemap = null, quizViewBounds = null;
const QUIZ_SMALL_KM2 = 3000;
function quizCountryAreaKm2(k){
  const g = quizGeom(k);
  if(!g) return 0;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  let a = 0;
  polys.forEach(p => { const r = p[0]; let s = 0, lat = 0;
    for(let i = 0; i < r.length - 1; i++){ s += r[i][0] * r[i+1][1] - r[i+1][0] * r[i][1]; lat += r[i][1]; }
    a += Math.abs(s) / 2 * 111 * 111 * Math.cos((lat / Math.max(1, r.length - 1)) * Math.PI / 180); });
  return a;
}
// расстояние от точки до границы страны, км (0 — внутри)
function quizDistanceKm(latlng, k){
  const g = quizGeom(k);
  if(!g) return Infinity;
  if(pointInGeometry([latlng.lat, latlng.lng], g)) return 0;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  const cl = Math.cos(latlng.lat * Math.PI / 180);
  let best = Infinity;
  polys.forEach(p => { const r = p[0];
    for(let i = 0; i < r.length - 1; i++){
      let dx1 = r[i][0] - latlng.lng, dx2 = r[i+1][0] - latlng.lng;
      if(dx1 > 180) dx1 -= 360; if(dx1 < -180) dx1 += 360; if(dx2 > 180) dx2 -= 360; if(dx2 < -180) dx2 += 360;
      const ax = dx1 * cl, ay = r[i][1] - latlng.lat, bx = dx2 * cl, by = r[i+1][1] - latlng.lat;
      const dx = bx - ax, dy = by - ay, L2 = dx*dx + dy*dy;
      const t = L2 ? Math.max(0, Math.min(1, -(ax*dx + ay*dy) / L2)) : 0;
      best = Math.min(best, Math.hypot(ax + t*dx, ay + t*dy) * 111);
    } });
  return best;
}
function quizMapActive(){ return !!(quizState && isMapMode(quizState.mode) && quizState.active); }
// допуск: страны — 30 км, маленькие (< 3000 км²) — 150 км; регионы — 20 км,
// маленькие (Москва, Петербург, Ингушетия) — 60 км
function quizTolerance(k){
  const a = quizCountryAreaKm2(k);
  if(quizIsRegion()) return a < 5000 ? 60 : 20;
  return a < QUIZ_SMALL_KM2 ? 150 : 30;
}
let quizRegionOutline = null;
function quizMapStart(){
  document.getElementById('quizModal').style.display = 'none';
  mnavShow('map');
  map.closePopup();
  quizPrevBasemap = basemapMode;
  if(quizIsRegion()){
    // границы регионов — контуром, без заливки и подписей
    quizRegionOutline = L.geoJSON(RU_REGIONS_GEOJSON, { style: { className: 'quiz-base', color: '#8C8064', weight: 0.7, opacity: 0.8, fill: false }, interactive: false }).addTo(map);
  }
  if(basemapMode !== 'plain') setBasemap('plain'); // на подложке OSM подписаны названия стран
  document.getElementById('map').classList.add('quiz-clean');
  document.body.classList.add('quiz-map');
  // вид — по набору стран
  let b = null;
  if(quizIsRegion() && quizState.set === 'all') b = L.latLngBounds([[41, 19], [78, 180]]);
  else if(quizState.set !== 'world'){
    quizState.queue.forEach(k => { const cb = quizBounds(k); if(cb) b = b ? b.extend(cb) : L.latLngBounds(cb.getSouthWest(), cb.getNorthEast()); });
  }
  quizViewBounds = b && b.isValid() ? b : L.latLngBounds(WORLD_VIEW_BOUNDS);
  quizMarks = L.layerGroup().addTo(map);
  quizMapQuestion();
}
function quizMapQuestion(){
  const q = quizState, k = q.queue[q.i];
  q.answered = false;
  quizMarks.clearLayers();
  map.fitBounds(quizViewBounds, { padding: [20, 20] });
  const progress = q.format === 'round' ? `${q.i + 1} из ${q.queue.length}` : `марафон · ${q.i + 1}`;
  document.getElementById('quizMapPanel').innerHTML = `
    <div class="quiz-progress" style="margin:0 0 4px;"><span>${progress}</span><span>верно: ${q.correct}</span></div>
    <div class="quiz-q">Где ${quizFlag(k)} ${escapeHtml(quizName(k))}?</div>
    <div class="quiz-hint">Нажмите на карту${(!quizIsRegion() && quizTolerance(k) > 30) ? ' · маленькая страна: засчитывается в радиусе 150 км' : (quizIsRegion() && quizTolerance(k) > 20 ? ' · маленький регион: засчитывается в радиусе 60 км' : '')}</div>
    <div class="quiz-feedback" id="quizMapFeedback"></div>
    <div class="quiz-actions">
      <button class="cancel-edit" id="quizMapSkip">Не знаю</button>
      <button class="cancel-edit" id="quizMapExit">Выйти</button>
    </div>`;
  document.getElementById('quizMapPanel').style.display = 'block';
  document.getElementById('quizMapSkip').addEventListener('click', ()=> quizMapAnswer(null));
  document.getElementById('quizMapExit').addEventListener('click', ()=>{ quizMapStop(); quizState = null; toast('Квиз прерван'); });
}
function quizMapAnswer(latlng){
  const q = quizState;
  if(!q || q.answered) return;
  q.answered = true;
  const k = q.queue[q.i];
  const tol = quizTolerance(k);
  const dist = latlng ? quizDistanceKm(latlng, k) : Infinity;
  const ok = dist <= tol;
  let hitName = null;
  if(latlng && quizIsRegion()){
    const r = regionAt(latlng.lat, latlng.lng);
    const c = r ? null : findCountryFeature(latlng);
    hitName = r ? r.name : c ? (COUNTRY_RU[c.properties.name] || c.properties.name) : 'море';
  } else if(latlng){
    const hit = findCountryFeature(latlng);
    hitName = hit ? (COUNTRY_RU[hit.properties.name] || hit.properties.name) : 'море';
  }
  if(ok) q.correct++; else q.mistakes.push({ key: k, chosen: hitName || 'пропуск' });
  quizCount(ok);
  const geom = quizGeom(k);
  if(geom) L.geoJSON(geom, { style: { className: 'quiz-mark', color: '#A6592E', weight: 2, fillColor: '#D2691E', fillOpacity: 0.45 }, interactive: false }).addTo(quizMarks);
  if(latlng) L.circleMarker(latlng, { className: 'quiz-mark', radius: 6, color: ok ? '#3F5240' : '#9C3B2E', weight: 2, fillColor: '#fff', fillOpacity: 1, interactive: false }).addTo(quizMarks);
  const cb = quizBounds(k);
  if(cb){
    const view = latlng && !ok ? cb.extend(latlng) : cb;
    map.flyToBounds(view, { padding: [60, 60], maxZoom: 6, duration: 0.6 });
  }
  const trip = quizTravelNote(k);
  const kmText = d => d >= 1000 ? `${(d/1000).toFixed(1).replace('.', ',')} тыс. км` : `${Math.round(d)} км`;
  document.getElementById('quizMapFeedback').innerHTML =
    (ok ? `<b>✓ Верно</b>` : latlng ? `<b>✗ Мимо</b> · это ${escapeHtml(hitName)}, до цели ${kmText(dist)}` : `<b>Вот где</b>`) +
    (trip ? `<br><span class="quiz-trip">${escapeHtml(trip)}</span>` : '');
  const last = q.i + 1 >= q.queue.length || (q.format === 'marathon' && !ok);
  const acts = document.querySelector('#quizMapPanel .quiz-actions');
  acts.innerHTML = `<button class="save-btn" id="quizMapNext">${last ? 'Итог →' : 'Дальше →'}</button><button class="cancel-edit" id="quizMapExit2">Выйти</button>`;
  document.getElementById('quizMapNext').addEventListener('click', ()=> quizNext(ok));
  document.getElementById('quizMapExit2').addEventListener('click', ()=>{ quizMapStop(); quizState = null; });
}
function quizMapStop(){
  document.getElementById('quizMapPanel').style.display = 'none';
  document.getElementById('map').classList.remove('quiz-clean');
  document.body.classList.remove('quiz-map');
  scheduleMapLabels();
  if(quizMarks){ map.removeLayer(quizMarks); quizMarks = null; }
  if(quizRegionOutline){ map.removeLayer(quizRegionOutline); quizRegionOutline = null; }
  if(quizPrevBasemap && quizPrevBasemap !== basemapMode) setBasemap(quizPrevBasemap);
  quizPrevBasemap = null;
  if(quizState) quizState.active = false;
}

document.getElementById('openQuizBtn').addEventListener('click', openQuiz);
document.getElementById('closeQuizModal').addEventListener('click', closeQuiz);
document.getElementById('quizModal').addEventListener('click', e => { if(e.target.id === 'quizModal') closeQuiz(); });
document.addEventListener('keydown', e => {
  if(!quizState) return;
  const inModal = document.getElementById('quizModal').style.display !== 'none';
  if(e.key === 'Escape'){ if(quizMapActive()){ quizMapStop(); quizState = null; } return; }
  if(!inModal || isMapMode(quizState.mode)) return;
  if(!quizState.answered && /^[1-4]$/.test(e.key)){ e.preventDefault(); quizAnswer(+e.key - 1); }
});

