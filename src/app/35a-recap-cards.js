// ---------- итоги года: карточки, чтобы поделиться ----------
// Три шаблона в одной гамме со снимком карты:
//   «Цифры» — вертикальная (1080×1920, под сторис): числа года и главное;
//   «Карта» — вертикальная: карта мест года (страны, впервые — кирпичным,
//             города, маршруты, перелёты пунктиром) и четыре числа;
//   «Квадрат» — 1080×1080 под пост: год, три числа и карта.
// Картинка рисуется заранее и показывается в окне — что увидите, то и
// сохранится. На телефоне — «Поделиться» (системное меню: мессенджеры, сторис),
// иначе — «Скачать картинкой».

const RECAP_TEMPLATES = [
  { key: 'stats', ru: 'Цифры', w: 1080, h: 1920 },
  { key: 'map', ru: 'Карта', w: 1080, h: 1920 },
  { key: 'square', ru: 'Квадрат', w: 1080, h: 1080 }
];
const RECAP_TEMPLATE_KEY = 'travel-map-recap-template';
let recapTemplate = 'stats';
try {
  const saved = localStorage.getItem(RECAP_TEMPLATE_KEY);
  if (RECAP_TEMPLATES.some(t => t.key === saved)) recapTemplate = saved;
} catch (e) {
  /* хранилище недоступно — шаблон по умолчанию */
}
// цвета карточек — те же, что у снимка карты (холст не видит переменных CSS)
const CARD = {
  paper: '#E7DFC7',
  paper2: '#DED4B6',
  ink: '#2B3B2E',
  dim: '#6E6547',
  rust: '#A6592E',
  line: 'rgba(160,140,95,0.45)',
  frame: 'rgba(160,140,95,0.30)'
};

function recapEntriesOf(year) {
  return allEntries.filter(e => e.year === year && e.status !== 'wishlist');
}

// рамка, фон, подпись внизу — общие для всех шаблонов
function drawCardFrame(ctx, W, H) {
  ctx.fillStyle = CARD.paper;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = CARD.frame;
  ctx.lineWidth = 2;
  ctx.strokeRect(38, 38, W - 76, H - 76);
}
function drawCardFooter(ctx, W, H) {
  ctx.textAlign = 'center';
  ctx.fillStyle = CARD.dim;
  ctx.font = "italic 30px 'Twemoji Country Flags','Playfair Display'";
  ctx.fillText('Карта путешествий', W / 2, H - 96);
  ctx.font = "22px 'Twemoji Country Flags','Courier Prime'";
  ctx.fillText(new Date().toLocaleDateString('ru-RU'), W / 2, H - 60);
}
// ряд чисел с подписями по ширине
function drawNumberRow(ctx, items, x0, x1, y, numPx) {
  const step = (x1 - x0) / items.length;
  ctx.textAlign = 'center';
  items.forEach(([n, label], i) => {
    const cx = x0 + step * (i + 0.5);
    ctx.fillStyle = CARD.ink;
    ctx.font = `italic 700 ${numPx}px 'Twemoji Country Flags','Playfair Display'`;
    ctx.fillText(String(n), cx, y);
    ctx.fillStyle = CARD.dim;
    ctx.font = `${Math.round(numPx * 0.3)}px 'Twemoji Country Flags','EB Garamond'`;
    ctx.fillText(label, cx, y + Math.round(numPx * 0.48));
  });
}
const kmText = km => (km >= 1 ? Math.round(km).toLocaleString('ru-RU') : '—');

