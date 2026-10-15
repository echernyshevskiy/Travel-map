// ---------- PNG snapshot export (map + stats, hand-projected, no tile images) ----------
document.getElementById('exportSnapshotBtn').addEventListener('click', async ()=>{
  if(allEntries.length === 0){ toast('Пока нечего сохранять в снимок'); return; }
  try{
    await exportSnapshot();
  }catch(err){
    toast('Не удалось создать снимок');
  }
});

function makeProjector(bounds, x0, y0, x1, y1){
  const w = x1-x0, h = y1-y0;
  const lngRange = (bounds.maxLng - bounds.minLng) || 1;
  const latRange = (bounds.maxLat - bounds.minLat) || 1;
  const scale = Math.min(w/lngRange, h/latRange);
  const usedW = lngRange*scale, usedH = latRange*scale;
  const offX = x0 + (w-usedW)/2;
  const offY = y0 + (h-usedH)/2;
  return (lat, lng) => [offX + (lng-bounds.minLng)*scale, offY + (bounds.maxLat-lat)*scale];
}

function niceStep(range){
  if(range <= 2) return 0.5;
  if(range <= 10) return 2;
  if(range <= 40) return 10;
  if(range <= 100) return 20;
  return 30;
}

function drawGraticule(ctx, bounds, proj){
  ctx.save();
  ctx.strokeStyle = 'rgba(43,59,46,0.09)';
  ctx.lineWidth = 1;
  const latStep = niceStep(bounds.maxLat - bounds.minLat);
  const lngStep = niceStep(bounds.maxLng - bounds.minLng);
  for(let lat = Math.ceil(bounds.minLat/latStep)*latStep; lat <= bounds.maxLat; lat += latStep){
    const [x0,y0] = proj(lat, bounds.minLng);
    const [x1] = proj(lat, bounds.maxLng);
    ctx.beginPath(); ctx.moveTo(x0,y0); ctx.lineTo(x1,y0); ctx.stroke();
  }
  for(let lng = Math.ceil(bounds.minLng/lngStep)*lngStep; lng <= bounds.maxLng; lng += lngStep){
    const [x0,y0] = proj(bounds.maxLat, lng);
    const [,y1] = proj(bounds.minLat, lng);
    ctx.beginPath(); ctx.moveTo(x0,y0); ctx.lineTo(x0,y1); ctx.stroke();
  }
  ctx.restore();
}

function traceRing(ctx, ring, proj){
  let prevLng = null;
  ring.forEach((c,i)=>{
    const [x,y] = proj(c[1], c[0]);
    // разрыв контура вместо линии через всю карту — иначе страна, чьи границы
    // пересекают линию перемены дат (Россия), рисуется с уродливой прямой
    // чертой через всю карту, соединяющей крайний восток с крайним западом
    if(i === 0 || (prevLng !== null && Math.abs(c[0]-prevLng) > 180)){
      ctx.moveTo(x,y);
    } else {
      ctx.lineTo(x,y);
    }
    prevLng = c[0];
  });
  ctx.closePath();
}

function drawCountryGeometry(ctx, geometry, proj, color, isWishlist){
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  polys.forEach(poly=>{
    ctx.beginPath();
    poly.forEach(ring => traceRing(ctx, ring, proj));
    if(isWishlist){
      ctx.save();
      ctx.setLineDash([4,4]);
      ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.restore();
    } else {
      ctx.save();
      ctx.globalAlpha = 0.35; ctx.fillStyle = color; ctx.fill();
      ctx.globalAlpha = 1; ctx.strokeStyle = color; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.restore();
    }
  });
}

function drawCompassRose(ctx, cx, cy){
  const r = 26;
  ctx.save();
  ctx.strokeStyle = '#2B3B2E'; ctx.globalAlpha = 0.6; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx-r,cy); ctx.lineTo(cx+r,cy); ctx.moveTo(cx,cy-r); ctx.lineTo(cx,cy+r); ctx.stroke();
  ctx.globalAlpha = 1; ctx.fillStyle = '#2B3B2E';
  ctx.font = "italic 700 13px 'Twemoji Country Flags','Playfair Display'";
  ctx.textAlign = 'center';
  ctx.fillText('N', cx, cy-r-8);
  ctx.restore();
}

