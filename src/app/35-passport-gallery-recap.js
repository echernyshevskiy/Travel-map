function where0(v){ return (v || '').trim(); }

function buildBioSpreadHtml(allStamps){
  const visited = allEntries.filter(e => e.status !== 'wishlist' && e.year);
  const cities = distinctCityKeys(getAllCityVisits(visited)).size; // уникальные города, а не число визитов
  const years = visited.map(e => e.year);
  const firstYear = years.length ? Math.min(...years) : null;
  const lastYear = years.length ? Math.max(...years) : null;
  const pct = Math.round((allStamps.length / COUNTRY_LIST.length) * 100);
  const homeCity = HOME_LOCATION.name.split(',')[0].trim();

  const fields = [
    ['Стран посещено', String(allStamps.length)],
    ['Городов посещено', String(cities)],
    ['Открыто карты мира', `${pct}%`],
    ['Первая запись', firstYear ? String(firstYear) : '—'],
    ['Последняя поездка', lastYear ? String(lastYear) : '—'],
    ['Дом', homeCity],
  ];

  // машиночитаемая строка — типографский приём, не кодирует ничего реального
  const mrzLine1 = 'TRAVELLER<<MAP' + '<'.repeat(30);
  const mrzLine2 = `${allStamps.length}COUNTRIES<${cities}CITIES` + '<'.repeat(Math.max(2, 44 - 14 - String(allStamps.length).length - String(cities).length));

  // Левая страница была почти пустой — под неё отведён раздел, который в
  // настоящих паспортах так и называется: особые отметки.
  const badges = computeBadges();
  const left = `<div class="pp-page left pp-bio-page">
    <div class="pp-page-head"><span>особые отметки</span><span>1</span></div>
    ${badges.length ? `<div class="pp-badges">${badges.map(b => `
      <div class="pp-badge">
        <span class="pp-badge-mark">${b.mark}</span>
        <span class="pp-badge-body"><b>${escapeHtml(b.title)}</b><em>${escapeHtml(b.note)}</em></span>
      </div>`).join('')}</div>`
     : `<div style="display:flex;align-items:center;justify-content:center;padding:48px 0;">
          <div class="pp-bio-oval" style="position:static;transform:rotate(-6deg);width:60px;height:38px;font-size:12px;">КП</div>
        </div>`}
    <div class="pp-page-num">— 1 —</div>
  </div>`;

  const right = `<div class="pp-page right pp-bio-page">
    <div class="pp-page-head"><span>сводка / summary</span><span>2</span></div>
    <div class="pp-bio-oval">${pct}%</div>
    <div class="pp-bio-top">
      <div class="pp-bio-photo"><b>${allStamps.length}</b><span>стран посещено</span></div>
      <div class="pp-bio-fields">
        ${fields.slice(0,3).map(([l,v]) => `<div class="pp-bio-field"><label>${escapeHtml(l)}</label><div>${escapeHtml(v)}</div></div>`).join('')}
      </div>
    </div>
    <div class="pp-bio-fields">
      ${fields.slice(3).map(([l,v]) => `<div class="pp-bio-field"><label>${escapeHtml(l)}</label><div>${escapeHtml(v)}</div></div>`).join('')}
    </div>
    <div class="pp-mrz">${mrzLine1}<br>${mrzLine2}</div>
    <div class="pp-page-num">— 2 —</div>
  </div>`;

  return `<div class="pp-spread">${left}${right}</div>`;
}

