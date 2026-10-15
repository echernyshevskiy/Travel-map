function renderHomeRegion(){
  const geom = getCountryGeometry(HOME_COUNTRY_KEY);
  if(!geom) return;
  const layer = homeRegionLayer = L.geoJSON(geom, {
    style: { color: HOME_COLOR, weight: 1.5, fillColor: HOME_COLOR, fillOpacity: 0.10, dashArray: '2,5' },
    interactive: true
  }).addTo(map);
  // Домашний регион раньше показывал только справку: ни добавить город, ни
  // узнать, что здесь. Но по своей стране тоже ездят и открывают новые места.
  layer.on('click', (ev)=>{
    L.DomEvent.stopPropagation(ev);
    if(placingCity || placingCountry || quizMapActive()){ handleMapClick(ev); return; }
    openCountryPopup(HOME_COUNTRY_KEY, ev.latlng);
  });

  const homeIcon = L.divIcon({
    className: '',
    html: `<div style="font-size:18px;line-height:18px;">🏠</div>`,
    iconSize: [18,18],
    iconAnchor: [9,9]
  });
  L.marker([HOME_LOCATION.lat, HOME_LOCATION.lng], {icon: homeIcon, zIndexOffset: -1000})
    .addTo(map)
    .bindPopup(`<div style="font-family:'Twemoji Country Flags','EB Garamond',serif;"><b>🏠 ${escapeHtml(HOME_LOCATION.name)}</b><br><span style="color:var(--text-dim);">Точка отсчёта для «самой дальней точки» в статистике.</span></div>`)
    .on('click', L.DomEvent.stopPropagation);
}

