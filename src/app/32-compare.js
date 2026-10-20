// ---------- год к году ----------
// Сравнение — то, ради чего статистику обычно и открывают, а до сих пор можно
// было видеть только один год за раз. Считаем через тот же computeRecap, чтобы
// цифры совпадали с разделом «Год в путешествиях».
function fillCompareYears(){
  const years = [...new Set(allEntries.filter(e => e.status !== 'wishlist' && e.year).map(e => e.year))].sort((a,b)=>b-a);
  const a = document.getElementById('compareYearA');
  const b = document.getElementById('compareYearB');
  if(years.length === 0){ a.innerHTML = b.innerHTML = ''; return years; }
  const opts = years.map(y => `<option value="${y}">${y}</option>`).join('');
  a.innerHTML = opts; b.innerHTML = opts;
  // по умолчанию: последний год против предыдущего
  b.value = String(years[0]);
  a.value = String(years[1] !== undefined ? years[1] : years[0]);
  return years;
}

function renderCompare(){
  const yA = parseInt(document.getElementById('compareYearA').value, 10);
  const yB = parseInt(document.getElementById('compareYearB').value, 10);
  const body = document.getElementById('compareBody');
  if(!yA || !yB){
    body.innerHTML = `<div class="hint">Нужны записи хотя бы за один год.</div>`;
    return;
  }
  const A = computeRecap(yA), B = computeRecap(yB);

  // строки сравнения: значение слева, разница посередине, значение справа
  const rows = [
    ['Стран', A.countries.length, B.countries.length, v => String(v)],
    ['Из них впервые', A.newCountries.length, B.newCountries.length, v => String(v)],
    ['Городов', A.cities.size, B.cities.size, v => String(v)],
    ['Поездок', A.trips.size, B.trips.size, v => String(v)],
    ['Месяцев в пути', A.months.size, B.months.size, v => String(v)],
    ['Записей', A.entries, B.entries, v => String(v)],
  ];
  if(A.km > 0 || B.km > 0) rows.push(['Километров', Math.round(A.km), Math.round(B.km), v => v.toLocaleString('ru-RU')]);
  if(A.gain > 0 || B.gain > 0) rows.push(['Набор высоты, м', Math.round(A.gain), Math.round(B.gain), v => v.toLocaleString('ru-RU')]);

  let html = `<div class="cmp-head"><b class="a">${yA}</b><span></span><b class="b">${yB}</b></div>`;
  rows.forEach(([label, va, vb, fmt])=>{
    const diff = vb - va;
    const cls = diff > 0 ? 'up' : diff < 0 ? 'down' : '';
    // минус обязателен: без него падение с 7 до 1 выглядело как рост на 6
    const sign = diff > 0 ? '+' : diff < 0 ? '−' : '';
    html += `<div class="cmp-row">
      <div class="cmp-label">${escapeHtml(label)}</div>
      <div class="cmp-val a">${fmt(va)}</div>
      <div class="cmp-delta ${cls}">${diff === 0 ? 'без изменений' : sign + fmt(Math.abs(diff))}</div>
      <div class="cmp-val b">${fmt(vb)}</div>
    </div>`;
  });

  // что появилось впервые в более позднем году
  const later = yB >= yA ? B : A;
  const laterYear = yB >= yA ? yB : yA;
  if(later.newCountries.length){
    html += `<div class="cmp-new">
      <div class="cmp-new-title">Впервые в ${laterYear}</div>
      <div class="cmp-chips">${later.newCountries.map(k =>
        `<span class="cmp-chip">${countryFlag(k) || ''} ${escapeHtml(COUNTRY_RU[k] || k)}</span>`).join('')}</div>
    </div>`;
  }
  // страны, которые были в одном году и не повторились в другом
  const setA = new Set(A.countries), setB = new Set(B.countries);
  const onlyA = A.countries.filter(k => !setB.has(k));
  const onlyB = B.countries.filter(k => !setA.has(k));
  const both = A.countries.filter(k => setB.has(k));
  if(both.length){
    html += `<div class="cmp-new">
      <div class="cmp-new-title">В обоих годах</div>
      <div class="cmp-chips">${both.map(k => `<span class="cmp-chip">${countryFlag(k) || ''} ${escapeHtml(COUNTRY_RU[k] || k)}</span>`).join('')}</div>
    </div>`;
  }
  if(onlyA.length){
    html += `<div class="cmp-new">
      <div class="cmp-new-title">Только в ${yA}</div>
      <div class="cmp-chips">${onlyA.map(k => `<span class="cmp-chip">${countryFlag(k) || ''} ${escapeHtml(COUNTRY_RU[k] || k)}</span>`).join('')}</div>
    </div>`;
  }
  if(onlyB.length){
    html += `<div class="cmp-new">
      <div class="cmp-new-title">Только в ${yB}</div>
      <div class="cmp-chips">${onlyB.map(k => `<span class="cmp-chip">${countryFlag(k) || ''} ${escapeHtml(COUNTRY_RU[k] || k)}</span>`).join('')}</div>
    </div>`;
  }
  body.innerHTML = html;
}

