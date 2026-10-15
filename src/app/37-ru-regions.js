// ---------- регионы России ----------
// Регион определяется по точкам: городам и остановкам маршрутов («были»),
// а по трекам — «проездом», если в регионе не было ни одной остановки.
// Учитываются записи, видимые с текущими фильтрами, — как и всё на карте.
const RU_REGIONS = RU_REGIONS_GEOJSON.features.map(f=>{
  const g = f.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  let minLng=Infinity, maxLng=-Infinity, minLat=Infinity, maxLat=-Infinity;
  polys.forEach(poly => poly[0].forEach(c=>{
    if(c[0]<minLng) minLng=c[0]; if(c[0]>maxLng) maxLng=c[0];
    if(c[1]<minLat) minLat=c[1]; if(c[1]>maxLat) maxLat=c[1];
  }));
  return { name: f.properties.name, geometry: g, polys, bbox: [minLat, minLng, maxLat, maxLng] };
});
const RU_REGION_TOTAL = RU_REGIONS.length;