function renderPassport(){
  const { all: allStamps, shown: stamps, pages } = passportPages();

  document.getElementById('passportCount').textContent =
    `Собрано печатей: ${allStamps.length} из ${COUNTRY_LIST.length} (${Math.round((allStamps.length/COUNTRY_LIST.length)*100)}% карты мира)` +
    (passportSearchQuery ? ` · показано: ${stamps.length}` : '');

  const book = document.getElementById('passportBook');
  const pos = document.getElementById('ppPos');
  const prev = document.getElementById('ppPrev');
  const next = document.getElementById('ppNext');

  // обложка + страница сводки + развороты со штампами
  const spreadsCount = pages.length / 2;
  const totalSpreads = spreadsCount + 2;

  if(passportSpread > totalSpreads - 1) passportSpread = totalSpreads - 1;
  if(passportSpread < 0) passportSpread = 0;

  if(passportSpread === 0){
    book.innerHTML = `<div class="pp-cover">
      <div class="pp-cover-top">
        <div class="pp-emblem">${PASSPORT_EMBLEM_SVG}</div>
        <div class="pp-cover-country">Карта путешествий</div>
      </div>
      <div class="pp-cover-mid">
        <div class="pp-cover-line"></div>
        <div class="pp-cover-title">Паспорт</div>
        <div class="pp-cover-sub">путешественника</div>
        <div class="pp-cover-line"></div>
      </div>
      <div class="pp-cover-bottom">
        <div class="pp-cover-chip"></div>
        <div class="pp-cover-count">${allStamps.length === 0 ? 'печатей пока нет' : 'печатей: ' + allStamps.length}</div>
      </div>
    </div>`;
    pos.textContent = 'обложка';
  } else if(passportSpread === 1){
    book.innerHTML = buildBioSpreadHtml(allStamps);
    pos.textContent = 'сводка';
  } else {
    const idx = (passportSpread - 2) * 2;
    book.innerHTML = `<div class="pp-spread">
      ${buildPageHtml(pages[idx], idx + 3, 'left')}
      ${buildPageHtml(pages[idx + 1], idx + 4, 'right')}
    </div>`;
    pos.textContent = `страницы ${idx + 3}–${idx + 4} из ${pages.length + 2}`;
  }

  prev.disabled = passportSpread === 0;
  next.disabled = passportSpread >= totalSpreads - 1;

  if(passportSearchQuery && stamps.length === 0){
    book.innerHTML = `<div class="hint" style="padding:20px;">Ничего не найдено по запросу «${escapeHtml(passportSearchQuery)}».</div>`;
    pos.textContent = '';
    prev.disabled = next.disabled = true;
  }
}

// Галерея показывает и настоящие миниатюры, и ссылки на альбомы: часть фото
// хранится прямыми ссылками на изображения, часть — ссылками на альбом целиком.
// Вторые физически нельзя показать картинкой, поэтому они выводятся отдельной
// плиткой со ссылкой наружу, а не «битой» картинкой.
function galleryHostLabel(url){
  try{ return new URL(safeUrl(url)).hostname.replace(/^www\./,''); }catch(e){ return 'ссылка'; }
}

function renderGallery(){
  const body = document.getElementById('galleryBody');
  const visible = allEntries.filter(passesFilter);
  // Одна плитка на запись, а не на каждую ссылку: поездка с четырьмя ссылками
  // занимала четыре одинаковые плитки и вытесняла всё остальное.
  // Обложка — первая ссылка, ведущая прямо на изображение; ссылки на альбомы
  // показываем отдельной строкой под подписью, а не отдельными плитками.
  const items = [];
  visible.forEach(e=>{
    const photos = (e.photos || []).filter(Boolean);
    if(photos.length === 0) return;
    const cover = photos.find(p => !photoLinkProblem(p)) || null;
    const albums = photos.filter(p => photoLinkProblem(p));
    items.push({ entry: e, cover, albums, total: photos.length, year: e.year || 0 });
  });

  const withCover = items.filter(i => i.cover).length;
  const onlyAlbums = items.length - withCover;
  document.getElementById('galleryCount').textContent = items.length === 0
    ? 'Пока нет фотографий'
    : `Записей с фото: ${items.length}` +
      (withCover ? ` · с обложкой: ${withCover}` : '') +
      (onlyAlbums ? ` · только ссылки на альбом: ${onlyAlbums}` : '');

  if(items.length === 0){
    body.innerHTML = `<div class="hint" style="padding:20px;">${
      allEntries.some(e => (e.photos||[]).length)
        ? 'Под текущие фильтры не попало ни одной записи с фото.'
        : 'Добавьте ссылку на фото в любую отметку — она появится здесь.'
    }</div>`;
    return;
  }

  items.sort((a,b)=> b.year - a.year || a.entry.name.localeCompare(b.entry.name, 'ru'));
  const galYearCounts = new Map();
  items.forEach(x => galYearCounts.set(x.year, (galYearCounts.get(x.year) || 0) + 1));

  let html = '', lastYear = null;
  items.forEach(it=>{
    if(it.year !== lastYear){
      if(lastYear !== null) html += '</div>';
      lastYear = it.year;
      html += `<div class="gal-year">${it.year || 'без года'}<span>${galYearCounts.get(it.year) || 0}</span></div><div class="gal-grid">`;
    }
    const e = it.entry;
    const flag = (e.type === 'country' || e.type === 'city') ? countryFlag(e.countryKey) : '';
    const cap = `${flag ? flag + ' ' : ''}${escapeHtml(e.name)}`;
    const sub = `${monthLabel(e.month) ? monthLabel(e.month) + ' ' : ''}${e.year}`;
    const albumLinks = it.albums.length
      ? `<a class="gal-album-link" href="${escapeAttr(safeUrl(it.albums[0]))}" target="_blank" rel="noopener">🗂 альбом${it.albums.length > 1 ? ` (${it.albums.length})` : ''} · ${escapeHtml(galleryHostLabel(it.albums[0]))}</a>`
      : '';
    const visual = it.cover
      ? `<img class="gal-thumb" src="${escapeAttr(safeUrl(it.cover))}" alt="" loading="lazy" data-photo>`
      : `<div class="gal-album"><div class="gal-album-icon">🗂</div><div class="gal-album-label">только альбом<br>${escapeHtml(galleryHostLabel(it.albums[0]))}</div></div>`;
    html += `<div class="gal-item">
      <div ${it.cover ? `data-gal-id="${escapeAttr(e.id)}" style="cursor:pointer;"` : ''}>${visual}</div>
      <div class="gal-cap"${it.cover ? ` data-gal-id="${escapeAttr(e.id)}" style="cursor:pointer;"` : ''}>${cap}<em>${sub}</em></div>
      ${albumLinks}
    </div>`;
  });
  if(lastYear !== null) html += '</div>';
  body.innerHTML = html;
}