// Рамка карты по местам года: страны (по контуру), города, треки; с запасом
// и не меньше ~10° по широте, чтобы одна точка не превращалась в план улицы
function recapBounds(entries) {
  let minLat = 90,
    maxLat = -90,
    minLng = 540,
    maxLng = -540;
  const add = (lat, lng) => {
    if (!isFinite(lat) || !isFinite(lng)) return;
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
  };
  entries.forEach(e => {
    if (e.type === 'country') {
      const g = getCountryGeometry(e.countryKey);
      if (!g) return;
      const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
      // у России и США части за линией перемены дат: берём только основной материк — самый большой контур
      const main = polys.slice().sort((a, b) => b[0].length - a[0].length)[0];
      main[0].forEach(c => add(c[1], c[0]));
    } else if (e.type === 'city') add(e.lat, e.lng);
    else if (e.type === 'route') (getEntryCoords(e) || []).forEach(c => add(c[0], c[1]));
  });
  if (minLat > maxLat) return { minLat: -55, maxLat: 75, minLng: -170, maxLng: 190 };
  const padLat = Math.max((maxLat - minLat) * 0.15, 2.5),
    padLng = Math.max((maxLng - minLng) * 0.15, 2.5);
  let b = { minLat: minLat - padLat, maxLat: maxLat + padLat, minLng: minLng - padLng, maxLng: maxLng + padLng };
  if (b.maxLat - b.minLat < 10) {
    const mid = (b.minLat + b.maxLat) / 2;
    b.minLat = mid - 5;
    b.maxLat = mid + 5;
  }
  b.minLat = Math.max(b.minLat, -70);
  b.maxLat = Math.min(b.maxLat, 82);
  return b;
}
// равнопромежуточная проекция с поправкой на широту: градус долготы на широте φ
// короче градуса широты; рамка расширяется до пропорций области на холсте
function recapProjector(b, x0, y0, x1, y1) {
  const midLat = (b.minLat + b.maxLat) / 2;
  const kx = Math.cos((midLat * Math.PI) / 180) || 1;
  let lngSpan = (b.maxLng - b.minLng) * kx,
    latSpan = b.maxLat - b.minLat;
  const w = x1 - x0,
    h = y1 - y0;
  if (lngSpan / latSpan > w / h) latSpan = (lngSpan * h) / w;
  else lngSpan = (latSpan * w) / h;
  const cLat = (b.minLat + b.maxLat) / 2,
    cLng = (b.minLng + b.maxLng) / 2;
  const s = w / lngSpan;
  return (lat, lng) => [x0 + w / 2 + (lng - cLng) * kx * s, y0 + h / 2 - (lat - cLat) * s];
}
// карта мест года в прямоугольнике
function drawRecapMap(ctx, entries, newCountries, x0, y0, x1, y1) {
  const proj = recapProjector(recapBounds(entries), x0, y0, x1, y1);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, x1 - x0, y1 - y0);
  ctx.clip();
  ctx.fillStyle = CARD.paper2;
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  drawWorldBaseOutlines(ctx, proj);
  const fresh = new Set(newCountries);
  entries
    .filter(e => e.type === 'country')
    .forEach(e => {
      const g = getCountryGeometry(e.countryKey);
      if (g) drawCountryGeometry(ctx, g, proj, fresh.has(e.countryKey) ? CARD.rust : e.color || DEFAULT_COLOR.country, false);
    });
  entries
    .filter(e => e.type === 'route')
    .forEach(e => {
      const brk = new Set(entryBreaks(e));
      ctx.beginPath();
      (getEntryCoords(e) || []).forEach((c, i) => {
        const [x, y] = proj(c[0], c[1]);
        if (i === 0 || brk.has(i)) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = e.color || DEFAULT_COLOR.route;
      ctx.lineWidth = isFlight(e) ? 2.5 : 3.5;
      ctx.lineCap = 'round';
      ctx.setLineDash(isFlight(e) ? [3, 10] : []);
      ctx.stroke();
      ctx.setLineDash([]);
    });
  const seen = new Set();
  getAllCityVisits(entries).forEach(c => {
    if (c.lat == null || c.lng == null) return;
    const k = c.name.trim().toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    const [x, y] = proj(c.lat, c.lng);
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fillStyle = c.color || DEFAULT_COLOR.city;
    ctx.fill();
    ctx.strokeStyle = CARD.paper;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  });
  ctx.restore();
  ctx.strokeStyle = CARD.line;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
}

// «Цифры» — прежняя картинка итогов
function drawRecapStatsCard(ctx, W, H, r, year) {
  drawCardFrame(ctx, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = CARD.ink;
  ctx.font = "italic 700 62px 'Twemoji Country Flags','Playfair Display'";
  ctx.fillText('Год в путешествиях', W / 2, 210);
  ctx.font = "italic 700 150px 'Twemoji Country Flags','Playfair Display'";
  ctx.fillStyle = CARD.rust;
  ctx.fillText(String(year), W / 2, 380);

  const cards = [
    [r.countries.length, 'стран'],
    [r.newCountries.length, 'впервые'],
    [r.cities.size, 'городов'],
    [r.trips.size, 'поездок'],
    [r.months.size, 'месяцев в пути'],
    [kmText(r.km), 'километров']
  ];
  let y = 520;
  for (let i = 0; i < cards.length; i += 2) {
    for (let j = 0; j < 2 && i + j < cards.length; j++) {
      const cx = j === 0 ? W * 0.29 : W * 0.71;
      ctx.fillStyle = CARD.ink;
      ctx.font = "italic 700 92px 'Twemoji Country Flags','Playfair Display'";
      ctx.fillText(String(cards[i + j][0]), cx, y);
      ctx.fillStyle = CARD.dim;
      ctx.font = "26px 'Twemoji Country Flags','EB Garamond'";
      ctx.fillText(cards[i + j][1], cx, y + 44);
    }
    y += 190;
  }

  const hi = [];
  if (r.longest) hi.push(['самый длинный маршрут', `${r.longest.name} · ${(r.longest.distanceKm || 0).toFixed(1)} км`]);
  if (r.gain > 0) hi.push(['набор высоты', `${Math.round(r.gain).toLocaleString('ru-RU')} м`]);
  if (r.flights) hi.push(['перелёты', `${r.flights} · ${Math.round(r.flightKm).toLocaleString('ru-RU')} км в воздухе`]);
  if (r.topCity) hi.push(['чаще всего', `${r.topCity[0]} · ${r.topCity[1]}`]);
  if (r.bestRun) hi.push(['лучший темп бега', formatPace(r.bestRun.durationMin / r.bestRun.distanceKm)]);
  // моря года: впервые увиденные — первыми; «море» в названиях опускаем, чтобы влезло больше
  if (r.seasYear.length) {
    const short = n => n.replace(/^море /, '').replace(/ море$/, '');
    const list = [...r.newSeas, ...r.seasYear.filter(n => !r.newSeas.includes(n))].map(short);
    hi.push([`моря и океаны · ${r.seasYear.length}` + (r.newSeas.length ? `, впервые ${r.newSeas.length}` : ''), list.join(', ')]);
  }

  y += 10;
  ctx.strokeStyle = CARD.line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(W * 0.18, y);
  ctx.lineTo(W * 0.82, y);
  ctx.stroke();
  y += 62;
  // до пяти строк: шаг ужимается, чтобы не наехать на подпись внизу
  const rows = hi.slice(0, 5);
  // строка морей может занять две строки — учитываем это в шаге
  const extra = rows.length && rows[rows.length - 1][0].startsWith('моря') ? 46 : 0;
  const step = Math.min(128, Math.floor((H - 150 - y - extra) / Math.max(1, rows.length)));
  rows.forEach(([label, value]) => {
    ctx.fillStyle = CARD.dim;
    ctx.font = "24px 'Twemoji Country Flags','Courier Prime'";
    ctx.fillText(label.toUpperCase(), W / 2, y);
    ctx.fillStyle = CARD.ink;
    ctx.font = "italic 700 38px 'Twemoji Country Flags','Playfair Display'";
    // длинное значение — в две строки по словам, дальше ужимаем с «…»
    const fit = t => {
      let v = t,
        m = ctx.measureText(v);
      while (m.width > W - 180 && v.length > 8) {
        v = v.slice(0, -4) + '…';
        m = ctx.measureText(v);
      }
      return v;
    };
    let lines = [value];
    if (ctx.measureText(value).width > W - 180) {
      const words = value.split(' ');
      let a = '';
      while (words.length && ctx.measureText((a ? a + ' ' : '') + words[0]).width <= W - 180) a = (a ? a + ' ' : '') + words.shift();
      lines = a ? [a, words.join(' ')] : [value];
    }
    lines.slice(0, 2).forEach((l, k) => ctx.fillText(fit(l), W / 2, y + 48 + k * 46));
    y += step + (lines.length > 1 ? 46 : 0);
  });
  drawCardFooter(ctx, W, H);
}

// «Карта» — вертикальная: заголовок, карта мест года, четыре числа, новые страны
function drawRecapMapCard(ctx, W, H, r, year) {
  drawCardFrame(ctx, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = CARD.rust;
  ctx.font = "italic 700 132px 'Twemoji Country Flags','Playfair Display'";
  ctx.fillText(String(year), W / 2, 230);
  ctx.fillStyle = CARD.ink;
  ctx.font = "italic 700 50px 'Twemoji Country Flags','Playfair Display'";
  ctx.fillText('год в путешествиях', W / 2, 305);
  drawRecapMap(ctx, recapEntriesOf(year), r.newCountries, 90, 370, W - 90, 1330);
  drawNumberRow(
    ctx,
    [
      [r.countries.length, 'стран'],
      [r.cities.size, 'городов'],
      [r.trips.size, 'поездок'],
      [kmText(r.km + (r.flightKm || 0)), 'км в пути']
    ],
    90,
    W - 90,
    1480,
    96
  );
  if (r.newCountries.length) {
    ctx.fillStyle = CARD.dim;
    ctx.font = "24px 'Twemoji Country Flags','Courier Prime'";
    ctx.fillText(`ВПЕРВЫЕ · ${r.newCountries.length}`, W / 2, 1610);
    ctx.fillStyle = CARD.ink;
    ctx.font = "italic 700 36px 'Twemoji Country Flags','Playfair Display'";
    let line = r.newCountries.map(k => COUNTRY_RU[k] || k).join(', ');
    while (ctx.measureText(line).width > W - 180 && line.length > 8) line = line.slice(0, -4) + '…';
    ctx.fillText(line, W / 2, 1662);
  }
  drawCardFooter(ctx, W, H);
}

// «Квадрат» — под пост: год слева сверху, три числа справа, ниже карта
function drawRecapSquareCard(ctx, W, H, r, year) {
  drawCardFrame(ctx, W, H);
  ctx.textAlign = 'left';
  ctx.fillStyle = CARD.rust;
  ctx.font = "italic 700 120px 'Twemoji Country Flags','Playfair Display'";
  ctx.fillText(String(year), 90, 190);
  ctx.fillStyle = CARD.dim;
  ctx.font = "italic 34px 'Twemoji Country Flags','Playfair Display'";
  ctx.fillText('год в путешествиях', 94, 240);
  drawNumberRow(
    ctx,
    [
      [r.countries.length, 'стран'],
      [r.cities.size, 'городов'],
      [kmText(r.km + (r.flightKm || 0)), 'км']
    ],
    560,
    W - 90,
    170,
    64
  );
  drawRecapMap(ctx, recapEntriesOf(year), r.newCountries, 90, 290, W - 90, H - 140);
  ctx.textAlign = 'center';
  ctx.fillStyle = CARD.dim;
  ctx.font = "italic 26px 'Twemoji Country Flags','Playfair Display'";
  ctx.fillText('Карта путешествий', W / 2, H - 78);
}

// холст выбранного шаблона; null — данных за год нет
async function renderRecapCard(year, key) {
  const r = computeRecap(year);
  if (!r.entries) return null;
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  const t = RECAP_TEMPLATES.find(x => x.key === key) || RECAP_TEMPLATES[0];
  const cv = document.createElement('canvas');
  cv.width = t.w;
  cv.height = t.h;
  const ctx = cv.getContext('2d');
  if (t.key === 'map') drawRecapMapCard(ctx, t.w, t.h, r, year);
  else if (t.key === 'square') drawRecapSquareCard(ctx, t.w, t.h, r, year);
  else drawRecapStatsCard(ctx, t.w, t.h, r, year);
  return cv;
}
const canvasBlob = cv => new Promise(res => cv.toBlob(res, 'image/png'));

// окно итогов: выбор шаблона, предпросмотр, «Поделиться» и «Скачать»
function renderRecapTemplates() {
  const box = document.getElementById('recapTemplates');
  box.innerHTML = '';
  RECAP_TEMPLATES.forEach(t => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (t.key === recapTemplate ? ' active' : '');
    b.dataset.template = t.key;
    b.setAttribute('aria-pressed', t.key === recapTemplate ? 'true' : 'false');
    b.textContent = t.ru;
    b.addEventListener('click', () => {
      recapTemplate = t.key;
      try {
        localStorage.setItem(RECAP_TEMPLATE_KEY, t.key);
      } catch (e) {
        /* не запомнится — не страшно */
      }
      renderRecapTemplates();
      updateRecapPreview();
    });
    box.appendChild(b);
  });
}
let recapPreviewSeq = 0,
  recapPreviewUrl = null;
async function updateRecapPreview() {
  const seq = ++recapPreviewSeq;
  const img = document.getElementById('recapPreview');
  const year = parseInt(document.getElementById('recapYear').value, 10);
  const cv = year ? await renderRecapCard(year, recapTemplate) : null;
  if (seq !== recapPreviewSeq) return;
  if (recapPreviewUrl) URL.revokeObjectURL(recapPreviewUrl);
  recapPreviewUrl = null;
  if (!cv) {
    img.hidden = true;
    return;
  }
  const blob = await canvasBlob(cv);
  if (seq !== recapPreviewSeq || !blob) return;
  recapPreviewUrl = URL.createObjectURL(blob);
  img.src = recapPreviewUrl;
  img.className = 'recap-preview' + (recapTemplate === 'square' ? ' is-square' : '');
  img.alt = `Итоги ${year} года — ${(RECAP_TEMPLATES.find(t => t.key === recapTemplate) || {}).ru || ''}`;
  img.hidden = false;
}
// можно ли отдать файл в системное меню «Поделиться» (телефоны, часть браузеров на компьютере)
function canShareImage() {
  try {
    return !!(navigator.canShare && navigator.canShare({ files: [new File([new Uint8Array(1)], 'x.png', { type: 'image/png' })] }));
  } catch (e) {
    return false;
  }
}
async function recapCardFile() {
  const year = parseInt(document.getElementById('recapYear').value, 10);
  const cv = year ? await renderRecapCard(year, recapTemplate) : null;
  if (!cv) {
    toast('За этот год отметок нет');
    return null;
  }
  const blob = await canvasBlob(cv);
  if (!blob) {
    toast('Не удалось создать картинку');
    return null;
  }
  return new File([blob], `travel-map-${year}-${recapTemplate}.png`, { type: 'image/png' });
}
document.getElementById('recapDownload').addEventListener('click', async () => {
  const file = await recapCardFile();
  if (!file) return;
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Картинка сохранена');
});
document.getElementById('recapShare').addEventListener('click', async () => {
  const file = await recapCardFile();
  if (!file) return;
  try {
    await navigator.share({ files: [file], title: 'Год в путешествиях' });
  } catch (e) {
    // закрыли меню — это не ошибка
    if (e && e.name !== 'AbortError') toast('Не получилось поделиться — скачайте картинку');
  }
});
