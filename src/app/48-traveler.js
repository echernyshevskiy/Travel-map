// ---------- тип путешественника ----------
// Шуточный портрет по всем посещённым записям (фильтры не учитываются — это
// портрет целиком). Расчёт — в src/lib/traveler.js, здесь только показ.
function renderTraveler(){
  const body = document.getElementById('travelerBody');
  const p = travelerProfile(allEntries, {
    homeKey: HOME_COUNTRY_KEY,
    continentOf: k => COUNTRY_CONTINENT[k] || null,
    regionsVisited: ruRegionsState && ruRegionsState.visited ? ruRegionsState.visited.size : 0,
    races: (races || []).filter(r => raceStatus(r) !== 'upcoming').length,
  });
  if(!p){ body.innerHTML = '<div class="hint">Отметьте хотя бы три места — и портрет появится.</div>'; return; }
  const f = p.facts;
  const pos = v => ((v + 1) / 2 * 100).toFixed(1);
  const facts = [
    f.favoriteSeason ? ['любимое время', seasonLabel(f.favoriteSeason)] : null,
    f.favoriteMonth ? ['чаще всего в дороге', MONTHS_IN[f.favoriteMonth - 1]] : null,
    f.busiestYear ? ['самый насыщенный год', `${f.busiestYear.year} · ${f.busiestYear.count} ${pluralRecords(f.busiestYear.count)}`] : null,
    f.trips ? ['поездка в среднем', `${String(f.avgTripDays).replace('.', ',')} ${daysWord(Math.round(f.avgTripDays))}`] : null,
    f.longestTrip ? ['самая долгая', `${f.longestTrip} ${daysWord(f.longestTrip)}`] : null,
    ['за границей', `${f.countries} ${pluralCountries(f.countries)} · ${f.continents} ${pluralContinents(f.continents)}`],
  ].filter(Boolean);
  body.innerHTML = `
    <div class="tt-card">
      <div class="tt-kicker">ваш тип путешественника</div>
      <div class="tt-title">${escapeHtml(p.title)}</div>
      <div class="tt-text">${escapeHtml(p.text)}</div>
      ${p.tags.length ? `<div class="tt-tags">а ещё немного — ${p.tags.map(t => `<span>${escapeHtml(t.title)}</span>`).join(' и ')}</div>` : ''}
    </div>
    <div class="tt-axes">${p.axes.map(a => `
      <div class="tt-axis" data-axis="${a.id}"><span class="tt-l">${escapeHtml(a.left)}</span>
        <div class="tt-track"><i style="left:${pos(a.value)}%;"></i></div><span class="tt-r">${escapeHtml(a.right)}</span></div>`).join('')}
    </div>
    <div class="tt-facts">${facts.map(([k, v]) => `<div><small>${escapeHtml(k)}</small><b>${escapeHtml(v)}</b></div>`).join('')}</div>
    <div class="hint" style="margin-top:14px;">Портрет — по всем посещённым отметкам, без учёта фильтров и планов. Это шутка, а не диагноз.</div>`;
}
const MONTHS_IN = ['в январе', 'в феврале', 'в марте', 'в апреле', 'в мае', 'в июне', 'в июле', 'в августе', 'в сентябре', 'в октябре', 'в ноябре', 'в декабре'];
const pluralRecords = n => { const t = n % 10, h = n % 100; return h >= 11 && h <= 14 ? 'отметок' : t === 1 ? 'отметка' : t >= 2 && t <= 4 ? 'отметки' : 'отметок'; };
const pluralCountries = n => { const t = n % 10, h = n % 100; return h >= 11 && h <= 14 ? 'стран' : t === 1 ? 'страна' : t >= 2 && t <= 4 ? 'страны' : 'стран'; };
const pluralContinents = n => { const t = n % 10, h = n % 100; return h >= 11 && h <= 14 ? 'континентов' : t === 1 ? 'континент' : t >= 2 && t <= 4 ? 'континента' : 'континентов'; };
document.getElementById('openTravelerBtn').addEventListener('click', () => {
  const menu = document.getElementById('summaryMenu'); if(menu) menu.style.display = 'none';
  renderTraveler();
  document.getElementById('travelerModal').style.display = 'flex';
});
document.getElementById('closeTravelerModal').addEventListener('click', () => { document.getElementById('travelerModal').style.display = 'none'; });
document.getElementById('travelerModal').addEventListener('click', e => { if(e.target.id === 'travelerModal') e.target.style.display = 'none'; });