document.getElementById('openCompareBtn').addEventListener('click', ()=>{
  const years = fillCompareYears();
  if(years.length === 0){
    document.getElementById('compareBody').innerHTML = `<div class="hint">Пока нет записей с годом.</div>`;
  } else {
    renderCompare();
  }
  document.getElementById('compareModal').style.display = 'flex';
});
document.getElementById('closeCompareModal').addEventListener('click', ()=>{
  document.getElementById('compareModal').style.display = 'none';
});
document.getElementById('compareModal').addEventListener('click', (e)=>{
  if(e.target.id === 'compareModal') document.getElementById('compareModal').style.display = 'none';
});
document.getElementById('compareYearA').addEventListener('change', renderCompare);
document.getElementById('compareYearB').addEventListener('change', renderCompare);

// Escape закрывает верхнее открытое окно, а не все сразу: окна могут лежать
// стопкой (например, паспорт поверх таблицы), и закрывать нижние вместе с
// верхним — неожиданно для человека. Прежние обработчики Escape отвечают за
// подсказки и полноэкранный режим, обычные окна ими не закрывались вовсе.
function openModalIds(){
  return [...document.querySelectorAll('.modal-overlay')]
    .filter(m => m.style.display !== 'none' && m.style.display !== '');
}
function syncModalAria(){
  // скрытое окно не должно читаться скринридером как часть страницы
  document.querySelectorAll('.modal-overlay').forEach(m=>{
    const shown = m.style.display !== 'none' && m.style.display !== '';
    m.setAttribute('aria-hidden', shown ? 'false' : 'true');
    if(shown) m.setAttribute('role', 'dialog');
  });
}
document.addEventListener('keydown', (e)=>{
  if(e.key !== 'Escape') return;
  // режим истории и полноэкранная карта закрываются своими обработчиками
  if(document.body.classList.contains('map-full')) return;
  const open = openModalIds();
  if(open.length === 0) return;
  const top = open[open.length - 1]; // последнее в разметке лежит выше
  if(top.id === 'storyModal') return;
  top.style.display = 'none';
  syncModalAria();
});
// метки обновляем при любом изменении видимости окон
(function watchModals(){
  const mo = new MutationObserver(syncModalAria);
  document.querySelectorAll('.modal-overlay').forEach(m=>{
    mo.observe(m, { attributes:true, attributeFilter:['style'] });
  });
  syncModalAria();
})();

document.getElementById('resetFiltersBtn').addEventListener('click', resetAllFilters);
document.getElementById('openDiagnosticsBtn').addEventListener('click', ()=>{
  renderDiagnostics();
  document.getElementById('diagnosticsModal').style.display = 'flex';
});
document.getElementById('closeDiagnosticsModal').addEventListener('click', ()=>{
  document.getElementById('diagnosticsModal').style.display = 'none';
});
document.getElementById('diagnosticsModal').addEventListener('click', (e)=>{
  if(e.target.id === 'diagnosticsModal') document.getElementById('diagnosticsModal').style.display = 'none';
});
document.getElementById('closeCalendarModal').addEventListener('click', ()=>{
  document.getElementById('calendarModal').style.display = 'none';
});
document.getElementById('calendarModal').addEventListener('click', (e)=>{
  if(e.target.id === 'calendarModal') document.getElementById('calendarModal').style.display = 'none';
});
document.getElementById('passportSearchInput').addEventListener('input', debounce((e)=>{
  passportSearchQuery = e.target.value.trim().toLowerCase();
  // при новом запросе открываем сразу страницы с печатями, а не обложку
  // разворот 0 — обложка, 1 — сводка «особые отметки», печати начинаются со 2-го
  passportSpread = passportSearchQuery ? 2 : 0;
  renderPassport();
}, 150));
document.getElementById('closePassportModal').addEventListener('click', closePassportModal);
document.getElementById('passportModal').addEventListener('click', (e)=>{
  if(e.target.id === 'passportModal') closePassportModal();
});
function closePassportModal(){
  document.getElementById('passportModal').style.display = 'none';
}