// клик по миниатюре — закрыть галерею и перелететь к точке на карте
document.getElementById('galleryBody').addEventListener('click', (ev)=>{
  const item = ev.target.closest('[data-gal-id]');
  if(!item) return;
  const entry = allEntries.find(e => e.id === item.dataset.galId);
  if(!entry) return;
  document.getElementById('galleryModal').style.display = 'none';
  focusEntry(entry);
});
document.getElementById('openGalleryBtn').addEventListener('click', ()=>{
  renderGallery();
  document.getElementById('galleryModal').style.display = 'flex';
});
document.getElementById('closeGalleryModal').addEventListener('click', ()=>{
  document.getElementById('galleryModal').style.display = 'none';
});
document.getElementById('galleryModal').addEventListener('click', (e)=>{
  if(e.target.id === 'galleryModal') document.getElementById('galleryModal').style.display = 'none';
});

// Печать выводит весь паспорт целиком, а не текущий разворот: на время печати
// подставляем все развороты подряд, затем возвращаем обычный вид.
document.getElementById('ppPrint').addEventListener('click', ()=>{
  const book = document.getElementById('passportBook');
  const restore = book.innerHTML;
  const restoreSpread = passportSpread;
  const parts = [];
  const total = passportTotalSpreads();
  for(let s = 0; s < total; s++){
    passportSpread = s;
    renderPassport();
    // Разрыв страницы вешаем на простой блочный контейнер, а не на сам
    // .pp-spread/.pp-cover: они одновременно ещё и flex-контейнеры для своих
    // колонок, а разрыв страницы на flex-элементе печатные движки поддерживают
    // ненадёжно.
    parts.push(`<div class="pp-print-page">${book.innerHTML}</div>`);
  }
  book.innerHTML = parts.join('');

  // Восстанавливаем ТОЛЬКО по сигналу о завершении печати. Раньше здесь стоял
  // таймер на 1500 мс: на телефоне окно печати открывается асинхронно, PDF
  // формируется в момент нажатия «Сохранить» — заведомо позже. Таймер успевал
  // вернуть один разворот, и в файл попадала только текущая страница.
  let done = false;
  const printMq = window.matchMedia ? window.matchMedia('print') : null;
  const onMqChange = (e)=>{ if(!e.matches) cleanup(); };
  const cleanup = ()=>{
    if(done) return;
    done = true;
    book.innerHTML = restore;
    passportSpread = restoreSpread;
    renderPassport();
    window.removeEventListener('afterprint', cleanup);
    window.removeEventListener('focus', onFocus);
    if(printMq && printMq.removeEventListener) printMq.removeEventListener('change', onMqChange);
  };
  // возврат фокуса означает, что диалог печати закрыт — запасной путь для браузеров,
  // которые не шлют afterprint
  const onFocus = ()=>{ setTimeout(cleanup, 400); };

  window.addEventListener('afterprint', cleanup);
  window.addEventListener('focus', onFocus);
  if(printMq && printMq.addEventListener) printMq.addEventListener('change', onMqChange);

  window.print();
});

