// ---------- моря и океаны ----------
// Море «посещено», если город или остановка маршрута — не дальше 20 км от его
// берега (по контурам Natural Earth, src/data/sea_shapes.txt). Залив и пролив
// засчитываются своему морю (Финский залив → Балтийское), часть Средиземного
// моря — и сама, и Средиземное. Визит — море в одной поездке (или в одном
// месяце): пять приморских остановок одного автотрипа — один визит.
const SEA_COAST_KM = 20;
const SEAS_RU = ['Балтийское море', 'Баренцево море', 'Белое море', 'Карское море', 'море Лаптевых', 'Восточно-Сибирское море', 'Чукотское море',
  'Берингово море', 'Охотское море', 'Японское море', 'Чёрное море', 'Азовское море', 'Каспийское море'];
const OCEANS = ['Тихий океан', 'Атлантический океан', 'Индийский океан', 'Северный Ледовитый океан', 'Южный океан'];
let seaShapesCache = null;
const seaPointCache = new Map();
// номер водоёма (строка seas.json) у точки или -1; контуры разбираются при первом обращении
function seaRowAt(lat, lng){
  if(lat == null || lng == null || !Number.isFinite(+lat) || !Number.isFinite(+lng)) return -1;
  const key = Math.round(lat * 100) + ',' + Math.round(lng * 100);
  let r = seaPointCache.get(key);
  if(r === undefined){
    if(!seaShapesCache) seaShapesCache = parseSeaShapes(SEA_SHAPES_TXT);
    const hit = seaNear(seaShapesCache, +lat, +lng, SEA_COAST_KM);
    r = hit ? hit.i : -1;
    seaPointCache.set(key, r);
  }
  return r;
}
const seaKindOf = name => OCEANS.includes(name) ? 'ocean' : 'sea';
// водоёмы, где побывал: { units: Map(название → {name, kind, basin, visits, first, cities, parts}), leaves: Set }
// leaves — названия самих заливов/проливов/морей (для подписей на карте)
function computeSeaStats(entries, opts = {}){
  const visits = uniqueCityVisits(getAllCityVisits(entries.filter(e => e.status !== 'wishlist')));
  const units = new Map(), leaves = new Set(), seen = new Set();
  const home = HOME_CITY_NAME.toLowerCase();
  visits.forEach(v => {
    const row = seaRowAt(v.lat, v.lng);
    if(row < 0) return;
    leaves.add(SEAS[row][0]);
    const names = seaUnits(SEAS, row);
    names.forEach((name, k) => {
      let u = units.get(name);
      if(!u){
        // у Средиземного (засчитанного через часть) океан — тот же, что у части
        u = { name, kind: seaKindOf(name), basin: seaBasin(SEAS, row), visits: 0, first: null, cities: new Map(), parts: new Set() };
        units.set(name, u);
      }
      if(SEAS[row][0] !== name && !k) u.parts.add(SEAS[row][0]);
      if(k) u.parts.add(names[k - 1]);
      const city = (v.name || '').trim();
      if(city) u.cities.set(city, (u.cities.get(city) || 0) + 1);
      const when = (v.year || 0) * 12 + (v.month || 0);
      if(v.year && (!u.first || when < u.first.at)) u.first = { at: when, year: v.year, month: v.month || null, city };
      // визит — поездка (или месяц) на этом море; дом визитом не считается
      if(opts.countHome || city.toLowerCase() !== home){
        const vk = name + '|' + (v.year || '') + '|' + (v.trip ? 't' + v.trip : v.month ? 'm' + v.month : 'c' + city.toLowerCase());
        if(!seen.has(vk)){ seen.add(vk); u.visits++; }
      }
    });
  });
  return { units, leaves };
}
function seaSummary(st){
  const list = [...st.units.values()];
  return { seas: list.filter(u => u.kind === 'sea'), oceans: list.filter(u => u.kind === 'ocean'),
    basins: new Set(list.map(u => u.kind === 'ocean' ? u.name : u.basin).filter(Boolean)) };
}
const seasWord = n => { const t = n % 10, h = n % 100; return h >= 11 && h <= 14 ? 'морей' : t === 1 ? 'море' : t >= 2 && t <= 4 ? 'моря' : 'морей'; };
const oceansWord = n => { const t = n % 10, h = n % 100; return h >= 11 && h <= 14 ? 'океанов' : t === 1 ? 'океан' : t >= 2 && t <= 4 ? 'океана' : 'океанов'; };

