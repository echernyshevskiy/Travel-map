// ---------- Вехи ----------
// Считаем хронологически: идём по записям от старых к новым и фиксируем момент,
// когда счётчик впервые перевалил через порог. Иначе веха знала бы «сколько»,
// но не «когда» — а именно это и делает её вехой, а не ещё одной цифрой.
const MILESTONE_COUNTRIES = [1, 5, 10, 20, 30, 40, 50, 75, 100];
const MILESTONE_CITIES = [1, 10, 25, 50, 100, 150, 200, 300, 500];
const MILESTONE_SEAS = [1, 3, 5, 7, 10, 15, 20, 30, 40];
const ordinalSea = n => `${n}-е море`, ordinalOcean = n => `${n}-й океан`;

function computeMilestones(){
  const visited = allEntries.filter(e => e.status !== 'wishlist' && e.year);
  // сортируем по времени; записи без месяца считаем началом года
  const chrono = visited.slice().sort((a,b)=> (a.year - b.year) || ((a.month || 0) - (b.month || 0)) || (a.dateFrom || '').localeCompare(b.dateFrom || ''));
  const when = e => `${escapeHtml(whenLabel(e))}`;

  const reached = [];
  const seenCountries = new Set();
  const seenCities = new Set();
  const seenSeas = new Set(), seenOceans = new Set();
  let ci = 0, ti = 0, si = 0;

  chrono.forEach(e=>{
    if(e.type === 'country' && e.countryKey && !seenCountries.has(e.countryKey)){
      seenCountries.add(e.countryKey);
      while(ci < MILESTONE_COUNTRIES.length && seenCountries.size >= MILESTONE_COUNTRIES[ci]){
        reached.push({ n: MILESTONE_COUNTRIES[ci], kind: 'страна', title: `${MILESTONE_COUNTRIES[ci]}-я страна — ${e.name}`, when: when(e), entry: e, at: e.year * 12 + (e.month || 0) });
        ci++;
      }
    }
    getAllCityVisits([e]).forEach(v=>{
      // моря и океаны: первое знакомство с каждым — по городам на берегу
      const row = seaRowAt(v.lat, v.lng);
      if(row >= 0) seaUnits(SEAS, row).forEach(name => {
        if(seaKindOf(name) === 'ocean'){
          if(seenOceans.has(name)) return;
          seenOceans.add(name);
          reached.push({ n: seenOceans.size, kind: 'океан', title: `${ordinalOcean(seenOceans.size)} — ${name}${v.name ? ' (' + v.name + ')' : ''}`, when: when(e), entry: e, at: e.year * 12 + (e.month || 0) });
          return;
        }
        if(seenSeas.has(name)) return;
        seenSeas.add(name);
        while(si < MILESTONE_SEAS.length && seenSeas.size >= MILESTONE_SEAS[si]){
          reached.push({ n: MILESTONE_SEAS[si], kind: 'море', title: `${ordinalSea(MILESTONE_SEAS[si])} — ${name}${v.name ? ' (' + v.name + ')' : ''}`, when: when(e), entry: e, at: e.year * 12 + (e.month || 0) });
          si++;
        }
      });
      const key = (v.name || '').trim().toLowerCase();
      if(!key || seenCities.has(key)) return;
      seenCities.add(key);
      while(ti < MILESTONE_CITIES.length && seenCities.size >= MILESTONE_CITIES[ti]){
        reached.push({ n: MILESTONE_CITIES[ti], kind: 'город', title: `${MILESTONE_CITIES[ti]}-й город — ${v.name}`, when: when(e), entry: e, at: e.year * 12 + (e.month || 0) });
        ti++;
      }
    });
  });

  // «столько-то лет в пути» — от первой записи
  const years = chrono.map(e => e.year);
  if(years.length){
    const first = years[0], last = years[years.length-1];
    [1,5,10,15,20].forEach(y=>{
      if(last - first >= y) reached.push({ n: y, kind: 'год', title: `${y} ${y===1?'год':(y<5?'года':'лет')} с первой поездки`, when: `${first} → ${first + y}`, entry: null, at: (first + y) * 12 });
    });
  }

  // ближайшая недостигнутая — как ориентир
  const pending = [];
  if(ci < MILESTONE_COUNTRIES.length) pending.push({ n: MILESTONE_COUNTRIES[ci], title: `${MILESTONE_COUNTRIES[ci]}-я страна`, left: MILESTONE_COUNTRIES[ci] - seenCountries.size });
  if(si < MILESTONE_SEAS.length && seenSeas.size) pending.push({ n: MILESTONE_SEAS[si], title: ordinalSea(MILESTONE_SEAS[si]), left: MILESTONE_SEAS[si] - seenSeas.size });
  if(ti < MILESTONE_CITIES.length) pending.push({ n: MILESTONE_CITIES[ti], title: `${MILESTONE_CITIES[ti]}-й город`, left: MILESTONE_CITIES[ti] - seenCities.size });

  return { reached, pending, countries: seenCountries.size, cities: seenCities.size, seas: seenSeas.size, oceans: seenOceans.size };
}

