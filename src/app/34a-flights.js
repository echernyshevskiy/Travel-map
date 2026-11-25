// ---------- журнал перелётов ----------
// Перелёт — маршрут с занятием «перелёт» (isFlight): так он сам попадает в
// поездки, список, фильтры, синхронизацию, резервные копии и версию для друзей.
// Отличия от обычного маршрута: точки — аэропорты (коды IATA в entry.airports),
// линия — дуга большого круга, километры считаются отдельно («в воздухе») и не
// складываются с пройденными; треки перелётов не «исследуют» клетки и регионы.
// Справочник аэропортов — data/airports.txt (scripts/build-airports.mjs, данные
// OurAirports), грузится при первом поиске аэропорта.

let airportsList = null,
  airportsByCode = null,
  airportsLoading = null;
function loadAirports() {
  if (airportsList) return Promise.resolve(airportsList);
  if (!airportsLoading)
    airportsLoading = fetch('data/airports.txt')
      .then(r => {
        if (!r.ok) throw new Error('справочник аэропортов: ' + r.status);
        return r.text();
      })
      .then(txt => {
        airportsList = txt
          .split('\n')
          .filter(Boolean)
          .map(line => {
            const [code, lat, lng, countryKey, city, name, size] = line.split('|');
            return {
              // крупный (L) — 0, средний (M) — 1, малый — 2: крупные выше в подсказках
              rank: size === 'L' ? 0 : size === 'M' ? 1 : 2,
              code,
              lat: +lat,
              lng: +lng,
              countryKey: countryKey || null,
              city: city || name,
              name,
              lc: normSearch(city || ''),
              ln: normSearch(name || '')
            };
          });
        airportsByCode = new Map(airportsList.map(a => [a.code, a]));
        // сколько аэропортов у города: у крупного (Москва, Токио) их несколько — он выше в подсказках
        const perCity = {};
        airportsList.forEach(a => (perCity[a.lc + '|' + a.countryKey] = (perCity[a.lc + '|' + a.countryKey] || 0) + 1));
        airportsList.forEach(a => (a.cityAirports = perCity[a.lc + '|' + a.countryKey]));
        return airportsList;
      })
      .catch(err => {
        airportsLoading = null;
        throw err;
      });
  return airportsLoading;
}
// код IATA — первым; потом город с начала названия; потом название аэропорта
function searchAirports(q, limit = 8) {
  if (!airportsList) return [];
  const raw = String(q || '').trim();
  const n = normSearch(raw);
  if (!n) return [];
  const code = raw.toUpperCase();
  const exact = /^[A-Z]{3}$/.test(code) && airportsByCode.get(code);
  const byCode = /^[A-Za-z]{1,3}$/.test(raw) ? airportsList.filter(a => a.code.startsWith(code) && a !== exact) : [];
  // точное название города — выше начала названия; город с несколькими аэропортами
  // (Москва, Токио) — выше города с одним; крупный аэропорт — выше малого
  const order = (a, b) =>
    (a.lc === n ? 0 : 1) - (b.lc === n ? 0 : 1) || Math.min(b.cityAirports, 3) - Math.min(a.cityAirports, 3) || a.rank - b.rank || a.code.localeCompare(b.code);
  const byCity = airportsList.filter(a => a.lc.startsWith(n)).sort(order);
  const byName = n.length >= 3 ? airportsList.filter(a => a.ln.includes(n) && !a.lc.startsWith(n)).sort(order) : [];
  return [...new Set([exact, ...byCode, ...byCity, ...byName].filter(Boolean))].slice(0, limit);
}
const airportLabel = a => `${a.code} · ${a.city}${a.countryKey && COUNTRY_RU[a.countryKey] ? ', ' + COUNTRY_RU[a.countryKey] : ''}`;