// Итоги года. Считаем по тем же функциям, что и общая статистика, — иначе
// цифры в итогах и в панели разошлись бы, а это худшее, что может случиться
// с таким экраном.
function computeRecap(year){
  const inYear = allEntries.filter(e => e.year === year && e.status !== 'wishlist');
  const before = allEntries.filter(e => e.year < year && e.status !== 'wishlist');
  const seenBefore = new Set(before.filter(e => e.type === 'country').map(e => e.countryKey));
  const countries = [...new Set(inYear.filter(e => e.type === 'country').map(e => e.countryKey))];
  const newCountries = countries.filter(k => !seenBefore.has(k));
  const cityVisits = getAllCityVisits(inYear);
  const cities = distinctCityKeys(cityVisits);
  const routes = inYear.filter(e => e.type === 'route');
  const km = routes.reduce((s,r) => s + (r.distanceKm || 0), 0);
  const gain = routes.reduce((s,r) => s + (r.elevationGain || 0), 0);
  const months = new Set(inYear.filter(e => e.month).map(e => e.month));
  const longest = routes.slice().sort((a,b) => (b.distanceKm||0) - (a.distanceKm||0))[0];
  const trips = new Set(inYear.map(e => e.trip).filter(Boolean));

  // самый частый город года
  const freq = {};
  cityVisits.forEach(c=>{
    const k = c.name.trim();
    if(k.toLowerCase() === HOME_CITY_NAME.toLowerCase()) return;
    freq[k] = (freq[k] || 0) + 1;
  });
  const topCity = Object.entries(freq).sort((a,b)=>b[1]-a[1])[0];

  // лучший темп бега за год
  const runs = routes.filter(r => r.activity === 'running' && r.durationMin && r.distanceKm);
  const bestRun = runs.slice().sort((a,b)=>(a.durationMin/a.distanceKm)-(b.durationMin/b.distanceKm))[0];

  return { year, countries, newCountries, cities, km, gain, months, longest, trips, topCity, bestRun,
           entries: inYear.length };
}

function renderRecap(){
  const sel = document.getElementById('recapYear');
  const year = parseInt(sel.value, 10);
  const body = document.getElementById('recapBody');
  if(!year){ body.innerHTML = `<div class="hint recap-empty">Нет данных с указанным годом.</div>`; return; }
  const r = computeRecap(year);
  if(r.entries === 0){
    body.innerHTML = `<div class="hint recap-empty">За ${year} год отметок нет.</div>`;
    return;
  }
  const cards = [
    [r.countries.length, 'стран'],
    [r.newCountries.length, 'из них впервые'],
    [r.cities.size, 'городов'],
    [r.trips.size, 'поездок'],
    [r.months.size, 'месяцев в пути'],
    [r.km >= 1 ? Math.round(r.km).toLocaleString('ru-RU') : '—', 'километров'],
  ];
  const hi = [];
  if(r.longest) hi.push(['Самый длинный маршрут', `${escapeHtml(r.longest.name)} · ${(r.longest.distanceKm||0).toFixed(1)} км`]);
  if(r.gain > 0) hi.push(['Набор высоты', `${Math.round(r.gain).toLocaleString('ru-RU')} м`]);
  if(r.topCity) hi.push(['Чаще всего', `${escapeHtml(r.topCity[0])} · ${r.topCity[1]} ${r.topCity[1]===1?'визит':'визита'}`]);
  if(r.bestRun) hi.push(['Лучший темп бега', `${formatPace(r.bestRun.durationMin / r.bestRun.distanceKm)}`]);
  if(r.newCountries.length) hi.push(['Новые страны', r.newCountries.map(k => (countryFlag(k) ? countryFlag(k)+' ' : '') + escapeHtml(COUNTRY_RU[k] || k)).join(', ')]);

  body.innerHTML = `
    <div class="recap-grid">
      ${cards.map(([n,l]) => `<div class="recap-card"><div class="recap-num">${n}</div><div class="recap-label">${l}</div></div>`).join('')}
    </div>
    ${hi.length ? `<div class="recap-hi stat-grid">${hi.map(([l,v]) => `<div class="stat-row"><span>${l}</span><b>${v}</b></div>`).join('')}</div>` : ''}
  `;
}

function fillRecapYears(){
  const sel = document.getElementById('recapYear');
  const years = [...new Set(allEntries.filter(e => e.status !== 'wishlist' && e.year).map(e => e.year))].sort((a,b)=>b-a);
  sel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('') || `<option value="">—</option>`;
}

document.getElementById('openRecapBtn').addEventListener('click', ()=>{
  fillRecapYears();
  renderRecap();
  document.getElementById('recapModal').style.display = 'flex';
});
document.getElementById('recapYear').addEventListener('change', renderRecap);
document.getElementById('closeRecapModal').addEventListener('click', ()=>{
  document.getElementById('recapModal').style.display = 'none';
});
document.getElementById('recapModal').addEventListener('click', (e)=>{
  if(e.target.id === 'recapModal') document.getElementById('recapModal').style.display = 'none';
});