function renderMilestones(){
  const { reached, pending, countries, cities, seas } = computeMilestones();
  document.getElementById('milestonesSummary').textContent =
    reached.length ? `Пройдено вех: ${reached.length} · стран: ${countries}, городов: ${cities}${seas ? ', морей: ' + seas : ''}` : 'Вех пока нет';
  const body = document.getElementById('milestonesBody');
  if(reached.length === 0){
    body.innerHTML = `<div class="hint">Добавьте первые отметки — вехи появятся здесь по мере того, как карта наполняется.</div>`;
    return;
  }
  // по времени от свежих к старым: вехи «лет в пути» добавляются последними,
  // и без явной сортировки они сбивались в кучу наверху вместо своих мест
  const sorted = reached.slice().sort((a,b)=> (b.at || 0) - (a.at || 0));
  body.innerHTML = sorted.map(m => `
    <div class="milestone"${m.entry ? ` data-ms-id="${escapeAttr(m.entry.id)}" style="cursor:pointer;"` : ''}>
      <div class="milestone-num">${m.n}</div>
      <div class="milestone-body">
        <div class="milestone-title">${escapeHtml(m.title)}</div>
        <div class="milestone-when">${escapeHtml(m.when)}</div>
      </div>
    </div>`).join('') +
    (pending.length ? `<div class="section-title" style="margin-top:18px;">Впереди</div>` +
      pending.map(p => `<div class="milestone pending">
        <div class="milestone-num">${p.n}</div>
        <div class="milestone-body">
          <div class="milestone-title">${escapeHtml(p.title)}</div>
          <div class="milestone-when">осталось ${p.left}</div>
        </div>
      </div>`).join('') : '');
}

document.getElementById('openMilestonesBtn').addEventListener('click', ()=>{
  renderMilestones();
  document.getElementById('milestonesModal').style.display = 'flex';
});
document.getElementById('closeMilestonesModal').addEventListener('click', ()=>{
  document.getElementById('milestonesModal').style.display = 'none';
});
document.getElementById('milestonesModal').addEventListener('click', (e)=>{
  if(e.target.id === 'milestonesModal') document.getElementById('milestonesModal').style.display = 'none';
});
document.getElementById('milestonesBody').addEventListener('click', (ev)=>{
  const row = ev.target.closest('[data-ms-id]');
  if(!row) return;
  const entry = allEntries.find(e => e.id === row.dataset.msId);
  if(!entry) return;
  document.getElementById('milestonesModal').style.display = 'none';
  focusEntry(entry);
});

// ---------- Дневник ----------
let diaryQuery = '';

