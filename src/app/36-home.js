function renderHomeRegion() {
  const geom = getCountryGeometry(HOME_COUNTRY_KEY);
  if (!geom) return;
  const layer = (homeRegionLayer = L.geoJSON(geom, {
    style: { color: HOME_COLOR, weight: 1.5, fillColor: HOME_COLOR, fillOpacity: 0.1, dashArray: '2,5' },
    interactive: true
  }).addTo(map));
  // Домашний регион раньше показывал только справку: ни добавить город, ни
  // узнать, что здесь. Но по своей стране тоже ездят и открывают новые места.
  layer.on('click', ev => {
    L.DomEvent.stopPropagation(ev);
    if (placingCity || placingCountry || quizMapActive()) {
      handleMapClick(ev);
      return;
    }
    openCountryPopup(HOME_COUNTRY_KEY, ev.latlng);
  });

  const homeIcon = L.divIcon({
    className: '',
    html: `<div class="home-marker">🏠</div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  });
  L.marker([HOME_LOCATION.lat, HOME_LOCATION.lng], { icon: homeIcon, zIndexOffset: -1000 })
    .addTo(map)
    .bindPopup(
      `<div style="font-family:'Twemoji Country Flags','EB Garamond',serif;"><b>🏠 ${escapeHtml(HOME_LOCATION.name)}</b><br><span class="u-dim">Точка отсчёта для «самой дальней точки» в статистике.</span></div>`
    )
    .on('click', L.DomEvent.stopPropagation);
}

// ---------- настройка «Дом» (B6) ----------
// Город выбирается из встроенного справочника (без сети); страна и часовой пояс
// берутся из него же. Хранится на этом устройстве (travel-map-home). После
// выбора приложение перезапускается: дом влияет на статистику, карточки стран,
// глобус, квиз и импорт — проще пересчитать всё с нуля, чем каждое по отдельности.
function saveHomeSetting(home) {
  if (home) prefSet(HOME_SETTING_KEY, JSON.stringify(home));
  else prefRemove(HOME_SETTING_KEY);
  location.reload();
}
(function setupHomeSection() {
  const cur = document.getElementById('homeCurrent');
  const statHome = document.getElementById('statHomeF');
  if (statHome) statHome.textContent = HOME_LOCATION.name;
  const section = document.getElementById('homeSection');
  if (!cur || !section) return;
  // у друзей дом не настраивается: там всегда точка по умолчанию
  if (READ_ONLY) {
    section.remove();
    return;
  }
  cur.textContent = HOME_LOCATION.name;
  const btn = document.getElementById('homeChangeBtn'),
    editor = document.getElementById('homeEditor'),
    input = document.getElementById('homeSearch'),
    box = document.getElementById('homeSuggest'),
    reset = document.getElementById('homeResetBtn');
  const isDefault = HOME_SETTING === HOME_DEFAULT;
  reset.hidden = isDefault;
  let found = [];
  btn.addEventListener('click', () => {
    editor.hidden = !editor.hidden;
    btn.setAttribute('aria-expanded', String(!editor.hidden));
    if (!editor.hidden) input.focus();
  });
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', 'homeEditor');
  input.addEventListener('input', () => {
    found = localCitySearch(input.value, 8, [HOME_LOCATION.lat, HOME_LOCATION.lng]).filter(c => c.countryKey && COUNTRY_RU[c.countryKey]);
    if (!found.length) {
      box.style.display = 'none';
      box.innerHTML = '';
      return;
    }
    box.innerHTML = found
      .map(
        (c, i) =>
          `<div class="suggest-item ws-item" role="option" tabindex="-1" data-home-i="${i}">${countryFlag(c.countryKey) || '📍'} ${escapeHtml(c.name)}<span class="ws-sub">${escapeHtml([c.region, COUNTRY_RU[c.countryKey]].filter(Boolean).join(', '))}</span></div>`
      )
      .join('');
    box.style.display = 'block';
  });
  const pick = i => {
    const c = found[i];
    if (!c) return;
    const name = `${c.name}, ${COUNTRY_RU[c.countryKey]}`;
    saveHomeSetting({ name, lat: c.lat, lng: c.lng, countryKey: c.countryKey });
  };
  box.addEventListener('click', ev => {
    const it = ev.target.closest('[data-home-i]');
    if (it) pick(+it.dataset.homeI);
  });
  input.addEventListener('keydown', ev => {
    if (ev.key === 'Enter' && found.length) {
      ev.preventDefault();
      pick(0);
    }
  });
  reset.addEventListener('click', () => saveHomeSetting(null));
})();