function drawLegend(ctx, x, y){
  ctx.save();
  ctx.fillStyle = 'rgba(231,223,199,0.95)';
  ctx.strokeStyle = '#C4B78F'; ctx.lineWidth = 1;
  ctx.fillRect(x, y, 186, 92);
  ctx.strokeRect(x, y, 186, 92);
  ctx.font = "12px 'Twemoji Country Flags','Courier Prime'";
  ctx.fillStyle = '#6E6547';
  ['● страна (заливка)', '● город (точка)', '❤ любимый город', '┄ план / не посещено'].forEach((l,i)=>{
    ctx.fillText(l, x+12, y+20+i*19);
  });
  ctx.restore();
}

function drawWorldBaseOutlines(ctx, proj){
  ctx.save();
  ctx.strokeStyle = 'rgba(43,59,46,0.16)';
  ctx.lineWidth = 1;
  COUNTRIES_GEOJSON.features.forEach(f=>{
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    polys.forEach(poly=>{
      ctx.beginPath();
      poly.forEach(ring => traceRing(ctx, ring, proj));
      ctx.stroke();
    });
  });
  ctx.restore();
}

function drawHomeRegion(ctx, proj){
  const geom = getCountryGeometry(HOME_COUNTRY_KEY);
  if(!geom) return;
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  polys.forEach(poly=>{
    ctx.beginPath();
    poly.forEach(ring => traceRing(ctx, ring, proj));
    ctx.save();
    ctx.globalAlpha = 0.10; ctx.fillStyle = HOME_COLOR; ctx.fill();
    ctx.globalAlpha = 1; ctx.strokeStyle = HOME_COLOR; ctx.lineWidth = 1.5;
    ctx.setLineDash([2,5]); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
  });
}

function drawStoryStats(ctx, x, y, w, h){
  ctx.fillStyle = '#E7DFC7'; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#C4B78F'; ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+w,y); ctx.stroke();

  const countries = document.getElementById('statCountriesF').textContent;
  const cities = document.getElementById('statCitiesF').textContent;
  const worldPct = document.getElementById('statWorldPct').textContent;
  const items = [
    { value: countries, label: 'стран' },
    { value: cities, label: 'городов' },
    { value: worldPct, label: 'мира' }
  ];
  const colW = w / 3;
  ctx.font = "italic 700 20px 'Twemoji Country Flags','Playfair Display'";
  ctx.fillStyle = '#6E6547'; ctx.textAlign = 'center';
  ctx.fillText('Посещено', x+w/2, y+55);
  items.forEach((item,i)=>{
    const cx = x + colW*i + colW/2;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#2B3B2E';
    ctx.font = "italic 700 88px 'Twemoji Country Flags','Playfair Display'";
    ctx.fillText(String(item.value), cx, y+130);
    ctx.font = "23px 'Twemoji Country Flags','EB Garamond'";
    ctx.fillStyle = '#6E6547';
    ctx.fillText(item.label, cx, y+172);
  });
  ctx.strokeStyle = '#C4B78F'; ctx.lineWidth = 1;
  for(let i=1;i<3;i++){
    const dx = x + colW*i;
    ctx.beginPath(); ctx.moveTo(dx, y+30); ctx.lineTo(dx, y+160); ctx.stroke();
  }

  ctx.font = "italic 700 26px 'Twemoji Country Flags','Playfair Display'";
  ctx.fillStyle = '#2B3B2E'; ctx.textAlign = 'center';
  ctx.fillText('Карта путешествий', x+w/2, y+240);
  ctx.font = "14px 'Twemoji Country Flags','Courier Prime'";
  ctx.fillStyle = '#8A8262';
  ctx.fillText(new Date().toLocaleDateString('ru-RU'), x+w/2, y+270);
  ctx.textAlign = 'left';
}

