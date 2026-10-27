// ---------- особые отметки паспорта ----------
// Значок должен быть правдой, а не натяжкой: если перевеса нет, лучше сказать
// об этом прямо, чем объявлять «любителем лета» при 29% против 26%.
function computeBadges(){
  const visited = allEntries.filter(e => e.status !== 'wishlist');
  const badges = [];
  const share = (field, labels) => {
    const counts = {};
    visited.forEach(e => { const v = e[field]; if(v) counts[v] = (counts[v] || 0) + 1; });
    const total = Object.values(counts).reduce((a,b)=>a+b, 0);
    if(total === 0) return null;
    const sorted = Object.entries(counts).sort((a,b)=>b[1]-a[1]);
    const [topKey, topN] = sorted[0];
    const secondN = sorted[1] ? sorted[1][1] : 0;
    return { topKey, pct: Math.round(topN/total*100), lead: secondN ? topN/secondN : Infinity, total, counts, sorted };
  };

  // компания: нужен и вес, и отрыв от следующей
  const co = share('company');
  if(co){
    const named = { friends:'Душа компании', group:'Свой в сообществе', couple:'Вдвоём против мира',
                    parents:'Семейные маршруты', alone:'Одиночное плавание' };
    if(co.pct >= 40 && co.lead >= 1.4 && named[co.topKey]){
      badges.push({ mark:'✦', title: named[co.topKey],
        note: `${companyLabel(co.topKey)} — ${co.pct}% поездок` });
    } else {
      badges.push({ mark:'✦', title:'Лёгок на подъём', note:'ездит и один, и в компании — без явного перевеса' });
    }
  }

  // сезон: если разброс мал, это и есть характеристика
  const se = share('season');
  if(se){
    const named = { summer:'Любитель лета', winter:'Зимний странник',
                    spring:'Весенний ветер', autumn:'Осенний путник' };
    const spread = se.sorted[0][1] - se.sorted[se.sorted.length-1][1];
    const evenly = se.sorted.length >= 4 && spread / se.total < 0.15;
    if(evenly){
      badges.push({ mark:'❋', title:'Круглогодичный', note:'ездит во все сезоны примерно поровну' });
    } else if(se.pct >= 35 && named[se.topKey]){
      badges.push({ mark:'❋', title: named[se.topKey], note:`${seasonLabel(se.topKey)} — ${se.pct}% поездок` });
    }
  }

  // цель поездки
  const pu = share('purpose');
  if(pu){
    if((pu.counts.sport || 0) / pu.total >= 0.08){
      badges.push({ mark:'▲', title:'Спорт как повод', note:`${pu.counts.sport} поездок ради спорта` });
    } else if((pu.counts.business || 0) / pu.total >= 0.2){
      badges.push({ mark:'▲', title:'Командировочный', note:`${Math.round((pu.counts.business/pu.total)*100)}% поездок по работе` });
    } else if(pu.topKey === 'tourism' && pu.pct >= 80){
      badges.push({ mark:'▲', title:'Чистый интерес', note:`${pu.pct}% поездок — ради самих поездок` });
    }
  }

  // лучший год по новым странам
  const firsts = {};
  visited.filter(e => e.type === 'country' && e.countryKey && e.year)
    .sort((a,b)=>a.year-b.year)
    .forEach(e => { if(firsts[e.countryKey] === undefined) firsts[e.countryKey] = e.year; });
  const perYear = {};
  Object.values(firsts).forEach(y => { perYear[y] = (perYear[y] || 0) + 1; });
  const bestYear = Object.entries(perYear).sort((a,b)=> b[1]-a[1] || b[0]-a[0])[0];
  if(bestYear && bestYear[1] >= 3){
    badges.push({ mark:'★', title:`Рекорд года: ${bestYear[1]}`,
      note:`столько стран открыто впервые за ${bestYear[0]}` });
  }

  // стаж
  const years = visited.map(e => e.year).filter(Boolean);
  if(years.length){
    const span = Math.max(...years) - Math.min(...years);
    // «21 лет» резало глаз — склоняем правильно
    const yearWord = (n)=>{
      const t = n % 10, h = n % 100;
      if(h >= 11 && h <= 14) return 'лет';
      if(t === 1) return 'год';
      if(t >= 2 && t <= 4) return 'года';
      return 'лет';
    };
    if(span >= 15) badges.push({ mark:'⧗', title:'Ветеран дорог', note:`${span} ${yearWord(span)} с первой записи` });
    else if(span >= 8) badges.push({ mark:'⧗', title:'Долгий путь', note:`${span} ${yearWord(span)} с первой записи` });
  }

  // километры маршрутов
  const km = visited.filter(e => e.type === 'route').reduce((s,r)=> s + (r.distanceKm || 0), 0);
  if(km >= 10000) badges.push({ mark:'◈', title:'Дорога как дом', note:`${Math.round(km).toLocaleString('ru-RU')} км маршрутов` });
  else if(km >= 1000) badges.push({ mark:'◈', title:'На своих двоих', note:`${Math.round(km).toLocaleString('ru-RU')} км маршрутов` });

  // охват мира
  const countries = new Set(visited.filter(e => e.type === 'country' && e.countryKey).map(e => e.countryKey));
  if(countries.size >= 10){
    const pct = Math.round(countries.size / COUNTRY_LIST.length * 100);
    badges.push({ mark:'◉', title:`Открыто ${pct}% мира`, note:`${countries.size} стран из ${COUNTRY_LIST.length}` });
  }

  // моря и океаны: от пяти морей — значок, все океаны с берега — отдельно
  const sea = seaSummary(computeSeaStats(visited));
  const seaNote = `${sea.seas.length} ${seasWord(sea.seas.length)}` + (sea.oceans.length ? ` и ${sea.oceans.length} ${oceansWord(sea.oceans.length)}` : '');
  if(sea.seas.length >= 15) badges.push({ mark:'≈', title:'Морской волк', note: seaNote });
  else if(sea.seas.length >= 7) badges.push({ mark:'≈', title:'Семь морей', note: seaNote });
  else if(sea.seas.length >= 5) badges.push({ mark:'≈', title:'Мореход', note: seaNote });
  if(sea.oceans.length >= 4) badges.push({ mark:'◍', title: sea.oceans.length >= 5 ? 'Все океаны' : 'Четыре океана', note: sea.oceans.map(o => o.name.replace(' океан', '')).join(', ') });

  // частая активность маршрутов
  const acts = {};
  visited.filter(e => e.type === 'route' && e.activity).forEach(e => { acts[e.activity] = (acts[e.activity]||0)+1; });
  const topAct = Object.entries(acts).sort((a,b)=>b[1]-a[1])[0];
  if(topAct && topAct[1] >= 3){
    const named = { roadtrip:'За рулём', hiking:'Ходок', running:'Бегун', cycling:'На колёсах' };
    if(named[topAct[0]]) badges.push({ mark:'⬗', title: named[topAct[0]], note:`${activityLabel(topAct[0])} — ${topAct[1]} маршрутов` });
  }

  return badges;
}

