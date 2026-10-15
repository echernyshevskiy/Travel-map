// ---------- тепловая карта треков и исследованные квадраты ----------
// Треки рисуются толстыми полупрозрачными линиями на отдельном холсте под
// обычными слоями: где ходили чаще, линии накладываются и становятся ярче.
// «Квадраты» — клетки сетки тайлов масштаба 14 (около 1,5 км в средней
// полосе), через которые прошёл трек, как в Squadrats/VeloViewer. Маршруты
// «по прямой» не учитываются: это не реальный путь. Треки хранятся
// прореженными (до 800 точек), поэтому счёт приблизительный.
const SQ_ZOOM = 14;
const SQ_N = Math.pow(2, SQ_ZOOM);
function lngToTileF(lng){ return (lng + 180) / 360 * SQ_N; }
function latToTileF(lat){
  const r = lat * Math.PI / 180;
  return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * SQ_N;
}
function tileToLng(x){ return x / SQ_N * 360 - 180; }
function tileToLat(y){ const n = Math.PI - 2 * Math.PI * y / SQ_N; return 180 / Math.PI * Math.atan(Math.sinh(n)); }
const routeSquaresCache = new Map(); // id -> { enc, tiles:Set }
function squaresOfRoute(entry){
  const cached = routeSquaresCache.get(entry.id);
  if(cached && cached.enc === entry.coordsEncoded) return cached.tiles;
  const tiles = new Set();
  const pts = getEntryCoords(entry).map(c => [lngToTileF(c[1]), latToTileF(c[0])]);
  const brk = new Set(entryBreaks(entry));
  for(let i = 0; i < pts.length; i++){
    const p = pts[i];
    tiles.add(Math.floor(p[0]) * SQ_N + Math.floor(p[1]));
    if(i === 0 || brk.has(i)) continue; // между кусками трека не «прошли»
    const q = pts[i-1];
    const dx = p[0] - q[0], dy = p[1] - q[1];
    if(Math.abs(dx) > SQ_N / 2) continue; // переход через линию перемены дат
    const steps = Math.min(5000, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * 2));
    for(let k = 1; k < steps; k++){
      tiles.add(Math.floor(q[0] + dx * k / steps) * SQ_N + Math.floor(q[1] + dy * k / steps));
    }
  }
  routeSquaresCache.set(entry.id, { enc: entry.coordsEncoded, tiles });
  return tiles;
}
// клетка хранится одним числом x·N + y — быстрее строк при тысячах клеток
function maxSquareOf(tiles){
  // классическая динамика «наибольший квадрат из единиц»: обходим клетки по
  // строкам (y), внутри строки по x — соседи слева и сверху уже посчитаны
  const order = Float64Array.from(tiles, k => (k % SQ_N) * SQ_N + Math.floor(k / SQ_N)).sort();
  const dp = new Map();
  let best = 0;
  for(const o of order){
    const y = Math.floor(o / SQ_N), x = o % SQ_N;
    const k = x * SQ_N + y;
    const v = 1 + Math.min(dp.get(k - SQ_N) || 0, dp.get(k - 1) || 0, dp.get(k - SQ_N - 1) || 0);
    dp.set(k, v);
    if(v > best) best = v;
  }
  return best;
}
let heatOn = (function(){ try{ return localStorage.getItem('travel-map-heat') === '1'; }catch(e){ return false; } })();
let heatRoutes = [];
let heatTiles = new Set();
let heatLayer = null, squaresLayer = null, heatRenderer = null, squaresRenderer = null;
function ensureHeatPanes(){
  if(heatRenderer) return;
  map.createPane('heatPane'); map.getPane('heatPane').style.zIndex = 410; // над заливками (в т.ч. контурной подложкой), под маркерами
  map.getPane('heatPane').style.pointerEvents = 'none';
  heatRenderer = L.canvas({ pane: 'heatPane', padding: 0.3 });
  squaresRenderer = L.canvas({ pane: 'heatPane', padding: 0.3 });
}
function drawHeat(){
  ensureHeatPanes();
  if(heatLayer){ map.removeLayer(heatLayer); heatLayer = null; }
  if(!heatOn) return;
  heatLayer = L.layerGroup(heatRoutes.map(e => L.polyline(entryDrawCoords(e), {
    renderer: heatRenderer, interactive: false,
    color: '#D2691E', weight: 7, opacity: 0.22, lineCap: 'round', lineJoin: 'round'
  }))).addTo(map);
}
function drawSquares(){
  ensureHeatPanes();
  if(squaresLayer){ map.removeLayer(squaresLayer); squaresLayer = null; }
  if(!heatOn || map.getZoom() < 10 || heatTiles.size === 0) return;
  const b = map.getBounds();
  const x0 = Math.floor(lngToTileF(b.getWest())), x1 = Math.floor(lngToTileF(b.getEast()));
  const y0 = Math.floor(latToTileF(b.getNorth())), y1 = Math.floor(latToTileF(b.getSouth()));
  const rects = [];
  for(const t of heatTiles){
    const x = Math.floor(t / SQ_N), y = t % SQ_N;
    if(x < x0 || x > x1 || y < y0 || y > y1) continue;
    rects.push(L.rectangle([[tileToLat(y+1), tileToLng(x)], [tileToLat(y), tileToLng(x+1)]], {
      renderer: squaresRenderer, interactive: false,
      color: '#A6592E', weight: 0.6, opacity: 0.5, fillColor: '#D2691E', fillOpacity: 0.12
    }));
    if(rects.length > 4000) break;
  }
  squaresLayer = L.layerGroup(rects).addTo(map);
}
let heatSignature = null, heatMaxSquare = 0;
function updateHeat(visibleVisited){
  heatRoutes = visibleVisited.filter(e => e.type === 'route' && !e.isEstimated);
  // клики по фильтрам, не меняющие набор треков, не пересчитывают квадраты
  const sig = heatRoutes.map(e => e.id + ':' + (e.coordsEncoded || '').length).join('|');
  if(sig !== heatSignature){
    heatSignature = sig;
    heatTiles = new Set();
    heatRoutes.forEach(e => squaresOfRoute(e).forEach(t => heatTiles.add(t)));
    heatMaxSquare = heatTiles.size ? maxSquareOf(heatTiles) : 0;
  }
  const sq = document.getElementById('statSquaresF');
  if(sq) sq.textContent = heatTiles.size.toLocaleString('ru-RU');
  const ms = document.getElementById('statMaxSquareF');
  if(ms) ms.textContent = heatMaxSquare ? `${heatMaxSquare}×${heatMaxSquare}` : '—';
  const chip = document.getElementById('heatChip');
  if(chip) chip.classList.toggle('active', heatOn);
  const leg = document.getElementById('legendHeat');
  if(leg) leg.style.display = heatOn ? '' : 'none';
  drawHeat();
  drawSquares();
}
map.on('moveend', ()=>{ if(heatOn) drawSquares(); });
document.getElementById('heatChip').addEventListener('click', ()=>{
  heatOn = !heatOn;
  try{ localStorage.setItem('travel-map-heat', heatOn ? '1' : '0'); }catch(e){}
  updateHeat(allEntries.filter(passesFilter).filter(e => e.status !== 'wishlist'));
  if(heatOn) toast(map.getZoom() < 10 ? 'Тепловая карта включена. Приблизьте карту — появятся исследованные квадраты' : 'Тепловая карта включена');
});