function renderDiary(){
  const withNotes = allEntries.filter(e => (e.notes || '').trim());
  const q = diaryQuery.toLowerCase();
  const shown = q ? withNotes.filter(e =>
    (e.notes || '').toLowerCase().includes(q) ||
    (e.name || '').toLowerCase().includes(q) ||
    (e.trip || '').toLowerCase().includes(q)) : withNotes;

  document.getElementById('diarySummary').textContent = withNotes.length === 0
    ? 'Заметок пока нет'
    : `Записей с заметками: ${withNotes.length}` + (q ? ` · найдено: ${shown.length}` : '');

  const body = document.getElementById('diaryBody');
  if(withNotes.length === 0){
    body.innerHTML = `<div class="hint">Заметки, добавленные к отметкам, соберутся здесь в ленту по годам.</div>`;
    return;
  }
  if(shown.length === 0){
    body.innerHTML = `<div class="hint">Ничего не найдено по запросу «${escapeHtml(diaryQuery)}».</div>`;
    return;
  }

  const sorted = shown.slice().sort((a,b)=> (b.year||0) - (a.year||0) || (b.month||0) - (a.month||0) || (b.dateFrom || '').localeCompare(a.dateFrom || '') || a.name.localeCompare(b.name,'ru'));
  const counts = new Map();
  sorted.forEach(e => counts.set(e.year, (counts.get(e.year) || 0) + 1));

  const highlight = (text)=>{
    const safe = escapeHtml(text);
    if(!q) return safe;
    // подсвечиваем совпадение, экранировав и текст, и запрос
    const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
    return safe.replace(re, '<mark>$1</mark>');
  };

  let html = '', lastYear = null;
  sorted.forEach(e=>{
    if(e.year !== lastYear){
      lastYear = e.year;
      html += `<div class="diary-year">${e.year || 'без года'}<span>${counts.get(e.year) || 0}</span></div>`;
    }
    const flag = (e.type === 'country' || e.type === 'city') ? countryFlag(e.countryKey) : '';
    html += `<div class="diary-entry">
      <div class="diary-head" data-diary-id="${escapeAttr(e.id)}">
        <span class="diary-place">${flag ? flag + ' ' : ''}${highlight(e.name)}</span>
        <span class="diary-when">${escapeHtml(whenLabel(e))}</span>
      </div>
      <div class="diary-note"${READ_ONLY ? '' : ` data-diary-edit="${escapeAttr(e.id)}" title="Нажмите, чтобы изменить" style="cursor:text;"`}>${highlight(e.notes.trim())}</div>
      ${e.trip ? `<div class="diary-trip">${highlight(e.trip)}</div>` : ''}
    </div>`;
  });
  body.innerHTML = html;
}

document.getElementById('openDiaryBtn').addEventListener('click', ()=>{
  diaryQuery = '';
  document.getElementById('diarySearchInput').value = '';
  renderDiary();
  document.getElementById('diaryModal').style.display = 'flex';
});
document.getElementById('closeDiaryModal').addEventListener('click', ()=>{
  document.getElementById('diaryModal').style.display = 'none';
});
document.getElementById('diaryModal').addEventListener('click', (e)=>{
  if(e.target.id === 'diaryModal') document.getElementById('diaryModal').style.display = 'none';
});
document.getElementById('diarySearchInput').addEventListener('input', debounce((e)=>{
  diaryQuery = e.target.value.trim();
  renderDiary();
}, 150));
document.getElementById('diaryBody').addEventListener('click', (ev)=>{
  // правка заметки прямо в ленте — тем же редактором, что на странице поездки,
  // чтобы не заводить вторую реализацию того же самого
  const noteEl = ev.target.closest('[data-diary-edit]');
  if(noteEl){
    openInlineNote(noteEl.dataset.diaryEdit, noteEl, renderDiary);
    return;
  }
  const head = ev.target.closest('[data-diary-id]');
  if(!head) return;
  const entry = allEntries.find(e => e.id === head.dataset.diaryId);
  if(!entry) return;
  document.getElementById('diaryModal').style.display = 'none';
  focusEntry(entry);
});