// Схематичный вид маршрута прямо в карточке. Геометрия уже хранится, поэтому
// рисуем её сами: ни карты-подложки, ни сети не нужно, работает офлайн.
function buildRouteSparkSvg(entry, w = 300, h = 120){
  const coords = getEntryCoords(entry);
  if(!coords || coords.length < 2) return '';
  // прореживаем: для миниатюры хватает пары сотен точек, а в треке бывают тысячи
  const MAX = 220;
  const step = Math.max(1, Math.ceil(coords.length / MAX));
  const brk = new Set(entryBreaks(entry));
  const startsSeg = [];
  const pts = [];
  coords.forEach((c, i) => {
    // начало и конец каждого куска сохраняем, чтобы разрыв остался разрывом
    if(!(i % step === 0 || i === coords.length - 1 || brk.has(i) || brk.has(i + 1))) return;
    if(!c || !isFinite(c[0]) || !isFinite(c[1])) return;
    startsSeg.push(brk.has(i));
    pts.push(c);
  });
  if(pts.length < 2) return '';

  const lats = pts.map(c => c[0]), lngs = pts.map(c => c[1]);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  // на широте φ градус долготы короче градуса широты — без поправки
  // северные маршруты выглядели бы растянутыми вширь
  const kx = Math.cos(midLat * Math.PI / 180) || 1;
  const xs = lngs.map(v => v * kx), ys = lats.map(v => -v);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = (maxX - minX) || 1e-6, spanY = (maxY - minY) || 1e-6;
  const pad = 10;
  const scale = Math.min((w - pad*2) / spanX, (h - pad*2) / spanY);
  const offX = (w - spanX * scale) / 2, offY = (h - spanY * scale) / 2;
  const px = i => ((xs[i] - minX) * scale + offX).toFixed(1);
  const py = i => ((ys[i] - minY) * scale + offY).toFixed(1);

  const d = pts.map((_, i) => `${i && !startsSeg[i] ? 'L' : 'M'}${px(i)} ${py(i)}`).join(' ');
  const color = entry.color || DEFAULT_COLOR.route;
  const last = pts.length - 1;

  // именованные остановки, если у них есть координаты
  let stops = '';
  if(Array.isArray(entry.waypointCoords)){
    entry.waypointCoords.forEach(c=>{
      if(!c || !isFinite(c[0]) || !isFinite(c[1])) return;
      const x = ((c[1]*kx - minX) * scale + offX), y = ((-c[0] - minY) * scale + offY);
      if(x < -5 || y < -5 || x > w+5 || y > h+5) return;
      stops += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" fill="${escapeAttr(color)}" opacity="0.55"/>`;
    });
  }

  // Контуры стран, по которым проходит маршрут, — как подложка. Линия на
  // пустом фоне не давала понять, где это; теперь виден силуэт местности.
  // Геометрия уже в файле, так что подложка не требует ни карты, ни сети.
  let backdrop = '';
  const keys = new Set((entry.waypointCountryKeys || []).filter(Boolean));
  if(keys.size === 0){
    const mid = pts[Math.floor(pts.length/2)];
    const f = findCountryFeature({ lat: mid[0], lng: mid[1] });
    if(f) keys.add(f.properties.name);
  }
  keys.forEach(k=>{
    const geom = getCountryGeometry(k);
    if(!geom) return;
    const g = geom.geometry || geom;
    if(!g || !g.coordinates) return;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    polys.forEach(poly=>{
      const ring = poly[0];
      if(!ring || ring.length < 3) return;
      // рисуем только то, что попадает в кадр, иначе крупная страна съест масштаб
      const dd = ring.map((c,i)=>{
        const x = (c[0]*kx - minX) * scale + offX;
        const y = (-c[1] - minY) * scale + offY;
        return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
      }).join(' ');
      backdrop += `<path d="${dd}Z" fill="rgba(140,120,85,0.13)" stroke="rgba(120,100,70,0.3)" stroke-width="0.8"/>`;
    });
  });

  return `<svg class="route-spark" viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="xMidYMid meet" aria-label="Схема маршрута">
    <g clip-path="url(#sparkClip${escapeAttr(entry.id)})">${backdrop}</g>
    <clipPath id="sparkClip${escapeAttr(entry.id)}"><rect x="0" y="0" width="${w}" height="${h}"/></clipPath>
    <path d="${d}" fill="none" stroke="${escapeAttr(color)}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" opacity="0.9"/>
    ${stops}
    <circle cx="${px(0)}" cy="${py(0)}" r="4" fill="none" stroke="${escapeAttr(color)}" stroke-width="2"/>
    <circle cx="${px(last)}" cy="${py(last)}" r="4" fill="${escapeAttr(color)}"/>
  </svg>`;
}

