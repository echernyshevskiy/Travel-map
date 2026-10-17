// ---------- «Бег»: рекорды, медали, прогрессия, календарь ----------
const RUN_DISTS = [
  { key: '5',  label: '5 км',        km: 5,       lo: 4.8,  hi: 5.4,  tone: 'bronze' },
  { key: '10', label: '10 км',       km: 10,      lo: 9.6,  hi: 10.7, tone: 'silver' },
  { key: '21', label: 'Полумарафон', km: 21.0975, lo: 20.6, hi: 21.7, tone: 'gold' },
  { key: '42', label: 'Марафон',     km: 42.195,  lo: 41.5, hi: 43.2, tone: 'royal' }
];
const RUN_TONE_COLORS = { bronze: '#B0703C', silver: '#8D9496', gold: '#C9A227', royal: '#A6592E', other: '#6E7F6A' };
function runDistOf(km){ return RUN_DISTS.find(d => km >= d.lo && km <= d.hi) || null; }
function raceDateObj(r){ return r.date ? new Date(r.date + 'T12:00:00') : null; }
// Все результаты: официальные старты (время с протокола) и пробежки по трекам
// (время в движении, шоссе — трейлы по темпу несравнимы)
function runPerformances(){
  const out = [];
  races.filter(r => raceStatus(r) === 'done').forEach(r => {
    const min = parseRaceTime(r.time), d = raceDateObj(r);
    if(!min || !r.distanceKm || !d || isNaN(d)) return;
    out.push({ src: 'race', id: r.id, name: r.name || 'Старт', date: d, km: r.distanceKm, min, pace: min / r.distanceKm,
      share: raceShare(r), place: r.place, participants: r.participants, city: r.city, dist: runDistOf(r.distanceKm) });
  });
  getRuns().forEach(e => {
    if(!e.durationMin || !e.distanceKm || !e.year || e.terrain === 'trail') return;
    out.push({ src: 'track', id: e.id, name: e.name, date: new Date(e.year, (e.month || 6) - 1, 15, 12), km: e.distanceKm, min: e.durationMin,
      pace: e.durationMin / e.distanceKm, dist: runDistOf(e.distanceKm), approxDate: !e.month });
  });
  return out.sort((a, b) => a.date - b.date);
}
// Рекорды по дистанциям: официальные старты главнее треков — у трека время
// «в движении» и дистанция по GPS. Трек идёт в зачёт, только если стартов на дистанции нет.
function runPBs(perfs){
  const res = {};
  RUN_DISTS.forEach(d => {
    const all = perfs.filter(p => p.dist === d);
    const pool = all.some(p => p.src === 'race') ? all.filter(p => p.src === 'race') : all;
    // время приводим к точной дистанции по темпу: 10,0 и 9,9 км сравнимы
    let best = null, prev = null;
    pool.forEach(p => {
      const t = p.pace * d.km;
      // показываем настоящее время старта; к ровной дистанции пересчитываем только для сравнения и для треков
      if(!best || t < best.t - 1e-9){ prev = best; best = { ...p, t, shown: p.src === 'race' ? p.min : t }; }
    });
    res[d.key] = { d, best, prev, count: all.length, pool };
  });
  return res;
}
// Прогноз по формуле Ригеля T2 = T1 · (D2/D1)^1.06 — от лучшего свежего результата (2 года)
function riegelPredict(perfs, km){
  const since = Date.now() - 730 * 86400000;
  let best = null;
  perfs.filter(p => p.src === 'race' && p.date.getTime() >= since && p.km >= 3).forEach(p => {
    const t = p.min * Math.pow(km / p.km, 1.06);
    if(!best || t < best.t) best = { t, from: p };
  });
  return best;
}
const fmtRunDate = d => d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });

function renderRunHero(perfs){
  const runs = getRuns();
  const done = races.filter(r => raceStatus(r) === 'done');
  const totalKm = runs.reduce((s, r) => s + (r.distanceKm || 0), 0);
  const totalMin = runs.reduce((s, r) => s + (r.durationMin || 0), 0);
  const totalGain = runs.reduce((s, r) => s + (r.elevationGain || 0), 0);
  const raceKm = done.reduce((s, r) => s + (r.distanceKm || 0), 0);
  const tiles = [];
  if(runs.length) tiles.push([totalKm >= 100 ? Math.round(totalKm) : totalKm.toFixed(1), 'км по трекам']);
  if(done.length) tiles.push([done.length, done.length === 1 ? 'старт' : done.length < 5 ? 'старта' : 'стартов']);
  if(done.length) tiles.push([Math.round(raceKm), 'км на стартах']);
  if(runs.length) tiles.push([runs.length, 'пробежек']);
  if(totalMin) tiles.push([Math.floor(totalMin / 60) + ' ч', 'в движении']);
  if(totalGain) tiles.push([Math.round(totalGain).toLocaleString('ru-RU'), 'м набора']);
  document.getElementById('runTotals').innerHTML = tiles.map(([v, l]) => `<div class="tp-stat"><b>${escapeHtml(String(v))}</b><span>${escapeHtml(l)}</span></div>`).join('');
  // ближайший старт: обратный отсчёт, рекорд на этой дистанции и прогноз
  const next = races.filter(r => raceStatus(r) === 'upcoming' && r.date && daysUntil(r.date) >= 0)
                    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const box = document.getElementById('runNext');
  if(!next){ box.innerHTML = ''; return; }
  const left = daysUntil(next.date);
  const d = next.distanceKm ? runDistOf(next.distanceKm) : null;
  const pb = d ? runPBs(perfs)[d.key].best : null;
  const pred = next.distanceKm ? riegelPredict(perfs, next.distanceKm) : null;
  const lines = [];
  if(pb) lines.push(`Рекорд на дистанции — <b>${formatRaceTime(pb.shown)}</b> (${formatPace(pb.pace)}), ${escapeHtml(pb.name)}. Чтобы побить — быстрее ${formatPace(pb.pace)}.`);
  if(pred) lines.push(`Прогноз по лучшему свежему старту — <b>${formatRaceTime(pred.t)}</b> (${formatPace(pred.t / next.distanceKm)}).`);
  box.innerHTML = `<div class="run-next">
    <div class="run-next-days">${left}<small>${left === 0 ? 'сегодня' : daysWord(left)}</small></div>
    <div class="run-next-body"><b>${escapeHtml(next.name || 'Старт')}</b> · ${next.distanceKm ? next.distanceKm.toFixed(1) + ' км' : ''} · ${escapeHtml(fmtRunDate(raceDateObj(next)))}
      ${lines.map(l => `<div class="hint">${l}</div>`).join('')}</div></div>`;
}

function renderRunPBs(perfs){
  const pbs = runPBs(perfs);
  document.getElementById('runPBs').innerHTML = RUN_DISTS.map(d => {
    const { best, prev, count } = pbs[d.key];
    if(!best){
      const pred = riegelPredict(perfs, d.km);
      return `<div class="pb-card"><div class="pb-dist">${d.label}</div><div class="pb-time">—</div>
        ${pred ? `<div class="pb-pred">прогноз ≈ ${formatRaceTime(pred.t)} · ${formatPace(pred.t / d.km)}</div>` : `<div class="pb-pred">ещё не бегали</div>`}</div>`;
    }
    const delta = prev ? best.t - prev.t : null;
    return `<div class="pb-card has-pb"><div class="pb-dist">${d.label}${count > 1 ? ` · попыток ${count}` : ''}</div>
      <div class="pb-time">${formatRaceTime(best.shown)}</div>
      <div class="pb-pace">${formatPace(best.pace)}</div>
      <div class="pb-meta">${escapeHtml(best.name)}<br>${best.approxDate ? best.date.getFullYear() : escapeHtml(fmtRunDate(best.date))}${best.src === 'track' ? ' · по треку' : ''}</div>
      ${delta != null ? `<span class="pb-delta" title="К предыдущему рекорду: ${formatRaceTime(prev.shown)}">${fmtDelta(delta)} к прошлому</span>` : ''}</div>`;
  }).join('');
}