// выбранные в форме аэропорты
const flightPick = { from: null, to: null };
function setupAirportField(side) {
  const input = document.getElementById(side === 'from' ? 'flightFromSearch' : 'flightToSearch');
  const box = document.getElementById(side === 'from' ? 'flightFromSuggest' : 'flightToSuggest');
  let matches = [],
    hl = -1;
  const render = () => {
    box.innerHTML = '';
    if (!matches.length) {
      box.innerHTML = `<div class="suggest-empty">${airportsList ? 'Аэропорт не найден — попробуйте код (SVO) или город по-английски' : 'Загружаю справочник аэропортов…'}</div>`;
    }
    matches.forEach((a, i) => {
      const el = document.createElement('div');
      el.className = 'suggest-item' + (i === hl ? ' active' : '');
      el.dataset.airport = a.code;
      const b = document.createElement('b');
      b.textContent = a.code;
      el.append(b, ` ${a.city}`);
      const small = document.createElement('small');
      small.className = 'u-dim';
      small.textContent = ` — ${a.name}${a.countryKey && COUNTRY_RU[a.countryKey] ? ', ' + COUNTRY_RU[a.countryKey] : ''}`;
      el.appendChild(small);
      el.addEventListener('mousedown', e => {
        e.preventDefault();
        pick(a);
      });
      box.appendChild(el);
    });
    box.style.display = 'block';
  };
  const pick = a => {
    flightPick[side] = a;
    input.value = '';
    box.style.display = 'none';
    renderFlightPicked();
  };
  const update = async () => {
    const q = input.value.trim();
    if (!q) {
      box.style.display = 'none';
      return;
    }
    if (!airportsList) {
      matches = [];
      render();
      try {
        await loadAirports();
      } catch (err) {
        logError('справочник аэропортов', err);
        box.innerHTML = '<div class="suggest-empty">Справочник аэропортов не загрузился — проверьте сеть</div>';
        return;
      }
      if (input.value.trim() !== q) return;
    }
    matches = searchAirports(q);
    hl = matches.length ? 0 : -1;
    render();
  };
  input.addEventListener('input', update);
  input.addEventListener('keydown', e => {
    if (box.style.display === 'none' || !matches.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      hl = (hl + (e.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length;
      render();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (matches[hl]) pick(matches[hl]);
    } else if (e.key === 'Escape') box.style.display = 'none';
  });
  input.addEventListener('blur', () => setTimeout(() => (box.style.display = 'none'), 150));
}
function renderFlightPicked() {
  ['from', 'to'].forEach(side => {
    const el = document.getElementById(side === 'from' ? 'flightFromPicked' : 'flightToPicked');
    const a = flightPick[side];
    el.textContent = '';
    if (!a) return;
    const tag = document.createElement('span');
    tag.className = 'flight-tag';
    tag.textContent = '✈ ' + airportLabel(a);
    const x = document.createElement('button');
    x.type = 'button';
    x.textContent = '✕';
    x.title = 'Убрать';
    x.setAttribute('aria-label', 'Убрать аэропорт');
    x.addEventListener('click', () => {
      flightPick[side] = null;
      renderFlightPicked();
    });
    tag.appendChild(x);
    el.appendChild(tag);
  });
  const hint = document.getElementById('flightHint');
  if (flightPick.from && flightPick.to) {
    const km = haversine([flightPick.from.lat, flightPick.from.lng], [flightPick.to.lat, flightPick.to.lng]);
    hint.textContent = `≈ ${Math.round(km).toLocaleString('ru-RU')} км по дуге большого круга. С пересадкой — отдельной записью на каждый перелёт.`;
  } else hint.textContent = 'С пересадкой — отдельной записью на каждый перелёт. Название по умолчанию — «Город — Город».';
}
function resetFlightForm() {
  flightPick.from = flightPick.to = null;
  ['flightFromSearch', 'flightToSearch', 'fieldFlightNo'].forEach(id => (document.getElementById(id).value = ''));
  renderFlightPicked();
}
setupAirportField('from');
setupAirportField('to');

// новая запись-перелёт из формы; общие поля (год, поездка, фото…) — из saveEntry
function buildFlightEntry(common) {
  const a = flightPick.from,
    b = flightPick.to;
  if (!a || !b) return { error: 'Выберите аэропорты «Откуда» и «Куда»' };
  if (a.code === b.code) return { error: 'Аэропорты «Откуда» и «Куда» совпадают' };
  const coords = greatCircle([a.lat, a.lng], [b.lat, b.lng], 64);
  const flightNo = document.getElementById('fieldFlightNo').value.trim().replace(/\s+/g, ' ').slice(0, 16);
  const entry = Object.assign({}, common, {
    id: genId(),
    type: 'route',
    activity: 'flight',
    name: common.name || `${a.city} — ${b.city}`,
    status: 'visited',
    coordsEncoded: encodePolyline(coords),
    distanceKm: +haversine([a.lat, a.lng], [b.lat, b.lng]).toFixed(1),
    elevationGain: null,
    maxElevation: null,
    durationMin: null,
    profile: null,
    airports: [a.code, b.code],
    waypointNames: [a.city, b.city],
    waypointCoords: [
      [a.lat, a.lng],
      [b.lat, b.lng]
    ],
    waypointCountryKeys: [a.countryKey, b.countryKey],
    isEstimated: false
  });
  if (flightNo) entry.flightNo = flightNo;
  return { entry };
}

// показать поля перелёта вместо источника маршрута (GPX / по городам)
function updateFlightFieldsVisibility() {
  const flight = document.getElementById('fieldActivity').value === 'flight';
  const editing = typeof editingId !== 'undefined' && editingId;
  document.getElementById('flightFields').style.display = flight ? 'block' : 'none';
  // при правке выбрать другие аэропорты нельзя (линия не перестраивается) — только номер рейса
  ['flightFromSearch', 'flightToSearch'].forEach(id => (document.getElementById(id).closest('.search-wrap').style.display = flight && editing ? 'none' : ''));
  document
    .querySelectorAll('#flightFields label[for="flightFromSearch"], #flightFields label[for="flightToSearch"]')
    .forEach(l => (l.style.display = flight && editing ? 'none' : ''));
  if (!editing) document.getElementById('routeSourceBlock').style.display = flight ? 'none' : '';
}
document.getElementById('fieldActivity').addEventListener('change', updateFlightFieldsVisibility);

// статистика перелётов: сколько, километров, аэропортов, самый длинный, самый частый
function flightStats(visited) {
  const flights = visited.filter(isFlight);
  const km = flights.reduce((s, f) => s + (f.distanceKm || 0), 0);
  const airports = new Set(flights.flatMap(f => f.airports || []));
  const longest = flights.slice().sort((a, b) => (b.distanceKm || 0) - (a.distanceKm || 0))[0] || null;
  const pairs = {};
  flights.forEach(f => {
    if (!f.airports || f.airports.length < 2) return;
    const k = [f.airports[0], f.airports[f.airports.length - 1]].sort().join(' ↔ ');
    pairs[k] = (pairs[k] || 0) + 1;
  });
  const top = Object.entries(pairs).sort((a, b) => b[1] - a[1])[0] || null;
  return { count: flights.length, km, airports: airports.size, longest, top: top && top[1] > 1 ? { pair: top[0], n: top[1] } : null };
}
function renderFlightStats(visited) {
  const s = flightStats(visited);
  const rows = document.getElementById('flightStatsRows');
  if (!rows) return;
  rows.hidden = !s.count;
  if (!s.count) return;
  document.getElementById('statFlightsF').textContent = s.count;
  // окружность Земли — 40 075 км
  const laps = s.km / 40075;
  document.getElementById('statFlightKmF').textContent =
    `${Math.round(s.km).toLocaleString('ru-RU')} км` + (laps >= 0.5 ? ` · ${laps.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} вокруг Земли` : '');
  document.getElementById('statAirportsF').textContent = s.airports;
  document.getElementById('statLongestFlightF').textContent = s.longest
    ? `${s.longest.name} · ${Math.round(s.longest.distanceKm).toLocaleString('ru-RU')} км`
    : '—';
  document.getElementById('statTopFlightF').textContent = s.top ? `${s.top.pair} · ${s.top.n} раз` : '—';
}
