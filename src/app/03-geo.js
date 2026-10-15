// площадь охватывающего прямоугольника — считаем один раз, нужна для выбора
// наименьшей из подходящих стран
const COUNTRY_BBOX_AREA = {};
(function computeBboxAreas(){
  COUNTRIES_GEOJSON.features.forEach(f=>{
    const g = f.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    let minLng=Infinity, maxLng=-Infinity, minLat=Infinity, maxLat=-Infinity;
    polys.forEach(poly => poly[0].forEach(c=>{
      if(c[0]<minLng) minLng=c[0]; if(c[0]>maxLng) maxLng=c[0];
      if(c[1]<minLat) minLat=c[1]; if(c[1]>maxLat) maxLat=c[1];
    }));
    COUNTRY_BBOX_AREA[f.properties.name] = (maxLng-minLng) * (maxLat-minLat);
  });
})();

function findCountryFeature(latlng){
  const pt = [latlng.lat, latlng.lng];
  // не первая попавшаяся, а НАИМЕНЬШАЯ из подходящих: иначе анклавы и
  // микрогосударства (Ватикан в Италии, Монако у Франции, Сингапур у Малайзии)
  // перекрываются крупным соседом просто из-за порядка в массиве
  let best = null, bestArea = Infinity;
  for(const feature of COUNTRIES_GEOJSON.features){
    if(!pointInGeometry(pt, feature.geometry)) continue;
    const area = COUNTRY_BBOX_AREA[feature.properties.name] ?? Infinity;
    if(area < bestArea){ bestArea = area; best = feature; }
  }
  return best;
}
function getCountryGeometry(name){
  return COUNTRY_GEOMETRY_INDEX[name] || null;
}