// Выгрузка итогов картинкой — вертикальный формат под сторис, оформление
// то же, что у снимка карты, чтобы обе картинки смотрелись как одна серия
document.getElementById('recapDownload').addEventListener('click', ()=>{
  const year = parseInt(document.getElementById('recapYear').value, 10);
  if(!year){ toast('Нет данных за выбранный год'); return; }
  const r = computeRecap(year);
  if(r.entries === 0){ toast('За этот год отметок нет'); return; }

  const W = 1080, H = 1920;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');

  ctx.fillStyle = '#E7DFC7'; ctx.fillRect(0,0,W,H);
  ctx.strokeStyle = 'rgba(160,140,95,0.30)'; ctx.lineWidth = 2;
  ctx.strokeRect(38,38,W-76,H-76);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#2B3B2E';
  ctx.font = "italic 700 62px 'Twemoji Country Flags','Playfair Display'";
  ctx.fillText('Год в путешествиях', W/2, 210);
  ctx.font = "italic 700 150px 'Twemoji Country Flags','Playfair Display'";
  ctx.fillStyle = '#A6592E';
  ctx.fillText(String(year), W/2, 380);

  const cards = [
    [r.countries.length, 'стран'],
    [r.newCountries.length, 'впервые'],
    [r.cities.size, 'городов'],
    [r.trips.size, 'поездок'],
    [r.months.size, 'месяцев в пути'],
    [r.km >= 1 ? Math.round(r.km).toLocaleString('ru-RU') : '—', 'километров'],
  ];
  let y = 520;
  for(let i = 0; i < cards.length; i += 2){
    for(let j = 0; j < 2 && i + j < cards.length; j++){
      const cx = j === 0 ? W*0.29 : W*0.71;
      ctx.fillStyle = '#2B3B2E';
      ctx.font = "italic 700 92px 'Twemoji Country Flags','Playfair Display'";
      ctx.fillText(String(cards[i+j][0]), cx, y);
      ctx.fillStyle = '#6E6547';
      ctx.font = "26px 'Twemoji Country Flags','EB Garamond'";
      ctx.fillText(cards[i+j][1], cx, y + 44);
    }
    y += 190;
  }

  const hi = [];
  if(r.longest) hi.push(['самый длинный маршрут', `${r.longest.name} · ${(r.longest.distanceKm||0).toFixed(1)} км`]);
  if(r.gain > 0) hi.push(['набор высоты', `${Math.round(r.gain).toLocaleString('ru-RU')} м`]);
  if(r.topCity) hi.push(['чаще всего', `${r.topCity[0]} · ${r.topCity[1]}`]);
  if(r.bestRun) hi.push(['лучший темп бега', formatPace(r.bestRun.durationMin / r.bestRun.distanceKm)]);

  y += 10;
  ctx.strokeStyle = 'rgba(160,140,95,0.45)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(W*0.18, y); ctx.lineTo(W*0.82, y); ctx.stroke();
  y += 62;
  hi.slice(0,4).forEach(([label, value])=>{
    ctx.fillStyle = '#6E6547';
    ctx.font = "24px 'Twemoji Country Flags','Courier Prime'";
    ctx.fillText(label.toUpperCase(), W/2, y);
    ctx.fillStyle = '#2B3B2E';
    ctx.font = "italic 700 38px 'Twemoji Country Flags','Playfair Display'";
    // длинные названия ужимаем, чтобы не выходили за поля
    let v = value, m = ctx.measureText(v);
    while(m.width > W - 180 && v.length > 8){ v = v.slice(0, -4) + '…'; m = ctx.measureText(v); }
    ctx.fillText(v, W/2, y + 48);
    y += 128;
  });

  ctx.fillStyle = '#6E6547';
  ctx.font = "italic 30px 'Twemoji Country Flags','Playfair Display'";
  ctx.fillText('Карта путешествий', W/2, H - 96);
  ctx.font = "22px 'Twemoji Country Flags','Courier Prime'";
  ctx.fillText(new Date().toLocaleDateString('ru-RU'), W/2, H - 60);

  cv.toBlob(blob=>{
    if(!blob){ toast('Не удалось создать картинку'); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `год-${year}.png`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(()=> URL.revokeObjectURL(url), 1000);
    toast('Картинка сохранена');
  }, 'image/png');
});

document.getElementById('ppPrev').addEventListener('click', ()=>{ passportSpread--; renderPassport(); });
document.getElementById('ppNext').addEventListener('click', ()=>{ passportSpread++; renderPassport(); });

let homeRegionLayer = null;