function medalSvg(i, tone, label, opts){
  const c = RUN_TONE_COLORS[tone] || RUN_TONE_COLORS.other;
  const up = opts && opts.upcoming;
  const ribbonL = up ? 'none' : '#A6592E', ribbonR = up ? 'none' : '#3F5240';
  return `<svg viewBox="0 0 64 84" aria-hidden="true">
    <defs><radialGradient id="mg${i}" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".45" stop-color="${c}"/><stop offset="1" stop-color="${c}" stop-opacity=".85"/></radialGradient></defs>
    <path d="M16 0h13l9 30h-13z" fill="${ribbonL}" stroke="${up ? 'var(--line)' : 'none'}" stroke-dasharray="${up ? '3 3' : ''}"/>
    <path d="M48 0H35l-9 30h13z" fill="${ribbonR}" stroke="${up ? 'var(--line)' : 'none'}" stroke-dasharray="${up ? '3 3' : ''}"/>
    <circle cx="32" cy="55" r="25" fill="${up ? 'none' : `url(#mg${i})`}" stroke="${up ? 'var(--text-dim)' : 'rgba(60,40,10,.45)'}" stroke-width="${up ? 1.5 : 1}" stroke-dasharray="${up ? '4 3' : ''}"/>
    <circle cx="32" cy="55" r="19.5" fill="none" stroke="${up ? 'none' : 'rgba(255,255,255,.45)'}" stroke-width="1"/>
    <text x="32" y="${label.length > 3 ? 59 : 61}" text-anchor="middle" font-family="Playfair Display, serif" font-style="italic" font-weight="700" font-size="${label.length > 3 ? 13 : 17}" fill="${up ? 'var(--text-dim)' : '#2B2416'}">${escapeHtml(label)}</text>
    ${opts && opts.pb ? `<text x="51" y="36" text-anchor="middle" font-size="12" fill="#C9A227" stroke="#5A4510" stroke-width=".4">★</text>` : ''}
  </svg>`;
}
function renderRunMedals(perfs){
  const pbs = runPBs(perfs);
  const pbIds = new Set(Object.values(pbs).map(x => x.best && x.best.src === 'race' ? x.best.id : null).filter(Boolean));
  const runs = getRuns();
  const done = races.filter(r => raceStatus(r) === 'done').sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const upcoming = races.filter(r => raceStatus(r) === 'upcoming').sort((a, b) => String(a.date || '9').localeCompare(String(b.date || '9')));
  // трек того же старта: тот же месяц и близкая дистанция — по нему можно показать забег на карте
  const trackFor = r => {
    const d = raceDateObj(r);
    if(!d || !r.distanceKm) return null;
    return runs.find(e => e.year === d.getFullYear() && e.month === d.getMonth() + 1 && e.distanceKm && Math.abs(e.distanceKm - r.distanceKm) / r.distanceKm < 0.25) || null;
  };
  const label = km => { const d = runDistOf(km || 0); return d ? (d.key === '21' ? '21.1' : d.key === '42' ? '42.2' : d.key) : (km ? (Math.round(km * 10) / 10).toString().replace('.0', '') : '?'); };
  let i = 0;
  const cards = [];
  upcoming.forEach(r => {
    const left = daysUntil(r.date);
    cards.push(`<div class="medal upcoming">${medalSvg(i++, 'other', label(r.distanceKm), { upcoming: true })}
      <div class="medal-name">${escapeHtml(r.name || 'Старт')}</div>
      <div class="medal-meta">${left == null ? 'дата не указана' : left < 0 ? 'впишите результат' : left === 0 ? 'сегодня' : `через ${left} ${daysWord(left)}`}</div></div>`);
  });
  done.forEach(r => {
    const d = runDistOf(r.distanceKm || 0);
    const min = parseRaceTime(r.time);
    const sh = raceShare(r);
    const track = trackFor(r);
    const date = raceDateObj(r);
    cards.push(`<div class="medal${track ? ' clickable' : ''}" ${track ? `data-medal-track="${escapeAttr(track.id)}" title="Показать трек на карте"` : ''}>
      ${medalSvg(i++, d ? d.tone : 'other', label(r.distanceKm), { pb: pbIds.has(r.id) })}
      <div class="medal-name">${escapeHtml(r.name || 'Старт')}</div>
      <div class="medal-meta">${date ? escapeHtml(fmtRunDate(date)) : ''}${min ? `<br>${formatRaceTime(min)}` : ''}${sh != null ? ` · <b>топ ${sh < 1 ? sh.toFixed(1) : Math.round(sh)}%</b>` : ''}</div></div>`);
  });
  const box = document.getElementById('runMedals');
  box.innerHTML = cards.length ? cards.join('') : `<div class="hint">Добавьте официальные старты ниже — здесь появятся медали.</div>`;
}

let runProgMode = 'pace';
const SVG_TIP = 'title'; // всплывающая подсказка точки; тег собираем так, чтобы сборка не путала его с заголовком страницы
function renderRunProgress(perfs){
  const box = document.getElementById('runProgress');
  const share = runProgMode === 'share';
  const pts = share ? perfs.filter(p => p.src === 'race' && p.share != null).map(p => ({ ...p, y: 100 - p.share }))
                    : perfs.map(p => ({ ...p, y: p.pace }));
  if(pts.length < 2){ box.innerHTML = `<div class="hint">${share ? 'Нужно хотя бы два старта с местом и числом участников.' : 'Нужно хотя бы два результата со временем.'}</div>`; return; }
  const W = Math.max(280, Math.min(760, (box.clientWidth || 600))), H = 210, L0 = 46, R0 = 10, T0 = 12, B0 = 26;
  const xs = pts.map(p => p.date.getTime());
  let x0 = Math.min(...xs), x1 = Math.max(...xs);
  if(x1 - x0 < 60 * 86400000){ x0 -= 30 * 86400000; x1 += 30 * 86400000; }
  const ys = pts.map(p => p.y);
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  const padY = (y1 - y0) * 0.15 || (share ? 5 : 0.2);
  y0 -= padY; y1 += padY;
  if(share){ y0 = Math.max(0, y0); y1 = Math.min(100, y1); }
  const X = t => L0 + (t - x0) / (x1 - x0) * (W - L0 - R0);
  // темп: быстрее — выше; «обогнал»: больше — выше
  const Y = v => share ? T0 + (y1 - v) / (y1 - y0) * (H - T0 - B0) : T0 + (v - y0) / (y1 - y0) * (H - T0 - B0);
  const ticks = [];
  for(let k = 0; k <= 3; k++){
    const v = y0 + (y1 - y0) * k / 3;
    ticks.push(`<line x1="${L0}" x2="${W - R0}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="var(--line)" stroke-dasharray="2 4"/>
      <text class="axis" x="${L0 - 6}" y="${(Y(v) + 3).toFixed(1)}" text-anchor="end">${share ? Math.round(v) + '%' : formatPace(v).replace(' /км', '')}</text>`);
  }
  const yearTicks = [];
  for(let yv = new Date(x0).getFullYear(); yv <= new Date(x1).getFullYear() + 1; yv++){
    const t = new Date(yv, 0, 1).getTime();
    if(t < x0 || t > x1) continue;
    yearTicks.push(`<line x1="${X(t).toFixed(1)}" x2="${X(t).toFixed(1)}" y1="${T0}" y2="${H - B0}" stroke="var(--line)"/>
      <text class="axis" x="${(X(t) + 3).toFixed(1)}" y="${H - 8}">${yv}</text>`);
  }
  // линия тренда (МНК) и её смысл одной фразой
  const n = pts.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0, sxy = 0;
  pts.forEach(p => { sxx += (p.date.getTime() - mx) ** 2; sxy += (p.date.getTime() - mx) * (p.y - my); });
  const k = sxx ? sxy / sxx : 0;
  const tY = t => my + k * (t - mx);
  const trend = `<line x1="${X(x0)}" x2="${X(x1)}" y1="${Y(tY(x0)).toFixed(1)}" y2="${Y(tY(x1)).toFixed(1)}" stroke="var(--amber)" stroke-width="1.5" stroke-dasharray="6 4" opacity=".8"/>`;
  const perYear = k * 365 * 86400000;
  const pbs = runPBs(perfs);
  const pbKeys = new Set(Object.values(pbs).map(x => x.best && (x.best.src + x.best.id)).filter(Boolean));
  const dots = pts.map(p => {
    const c = p.dist ? RUN_TONE_COLORS[p.dist.tone] : RUN_TONE_COLORS.other;
    const isPb = pbKeys.has(p.src + p.id);
    const tip = `${p.name} · ${p.approxDate ? p.date.getFullYear() : fmtRunDate(p.date)} · ${p.km.toFixed(1)} км · ${formatRaceTime(p.min)} · ${formatPace(p.pace)}${p.share != null ? ` · топ ${Math.round(p.share)}%` : ''}${p.src === 'track' ? ' (по треку)' : ''}`;
    return `<g><${SVG_TIP}>${escapeHtml(tip)}</${SVG_TIP}>${isPb ? `<circle cx="${X(p.date.getTime()).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="8.5" fill="none" stroke="#C9A227" stroke-width="1.5"/>` : ''}
      <circle cx="${X(p.date.getTime()).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="${p.src === 'race' ? 5.5 : 4}" fill="${p.src === 'race' ? c : 'var(--panel)'}" stroke="${c}" stroke-width="${p.src === 'race' ? 1 : 2}"/></g>`;
  }).join('');
  const caption = share
    ? (Math.abs(perYear) < 1 ? 'Доля обогнанных держится на одном уровне.' : `Тренд: ${perYear > 0 ? 'обгоняете больше' : 'обгоняете меньше'} — на ${Math.abs(perYear).toFixed(0)} п.п. в год.`)
    : (Math.abs(perYear) < 1 / 60 ? 'Темп стабилен.' : `Тренд: темп ${perYear < 0 ? 'быстрее' : 'медленнее'} на ${fmtDelta(perYear).slice(1)} /км в год.`);
  const used = new Set(pts.map(p => p.dist ? p.dist.key : 'other'));
  const legend = [...RUN_DISTS.filter(d => used.has(d.key)).map(d => `<span><i style="background:${RUN_TONE_COLORS[d.tone]}"></i>${d.label}</span>`),
    used.has('other') ? `<span><i style="background:${RUN_TONE_COLORS.other}"></i>другие</span>` : '',
    share ? '' : `<span><i style="background:var(--panel);border:2px solid var(--text-dim);width:7px;height:7px;"></i>по треку</span>`,
    `<span><i style="background:none;border:1.5px solid #C9A227;"></i>рекорд</span>`].join('');
  box.innerHTML = `<div class="run-prog"><svg viewBox="0 0 ${W} ${H}" height="${H}">${ticks.join('')}${yearTicks.join('')}${trend}${dots}</svg>
    <div class="run-prog-legend">${legend}</div><div class="run-cal-note">${caption} ${share ? 'Выше — больше участников позади.' : 'Выше — быстрее.'}</div></div>`;
}