async function exportSnapshot(){
  if(document.fonts && document.fonts.ready) await document.fonts.ready;

  const W = 1080, headerH = 110, mapH = 1250, statsH = 560;
  const H = headerH + mapH + statsH;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#E7DFC7'; ctx.fillRect(0,0,W,H);

  // header
  ctx.fillStyle = '#DED4B6'; ctx.fillRect(0,0,W,headerH);
  ctx.strokeStyle = '#C4B78F'; ctx.beginPath(); ctx.moveTo(0,headerH); ctx.lineTo(W,headerH); ctx.stroke();
  ctx.fillStyle = '#2B3B2E';
  ctx.font = "italic 700 36px 'Twemoji Country Flags','Playfair Display'";
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('Карта путешествий', W/2, 66);
  ctx.textAlign = 'left';

  // global map area (fixed world extent, not bound to current data)
  const mapY0 = headerH, mapY1 = headerH+mapH;
  ctx.fillStyle = '#DED4B6'; ctx.fillRect(0, mapY0, W, mapH);

  const worldBounds = { minLat: -58, maxLat: 78, minLng: -180, maxLng: 180 };
  const proj = makeProjector(worldBounds, 30, mapY0+30, W-30, mapY1-30);

  drawGraticule(ctx, worldBounds, proj);
  drawWorldBaseOutlines(ctx, proj);
  drawHomeRegion(ctx, proj);

  const visible = allEntries.filter(passesFilter);

  visible.filter(e => e.type === 'country').forEach(e=>{
    const geom = getCountryGeometry(e.countryKey);
    if(geom) drawCountryGeometry(ctx, geom, proj, e.color, e.status === 'wishlist');
  });

  visible.filter(e => e.type === 'route').forEach(e=>{
    ctx.beginPath();
    const brk = new Set(entryBreaks(e));
    getEntryCoords(e).forEach((c,i)=>{
      const [x,y] = proj(c[0], c[1]);
      if(i === 0 || brk.has(i)) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    });
    ctx.strokeStyle = e.color; ctx.lineWidth = 2; ctx.stroke();
  });

  const cityDots = [];
  const seenCityNames = new Set();
  getAllCityVisits(visible).forEach(c=>{
    if(c.lat == null || c.lng == null) return; // старые маршруты без сохранённых координат точек — пропускаем
    const key = c.name.trim().toLowerCase();
    if(seenCityNames.has(key)) return; // один и тот же город не рисуем дважды, даже если это и отдельная запись, и точка маршрута
    seenCityNames.add(key);
    cityDots.push(c);
  });
  cityDots.forEach(e=>{
    const [x,y] = proj(e.lat, e.lng);
    if(e.favorite){
      ctx.font = '11px sans-serif'; ctx.fillStyle = e.color; ctx.textAlign = 'center';
      ctx.fillText('❤', x, y+4);
      ctx.textAlign = 'left';
    } else if(e.status === 'wishlist'){
      ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2);
      ctx.setLineDash([2,2]); ctx.strokeStyle = e.color; ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);
    } else {
      ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2);
      ctx.fillStyle = e.color; ctx.fill();
      ctx.strokeStyle = '#2B3B2E'; ctx.lineWidth = 0.75; ctx.stroke();
    }
  });

  drawCompassRose(ctx, 70, mapY0+70);
  drawLegend(ctx, W-206, mapY1-108);

  ctx.strokeStyle = '#C4B78F'; ctx.strokeRect(0, mapY0, W, mapH);

  drawStoryStats(ctx, 0, mapY1, W, statsH);

  canvas.toBlob(blob=>{
    if(!blob){ toast('Не удалось создать изображение'); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `travel-map-story-${new Date().toISOString().slice(0,10)}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('Снимок сохранён');
  }, 'image/png');
}