function stampHash(str){
  let h = 0;
  for(let i=0;i<str.length;i++) h = (h*31 + str.charCodeAt(i)) >>> 0;
  return h;
}

let passportSearchQuery = '';

const PP_PER_PAGE = 6; // печатей на одной странице (сетка 2×3)
let passportSpread = 0;

// Геральдический силуэт для обложки — упрощённый двуглавый орёл без деталей
// щита, корон и скипетра: стилизация формы, а не воспроизведение герба.
const PASSPORT_EMBLEM_SVG = `<svg viewBox="0 0 100 100" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round">
  <circle cx="50" cy="50" r="46" stroke-width="1.5" opacity="0.55"/>
  <path d="M50 30c-3 6-3 12 0 16M50 30c3 6 3 12 0 16" stroke-width="2"/>
  <circle cx="41" cy="27" r="5"/><circle cx="59" cy="27" r="5"/>
  <path d="M41 27c-10-2-20 2-27 10M41 27c-8 3-14 9-17 17M59 27c10-2 20 2 27 10M59 27c8 3 14 9 17 17" stroke-width="1.8"/>
  <path d="M50 46c-9 4-15 12-16 24M50 46c9 4 15 12 16 24" stroke-width="1.8"/>
  <path d="M50 46v22M42 60l8 8 8-8" stroke-width="1.8"/>
</svg>`;

function buildStampHtml(s){
  const yearsSorted = [...new Set(s.years)].sort((a,b)=>a-b);
  const yearsLabel = yearsSorted.length > 1 ? `${yearsSorted[0]}–${yearsSorted[yearsSorted.length-1]}` : `${yearsSorted[0]}`;
  const h = stampHash(s.name);
  const angle = (h % 17) - 8; // -8..8 градусов, устойчиво для каждой страны
  const flag = countryFlag(s.countryKey);
  // прямоугольные и овальные штампы вперемешку — как на развороте с визовыми
  // отметками, где перекрываются печати разной формы и цвета чернил
  const isRect = h % 2 === 0;
  const arrow = h % 3 === 0 ? '▷' : '◁'; // въезд / выезд — чисто декоративный штрих
  return `<div class="stamp${isRect ? ' stamp-rect' : ''}" style="--stamp-color:${s.color};transform:rotate(${angle}deg);">
    ${s.count > 1 ? `<div class="stamp-count">×${s.count}</div>` : ''}
    <div class="stamp-arrow">${arrow}</div>
    ${flag ? `<div style="font-size:22px;margin-bottom:2px;">${flag}</div>` : ''}
    <div class="stamp-name">${escapeHtml(s.name)}</div>
    <div class="stamp-year">${yearsLabel}</div>
  </div>`;
}

function buildPageHtml(stamps, pageNum, side){
  const body = stamps.length
    ? `<div class="pp-stamps">${stamps.map(buildStampHtml).join('')}</div>`
    : `<div class="pp-empty-page">свободная страница<br>для будущих печатей</div>`;
  return `<div class="pp-page ${side}">
    <div class="pp-page-head"><span>визы / visas</span><span>${pageNum}</span></div>
    ${body}
    <div class="pp-page-num">— ${pageNum} —</div>
  </div>`;
}

// Разбивка печатей на страницы и развороты — одна на отрисовку и на печать,
// чтобы количество страниц нигде не разошлось
function passportPages(){
  const countries = allEntries.filter(e => e.type === 'country' && e.status !== 'wishlist');
  const byKey = {};
  countries.forEach(e=>{
    if(!byKey[e.countryKey]) byKey[e.countryKey] = { name: e.name, years: [], count: 0, color: e.color, countryKey: e.countryKey, lastYear: -Infinity };
    byKey[e.countryKey].years.push(e.year);
    byKey[e.countryKey].count++;
    if(e.year > byKey[e.countryKey].lastYear) byKey[e.countryKey].lastYear = e.year;
  });
  // от самого свежего визита к самому старому — как штампы заполняются в
  // реальном паспорте по ходу поездок, а не по алфавиту
  const all = Object.values(byKey).sort((a,b) => b.lastYear - a.lastYear || a.name.localeCompare(b.name, 'ru'));
  const shown = passportSearchQuery ? all.filter(s => s.name.toLowerCase().includes(passportSearchQuery)) : all;
  const pages = [];
  for(let i = 0; i < shown.length; i += PP_PER_PAGE) pages.push(shown.slice(i, i + PP_PER_PAGE));
  if(pages.length === 0) pages.push([]);
  if(pages.length % 2) pages.push([]);
  return { all, shown, pages };
}
function passportTotalSpreads(){
  return passportPages().pages.length / 2 + 2; // + обложка + сводка
}

