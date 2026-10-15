function purposeLabel(key){ const p = PURPOSES.find(p => p.key === key); return p ? p.ru : '—'; }
function companyLabel(key){ const p = COMPANIES.find(p => p.key === key); return p ? p.ru : null; }
function communityLabel(key){ const c = COMMUNITIES.find(c => c.key === key); return c ? c.ru : null; }
function seasonLabel(key){ const p = SEASONS.find(p => p.key === key); return p ? p.ru : null; }
function monthLabel(key){ const m = MONTHS.find(m => m.key === key); return m ? m.short : null; }
function seasonForMonth(month){
  // Северное полушарие — самая частая ситуация для этой карты; если поездка
  // была в южном полушарии, сезон можно переопределить вручную после подстановки
  if([12,1,2].includes(month)) return 'winter';
  if([3,4,5].includes(month)) return 'spring';
  if([6,7,8].includes(month)) return 'summer';
  if([9,10,11].includes(month)) return 'autumn';
  return null;
}
function activityLabel(key){ const p = ACTIVITIES.find(p => p.key === key); return p ? p.ru : null; }

function buildSparkline(profile){
  if(!profile || profile.length < 2) return '';
  const min = Math.min(...profile), max = Math.max(...profile);
  const range = (max - min) || 1;
  const w = 150, h = 34;
  const pts = profile.map((e,i)=>{
    const x = (i/(profile.length-1)) * w;
    const y = h - ((e - min)/range) * (h-2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg width="${w}" height="${h}" style="margin-top:6px;display:block;"><polyline points="${pts}" fill="none" stroke="#3F5240" stroke-width="1.5"/></svg>`;
}

function routeStatsLine(entry){
  const parts = [];
  if(entry.elevationGain !== null && entry.elevationGain !== undefined) parts.push(`+${Math.round(entry.elevationGain)} м набора`);
  if(entry.maxElevation !== null && entry.maxElevation !== undefined) parts.push(`макс. ${Math.round(entry.maxElevation)} м`);
  if(entry.durationMin !== null && entry.durationMin !== undefined) parts.push(formatDuration(entry.durationMin));
  return parts.join(' · ');
}

function shortLinkLabel(url){
  try{
    // через safeUrl — иначе адрес без схемы («disk.yandex.ru/i/…») не парсится
    // как URL и подпись вырождалась в обезличенное «ссылка»
    const host = new URL(safeUrl(url)).hostname.replace(/^www\./, '');
    return host;
  }catch(err){
    return 'ссылка';
  }
}

function buildPopup(entry){
  const heart = (entry.type === 'city' && entry.favorite) ? '❤ ' : '';
  const wishTag = entry.status === 'wishlist' ? ' <span style="color:var(--amber);font-style:italic;">· план</span>' : '';
  const flag = entry.type === 'country' ? countryFlag(entry.countryKey) : (entry.type === 'city' ? countryFlag(entry.countryKey) : '');
  const flagPrefix = flag ? `${flag} ` : '';
  let html = `<div style="font-family:'Twemoji Country Flags','EB Garamond',serif;min-width:170px;">
    <b>${flagPrefix}${heart}${escapeHtml(entry.name)}</b>${wishTag}<br><span style="color:var(--text-dim);">${monthLabel(entry.month) ? monthLabel(entry.month) + ' ' : ''}${entry.year} · ${purposeLabel(entry.purpose)}</span>`;
  if(entry.type === 'city' && entry.countryKey && flag) html += `<br><span style="color:var(--text-dim);">${flag} ${escapeHtml(COUNTRY_RU[entry.countryKey] || entry.countryKey)}</span>`;
  if(entry.type === 'country') html += buildCountryInfoHtml(entry.countryKey);
  if(entry.trip) html += `<br><span style="color:var(--amber);font-style:italic;">${escapeHtml(entry.trip)}</span>`;
  const extras = [seasonLabel(entry.season), companyLabel(entry.company), communityLabel(entry.community), entry.type === 'route' ? activityLabel(entry.activity) : null].filter(Boolean);
  if(extras.length) html += `<br><span style="color:var(--text-dim);">${extras.join(' · ')}</span>`;
  if(entry.type === 'route'){
    html += `<br>${entry.distanceKm.toFixed(1)} км${entry.isEstimated ? ' <span style="color:var(--text-dim);font-style:italic;">(по прямой)</span>' : ''}`;
    const statsLine = routeStatsLine(entry);
    if(statsLine) html += `<br><span style="color:var(--text-dim);">${statsLine}</span>`;
    if(entry.waypointNames && entry.waypointNames.length) html += `<br><span style="color:var(--text-dim);">через: ${entry.waypointNames.map(escapeHtml).join(' → ')}</span>`;
    html += buildSparkline(entry.profile);
  }
  if(entry.notes) html += `<br><span style="font-style:italic;">${escapeHtml(entry.notes)}</span>`;
  const photos = (entry.photos || []).filter(Boolean);
  // Первая ссылка, ведущая прямо на изображение, показывается миниатюрой.
  // Раньше картинка появлялась только вместе со ссылкой на Instagram — без неё
  // фотография оставалась просто ссылкой, хотя показать её было можно.
  const cover = photos.find(u => !photoLinkProblem(u));
  const albums = photos.filter(u => photoLinkProblem(u));
  if(cover && !entry.instagramUrl){
    html += `<a class="popup-photo" href="${escapeAttr(safeUrl(cover))}" target="_blank" rel="noopener">
      <img src="${escapeAttr(safeUrl(cover))}" alt="" loading="lazy" data-photo>
    </a>`;
  }
  if(albums.length){
    html += `<br>${albums.map(u => `<a href="${escapeAttr(safeUrl(u))}" target="_blank" rel="noopener">🗂 ${escapeHtml(shortLinkLabel(u))}</a>`).join(' · ')}`;
  }
  if(photos.length > 1 && cover){
    html += `<div style="font-family:'Twemoji Country Flags','Courier Prime',monospace;font-size:9px;color:var(--text-dim);margin-top:3px;">фото: ${photos.length}</div>`;
  }
  if(entry.instagramUrl){
    if(cover){
      html += `<a class="ig-card" href="${escapeAttr(safeUrl(entry.instagramUrl))}" target="_blank" rel="noopener">
        <img src="${escapeAttr(safeUrl(cover))}" alt="" loading="lazy" data-photo>
        <span class="ig-caption">📷 Открыть в Instagram →</span>
      </a>`;
    } else {
      html += `<a class="ig-badge" href="${escapeAttr(safeUrl(entry.instagramUrl))}" target="_blank" rel="noopener">📷 Пост в Instagram →</a>`;
    }
  }
  if(entry.mapLinkUrl) html += `<a class="ig-badge" href="${escapeAttr(safeUrl(entry.mapLinkUrl))}" target="_blank" rel="noopener">🗺️ Место на карте →</a>`;
  if(entry.docLinkUrl) html += `<a class="ig-badge" href="${escapeAttr(safeUrl(entry.docLinkUrl))}" target="_blank" rel="noopener">📄 Документ →</a>`;
  if(!READ_ONLY && entry.status === 'wishlist'){
    html += `<button data-popup-act="upgrade" data-id="${escapeAttr(entry.id)}" style="margin-top:9px;width:100%;padding:6px 8px;background:var(--amber);border:none;color:var(--on-accent);border-radius:3px;cursor:pointer;font-size:12px;font-family:'Twemoji Country Flags','EB Garamond',serif;">✓ Отметить как посещённое</button>`;
  }
  if(!READ_ONLY){
    html += `<button data-popup-act="delete" data-id="${escapeAttr(entry.id)}" style="margin-top:9px;width:100%;padding:6px 8px;background:var(--danger);border:none;color:var(--on-accent);border-radius:3px;cursor:pointer;font-size:12px;font-family:'Twemoji Country Flags','EB Garamond',serif;">Удалить отметку</button>`;
  }
  html += `</div>`;
  return html;
}


// Обычная ссылка Google Drive ведёт на страницу просмотра, а не на сам файл,
// поэтому в <img> она не отображается. Вытаскиваем идентификатор файла и
// собираем прямой адрес. Форму uc?export=view намеренно не используем — она
// упирается в 403 и лимиты запросов.
function normalizePhotoUrl(raw){
  const url = safeUrl(raw);
  if(!url) return '';
  const m = url.match(/drive\.google\.com\/file\/d\/([-\w]{10,})/)
        || url.match(/drive\.google\.com\/open\?id=([-\w]{10,})/)
        || url.match(/drive\.google\.com\/uc\?(?:[^#]*&)?id=([-\w]{10,})/);
  if(m) return 'https://lh3.googleusercontent.com/d/' + m[1];
  // GitHub: ссылка вида /blob/ ведёт на страницу просмотра, а не на файл.
  // Тот же случай, что с Google Drive — переписываем на прямой адрес.
  const gh = url.match(/^https?:\/\/github\.com\/([^\/]+)\/([^\/]+)\/blob\/([^\/]+)\/(.+)$/i);
  if(gh) return `https://raw.githubusercontent.com/${gh[1]}/${gh[2]}/${gh[3]}/${gh[4].split('?')[0]}`;
  return url;
}

// ссылки, которые заведомо ведут на страницу или альбом, а не на файл картинки
const NON_IMAGE_HOST_PATTERNS = [
  { re: /(^|\/\/)(disk\.yandex\.[a-z]+|yadi\.sk)\//i, ru: 'Яндекс.Диск — публичная ссылка ведёт на страницу, не на файл' },
  { re: /instagram\.com\//i, ru: 'Instagram — ссылка на пост, не на изображение' },
  { re: /(^|\/\/)(m\.)?vk\.(com|ru)\//i, ru: 'ВКонтакте — ссылка на альбом или пост, не на изображение' },
  { re: /photos\.app\.goo\.gl|photos\.google\.com/i, ru: 'Google Фото — ссылка на альбом' },
  { re: /drive\.google\.com\/drive\/folders/i, ru: 'Google Drive — ссылка на папку' },
  { re: /drive\.google\.com/i, ru: 'Google Drive — ссылка не на файл изображения' },
  { re: /^https?:\/\/github\.com\/.+\/blob\//i, ru: 'GitHub — ссылка на страницу, нужна прямая на файл (raw)' },
  { re: /dropbox\.com\/(s|scl)\//i, ru: 'Dropbox — нужен параметр raw=1' },
];
function photoLinkProblem(raw){
  const url = safeUrl(raw);
  if(!url) return null;
  const hit = NON_IMAGE_HOST_PATTERNS.find(p => p.re.test(url));
  return hit ? hit.ru : null;
}

// картинка не загрузилась — показываем понятную заглушку вместо пустого места
function photoFailed(img){
  if(!img || img.dataset.failed) return;
  img.dataset.failed = '1';
  const ph = document.createElement('div');
  ph.className = 'img-failed';
  ph.title = img.getAttribute('src') || '';
  ph.textContent = 'фото не открывается';
  if(img.parentNode) img.parentNode.replaceChild(ph, img);
}
// Фото в карточках помечены data-photo. Событие error не всплывает, поэтому
// слушаем его на перехвате. Если картинка сломалась, пока разметка ещё не была
// в документе (собрана заранее и вставлена позже), её подберёт наблюдатель.
document.addEventListener('error', e => {
  const t = e.target;
  if(t && t.tagName === 'IMG' && t.hasAttribute('data-photo')) photoFailed(t);
}, true);
new MutationObserver(records => {
  for(const r of records) for(const n of r.addedNodes){
    if(n.nodeType !== 1) continue;
    const imgs = n.tagName === 'IMG' ? [n] : n.querySelectorAll ? n.querySelectorAll('img[data-photo]') : [];
    for(const img of imgs) if(img.hasAttribute('data-photo') && img.complete && !img.naturalWidth && img.getAttribute('src')) photoFailed(img);
  }
}).observe(document.body, { childList: true, subtree: true });