// Мини-график высот. Профиль хранится у 19 маршрутов из 31 — там, где был GPX
// с высотами. Где его нет, блок просто не появляется.
function buildElevationSvg(entry, w = 300, h = 46){
  const p = Array.isArray(entry.profile) ? entry.profile.filter(v => typeof v === 'number' && isFinite(v)) : null;
  if(!p || p.length < 3) return '';
  const min = Math.min(...p), max = Math.max(...p);
  const span = (max - min) || 1;
  const pad = 3;
  const x = i => (i / (p.length - 1) * (w - pad*2) + pad).toFixed(1);
  const y = v => (h - pad - (v - min) / span * (h - pad*2)).toFixed(1);
  const line = p.map((v,i) => `${i ? 'L' : 'M'}${x(i)} ${y(v)}`).join(' ');
  const area = `M${x(0)} ${h} L` + p.map((v,i)=>`${x(i)} ${y(v)}`).join(' L') + ` L${x(p.length-1)} ${h}Z`;
  const color = entry.color || DEFAULT_COLOR.route;
  return `<div class="elev-wrap">
    <svg class="elev-spark" viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none" aria-label="Профиль высот">
      <path d="${area}" fill="${escapeAttr(color)}" opacity="0.16"/>
      <path d="${line}" fill="none" stroke="${escapeAttr(color)}" stroke-width="1.4" stroke-linejoin="round"/>
    </svg>
    <div class="elev-legend"><span>${Math.round(min)} м</span><span>${Math.round(max)} м</span></div>
  </div>`;
}