function renderRunCalendar(){
  const runs = getRuns();
  const done = races.filter(r => raceStatus(r) === 'done');
  const cells = new Map(); // 'год-месяц' → { km, n, race }
  const cell = (y, m) => { const k = y + '-' + m; if(!cells.has(k)) cells.set(k, { km: 0, n: 0, race: [] }); return cells.get(k); };
  runs.forEach(e => { if(!e.year || !e.month) return; const c = cell(e.year, e.month); c.km += e.distanceKm || 0; c.n++; });
  done.forEach(r => {
    const d = raceDateObj(r);
    if(!d) return;
    const c = cell(d.getFullYear(), d.getMonth() + 1);
    c.race.push(r.name || 'старт');
    // старт без трека — его километры тоже в календаре, но без двойного счёта
    const has = runs.some(e => e.year === d.getFullYear() && e.month === d.getMonth() + 1 && e.distanceKm && r.distanceKm && Math.abs(e.distanceKm - r.distanceKm) / r.distanceKm < 0.25);
    if(!has && r.distanceKm){ c.km += r.distanceKm; c.n++; }
  });
  const box = document.getElementById('runCalendar');
  if(!cells.size){ box.innerHTML = `<div class="hint">Пробежек с датой пока нет.</div>`; return; }
  const years = [...new Set([...cells.keys()].map(k => +k.split('-')[0]))].sort((a, b) => b - a);
  const maxKm = Math.max(...[...cells.values()].map(c => c.km), 1);
  const MON = ['я','ф','м','а','м','и','и','а','с','о','н','д'];
  let html = `<div class="run-cal"><span></span>${MON.map(m => `<span class="rc-m">${m}</span>`).join('')}<span class="rc-m" style="text-align:right;">км</span>`;
  years.forEach(y => {
    let tot = 0;
    html += `<span class="rc-y">${y}</span>`;
    for(let m = 1; m <= 12; m++){
      const c = cells.get(y + '-' + m);
      if(!c){ html += `<span class="rc-c" title="${monthLabel(m) || m} ${y}: пробежек нет"></span>`; continue; }
      tot += c.km;
      const a = 0.18 + 0.82 * Math.min(1, c.km / maxKm);
      const tip = `${monthLabel(m) || m} ${y}: ${c.n} ${c.n === 1 ? 'пробежка' : c.n < 5 ? 'пробежки' : 'пробежек'}, ${c.km.toFixed(1)} км${c.race.length ? ' · старты: ' + c.race.join(', ') : ''}`;
      html += `<span class="rc-c${c.race.length ? ' medal-m' : ''}" style="background:rgba(63,82,64,${a.toFixed(2)});border-color:rgba(63,82,64,${Math.min(1, a + .1).toFixed(2)});" title="${escapeAttr(tip)}">${Math.round(c.km)}</span>`;
    }
    html += `<span class="rc-t">${Math.round(tot)}</span>`;
  });
  html += `</div><div class="run-cal-note">Чем темнее клетка — тем больше километров за месяц; золотая точка — месяц со стартом. Наведите или нажмите на клетку, чтобы увидеть подробности.</div>`;
  box.innerHTML = html;
}

