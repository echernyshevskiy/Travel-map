// Разбор выгрузок истории местоположений Google Maps (Android, iPhone,
// Takeout Semantic, Records.json) в точки { lat, lng, t, end, visit }. unit/timeline-parse.test.js.

export function gtlParseLL(v){
  if(v == null) return null;
  if(typeof v === 'object'){
    if(v.latitudeE7 != null && v.longitudeE7 != null) return [v.latitudeE7 / 1e7, v.longitudeE7 / 1e7];
    if(v.latE7 != null && v.lngE7 != null) return [v.latE7 / 1e7, v.lngE7 / 1e7];
    if(v.latLng) return gtlParseLL(v.latLng);
    if(v.LatLng) return gtlParseLL(v.LatLng);
    return null;
  }
  const m = String(v).replace('geo:', '').match(/(-?\d+(?:\.\d+)?)\s*°?\s*,\s*(-?\d+(?:\.\d+)?)/);
  if(!m) return null;
  const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
  return isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lat, lng] : null;
}

export function gtlParseTime(v){
  if(v == null) return null;
  if(typeof v === 'number') return v > 1e12 ? v : v * 1000;
  const s = String(v);
  if(/^\d{11,}$/.test(s)) return +s;
  const t = Date.parse(s);
  return isNaN(t) ? null : t;
}

// → [{ lat, lng, t, end, visit }]
export function gtlExtract(obj){
  const out = [];
  const push = (ll, t, end, visit) => { if(ll && t) out.push({ lat: ll[0], lng: ll[1], t, end: end || t, visit: !!visit }); };
  const segs = Array.isArray(obj) ? obj : (obj && Array.isArray(obj.semanticSegments) ? obj.semanticSegments : null);
  if(segs){
    segs.forEach(sg => {
      const t0 = gtlParseTime(sg.startTime), t1 = gtlParseTime(sg.endTime);
      if(sg.visit){
        const tc = sg.visit.topCandidate || {};
        push(gtlParseLL(tc.placeLocation), t0, t1, true);
      }
      if(sg.activity){
        push(gtlParseLL(sg.activity.start), t0, t0, false);
        push(gtlParseLL(sg.activity.end), t1, t1, false);
      }
      if(Array.isArray(sg.timelinePath)){
        sg.timelinePath.forEach(pt => {
          const off = pt.durationMinutesOffsetFromStartTime != null ? +pt.durationMinutesOffsetFromStartTime * 60000 : null;
          push(gtlParseLL(pt.point), pt.time ? gtlParseTime(pt.time) : (t0 != null && off != null ? t0 + off : t0), null, false);
        });
      }
    });
    if(!out.length && obj && Array.isArray(obj.rawSignals)){
      obj.rawSignals.forEach(r => { if(r.position) push(gtlParseLL(r.position.LatLng || r.position.latLng), gtlParseTime(r.position.timestamp), null, false); });
    }
    return out;
  }
  if(obj && Array.isArray(obj.timelineObjects)){
    obj.timelineObjects.forEach(o => {
      if(o.placeVisit){
        const d = o.placeVisit.duration || {};
        push(gtlParseLL(o.placeVisit.location), gtlParseTime(d.startTimestamp || d.startTimestampMs), gtlParseTime(d.endTimestamp || d.endTimestampMs), true);
      } else if(o.activitySegment){
        const a = o.activitySegment, d = a.duration || {};
        push(gtlParseLL(a.startLocation), gtlParseTime(d.startTimestamp || d.startTimestampMs), null, false);
        push(gtlParseLL(a.endLocation), gtlParseTime(d.endTimestamp || d.endTimestampMs), null, false);
      }
    });
    return out;
  }
  if(obj && Array.isArray(obj.locations)){
    obj.locations.forEach(l => push(gtlParseLL(l), gtlParseTime(l.timestamp || l.timestampMs), null, false));
  }
  return out;
}