// Раздел «Моря и океаны» в статистике (с учётом фильтров)
function renderSeaStats(visited){
  const box = document.getElementById('seaStats');
  if(!box) return;
  const st = computeSeaStats(visited), { seas, oceans, basins } = seaSummary(st);
  const setText = (id, t) => { const el = document.getElementById(id); if(el) el.textContent = t; };
  setText('statSeasF', seas.length);
  setText('statOceansF', oceans.length ? `${oceans.length} из 5` : '0');
  if(!st.units.size){
    box.innerHTML = `<div class="hint">Пока ни одного моря: город засчитывается морю, если до берега не больше ${SEA_COAST_KM} км.</div>`;
    return;
  }
  const top = [...st.units.values()].filter(u => u.visits > 0).sort((a, b) => b.visits - a.visits || a.name.localeCompare(b.name, 'ru')).slice(0, 5);
  const ru = SEAS_RU.filter(n => st.units.has(n)).length, pct = Math.round(ru / SEAS_RU.length * 100);
  const cityList = u => [...u.cities.entries()].sort((a, b) => b[1] - a[1]).map(c => c[0]);
  // моря по океанам — от того, где больше морей
  const groups = new Map();
  [...st.units.values()].forEach(u => { const b = u.kind === 'ocean' ? u.name : (u.basin || 'Внутренние'); if(!groups.has(b)) groups.set(b, []); groups.get(b).push(u); });
  const groupHtml = [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'ru')).map(([b, list]) =>
    `<div class="sea-group"><div class="sea-group-title">${escapeHtml(b === 'Внутренние' ? 'Внутренние моря' : b)}</div>` +
    list.sort((a, b) => (a.kind === 'ocean') - (b.kind === 'ocean') || (a.first ? a.first.at : 1e9) - (b.first ? b.first.at : 1e9)).map(u => {
      const cs = cityList(u), more = cs.length > 4 ? ` и ещё ${cs.length - 4}` : '';
      return `<div class="sea-row"><span class="sea-name">${escapeHtml(u.kind === 'ocean' ? 'побережье океана' : u.name)}</span>` +
        `<small>${escapeHtml([u.first && u.first.year ? 'с ' + u.first.year : '', cs.slice(0, 4).join(', ') + more, u.parts.size ? 'в т. ч. ' + [...u.parts].join(', ') : ''].filter(Boolean).join(' · '))}</small></div>`;
    }).join('') + `</div>`).join('');
  box.innerHTML = `<div class="sea-summary"><b>${seas.length}</b> ${seasWord(seas.length)} · <b>${oceans.length}</b> ${oceansWord(oceans.length)} на берегу` +
      (basins.size ? ` · в бассейн${basins.size === 1 ? "е" : "ах"} ${basins.size} ${basins.size === 1 ? "океана" : "океанов"}` : '') + `</div>
    <div class="continent-row" title="${escapeAttr(SEAS_RU.join(', '))}">
      <div class="continent-name">Моря России</div>
      <div class="continent-bar-track"><div class="continent-bar-fill" style="width:${pct}%;"></div></div>
      <div class="continent-pct">${ru}/${SEAS_RU.length}</div>
    </div>
    <p class="section-title" style="margin-top:12px;">Топ-5 морей и океанов по визитам</p>
    <div class="top-list" id="topSeasList"></div>
    <details class="sea-all"><summary>Все моря по океанам</summary>${groupHtml}
      <div class="hint">Город засчитывается морю, если до берега не больше ${SEA_COAST_KM} км; залив — своему морю. Моря, где вы были, на «Контурах» подписаны жирнее.</div></details>`;
  renderTopList('topSeasList', top.map(u => [u.name, u.visits]));
}

// Для подписей на карте и глобусе: какие водоёмы уже «свои» (по всем данным);
// пересчёт — после любой правки данных (rebuildAll)
let seaVisitedCache = null;
function seaVisitedNames(){
  if(!seaVisitedCache){
    const st = computeSeaStats(allEntries, { countHome: true });
    seaVisitedCache = new Set([...st.units.keys(), ...st.leaves]);
  }
  return seaVisitedCache;
}
function invalidateSeaVisited(){ seaVisitedCache = null; }