function renderRunExtras(){
  const perfs = runPerformances();
  renderRunHero(perfs);
  renderRunPBs(perfs);
  renderRunMedals(perfs);
  renderRunProgress(perfs);
  renderRunCalendar();
}
document.getElementById('runProgToggle').addEventListener('click', e => {
  const b = e.target.closest('[data-prog]');
  if(!b) return;
  runProgMode = b.dataset.prog;
  document.querySelectorAll('#runProgToggle [data-prog]').forEach(x => x.setAttribute('aria-selected', String(x === b)));
  renderRunProgress(runPerformances());
});
document.getElementById('runMedals').addEventListener('click', e => {
  const m = e.target.closest('[data-medal-track]');
  if(!m) return;
  const entry = allEntries.find(x => x.id === m.dataset.medalTrack);
  if(!entry) return;
  document.getElementById('runningModal').style.display = 'none';
  focusEntry(entry);
});
// клик по клетке календаря на телефоне — подсказка тостом (title там не показывается)
document.getElementById('runCalendar').addEventListener('click', e => {
  const c = e.target.closest('.rc-c[title]');
  if(c) toast(c.getAttribute('title'));
});

function renderRunning(){
  const runs = getRuns();
  const summary = document.getElementById('runningSummary');
  const list = document.getElementById('runList');

  // Старты ведутся вручную и от маршрутов не зависят: у забега может не быть
  // трека вовсе. Раньше ранний выход пропускал их отрисовку, и при отсутствии
  // маршрутов таблицы стартов не появлялись.
  renderRaces();

  if(runs.length === 0){
    summary.textContent = races.length
      ? `Стартов записано: ${races.length} · беговых маршрутов пока нет`
      : 'Беговых маршрутов пока нет';
    list.innerHTML = `<div class="hint">Загрузите GPX с пробежкой — здесь появятся темп, дистанции и история забегов.</div>`;
    renderBestPaces([]);
    renderRunExtras();
    return;
  }

  const totalKm = runs.reduce((s,r) => s + (r.distanceKm || 0), 0);
  const totalGain = runs.reduce((s,r) => s + (r.elevationGain || 0), 0);
  const totalMin = runs.reduce((s,r) => s + (r.durationMin || 0), 0);
  const road = runs.filter(r => r.terrain === 'road');
  const trail = runs.filter(r => r.terrain === 'trail');
  const longest = runs.slice().sort((a,b)=>(b.distanceKm||0)-(a.distanceKm||0))[0];
  const timed = runs.filter(r => r.durationMin && r.distanceKm);
  const fastest = timed.slice().sort((a,b)=>(a.durationMin/a.distanceKm)-(b.durationMin/b.distanceKm))[0];
  const years = [...new Set(runs.map(r => r.year).filter(Boolean))].sort((a,b)=>a-b);

  summary.textContent = `Забегов: ${runs.length}` +
    (years.length ? ` · ${years[0] === years[years.length-1] ? years[0] : years[0] + '–' + years[years.length-1]}` : '');

  const hours = Math.floor(totalMin / 60);
  const cards = [
    ['Всего пробегано', `${totalKm.toFixed(1)} км`],
    ['Забегов', String(runs.length)],
    ['Шоссе / трейл', `${road.length} / ${trail.length}`],
    ['Набор высоты', `${Math.round(totalGain).toLocaleString('ru-RU')} м`],
  ];
  if(totalMin > 0) cards.push(['Время в движении', hours >= 1 ? `${hours} ч ${Math.round(totalMin % 60)} мин` : `${Math.round(totalMin)} мин`]);
  if(fastest) cards.push(['Лучший темп', formatPace(fastest.durationMin / fastest.distanceKm)]);
  if(longest) cards.push(['Самый длинный', `${(longest.distanceKm||0).toFixed(1)} км`]);
  void cards; // сводные цифры теперь плитками сверху (renderRunHero)

  // список забегов от свежих к старым
  const sorted = runs.slice().sort((a,b)=>(b.year||0)-(a.year||0) || (b.month||0)-(a.month||0) || (b.dateFrom || '').localeCompare(a.dateFrom || ''));
  list.innerHTML = sorted.map(r=>{
    const pace = (r.durationMin && r.distanceKm) ? formatPace(r.durationMin / r.distanceKm) : null;
    const meta = [
      `${escapeHtml(whenLabel(r))}`.trim(),
      `${(r.distanceKm||0).toFixed(1)} км`,
      pace,
      r.terrain === 'trail' ? 'трейл' : r.terrain === 'road' ? 'шоссе' : null,
      (r.elevationGain != null && r.elevationGain > 0) ? `+${Math.round(r.elevationGain)} м` : null,
    ].filter(Boolean).join(' · ');
    return `<div class="diag-row" data-run-id="${escapeAttr(r.id)}" style="cursor:pointer;">
      ${escapeHtml(r.name)}<div class="diag-row-meta">${escapeHtml(meta)}</div>
    </div>`;
  }).join('');

  renderBestPaces(allEntries.filter(e => e.status !== 'wishlist'));
  renderRunExtras();
}

document.getElementById('openRunningBtn').addEventListener('click', ()=>{
  document.getElementById('runningModal').style.display = 'flex';
  renderRunning();
});
document.getElementById('closeRunningModal').addEventListener('click', ()=>{
  document.getElementById('runningModal').style.display = 'none';
});
document.getElementById('runningModal').addEventListener('click', (e)=>{
  if(e.target.id === 'runningModal') document.getElementById('runningModal').style.display = 'none';
});
// клик по забегу — закрыть окно и показать маршрут на карте
document.getElementById('runList').addEventListener('click', (ev)=>{
  const row = ev.target.closest('[data-run-id]');
  if(!row) return;
  const entry = allEntries.find(e => e.id === row.dataset.runId);
  if(!entry) return;
  document.getElementById('runningModal').style.display = 'none';
  focusEntry(entry);
});

