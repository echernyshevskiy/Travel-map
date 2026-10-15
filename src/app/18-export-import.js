// ---------- export / import ----------
// общая выгрузка резервной копии — используется и кнопкой экспорта,
// и автоматически перед импортом с заменой
function downloadBackup(suffix, isAuto){
  const data = JSON.stringify({ entries: allEntries, tripMeta, races, exportedAt: new Date().toISOString() }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `travel-map-${new Date().toISOString().slice(0,10)}${suffix || ''}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(()=> URL.revokeObjectURL(url), 1000);
  // автоматическая копия перед импортом не считается: пользователь её не
  // выбирал и мог даже не заметить, напоминание должно остаться
  if(!isAuto) markBackupDone();
}

document.getElementById('exportBtn').addEventListener('click', ()=>{
  if(allEntries.length === 0){ toast('Пока нечего экспортировать'); return; }
  downloadBackup();
  toast(`Сохранено: ${allEntries.length} записей`);
});

function entriesToRows(){
  return allEntries.map(e => ({
    'Тип': e.type === 'country' ? 'Страна' : e.type === 'city' ? 'Город' : 'Маршрут',
    'Название': e.name,
    'Год': e.year,
    'Месяц': MONTHS.find(m => m.key === e.month)?.ru || '',
    'Поездка': e.trip || '',
    'Порядок_в_поездке': (e.trip && e.tripOrder != null) ? e.tripOrder : '',
    'Статус': e.status === 'wishlist' ? 'План' : 'Посещено',
    'Цель': purposeLabel(e.purpose),
    'Компания': companyLabel(e.company) || '',
    'Сообщество': communityLabel(e.community) || '',
    'Сезон': seasonLabel(e.season) || '',
    'Активность': e.type === 'route' ? (activityLabel(e.activity) || '') : '',
    'Дней_в_пути': (e.type === 'route' && e.activity === 'hiking' && e.trackDays) ? e.trackDays : '',
    'Точки_маршрута': (e.type === 'route' && e.waypointNames) ? e.waypointNames.join(' → ') : '',
    'Дистанция_км': e.type === 'route' ? Number(e.distanceKm.toFixed(2)) : '',
    'НаборВысоты_м': (e.type === 'route' && e.elevationGain != null) ? Math.round(e.elevationGain) : '',
    'МаксВысота_м': (e.type === 'route' && e.maxElevation != null) ? Math.round(e.maxElevation) : '',
    'Длительность_мин': (e.type === 'route' && e.durationMin != null) ? Math.round(e.durationMin) : '',
    'Избранное': e.type === 'city' ? (e.favorite ? 'да' : 'нет') : '',
    'Цвет': e.color || '',
    'Фото': (e.photos || []).join(' | '),
    'Instagram': e.instagramUrl || '',
    'Карта_место': e.mapLinkUrl || '',
    'Документ': e.docLinkUrl || '',
    'Заметка': e.notes || ''
  }));
}

function toCSV(rows){
  const headers = Object.keys(rows[0]);
  const esc = v => {
    const s = String(v === undefined || v === null ? '' : v);
    return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [headers.map(esc).join(',')];
  rows.forEach(r => lines.push(headers.map(h => esc(r[h])).join(',')));
  return '\uFEFF' + lines.join('\r\n');
}

document.getElementById('exportCsvBtn').addEventListener('click', ()=>{
  if(allEntries.length === 0){ toast('Пока нечего экспортировать'); return; }
  const rows = entriesToRows();
  const csv = toCSV(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `travel-map-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast(`Сохранено: ${rows.length} записей`);
});

// Библиотека XLSX весит около 900 КБ — вчетверо больше самого приложения.
// Раньше она грузилась при каждом первом открытии, даже если кнопкой ни разу
// не пользовались. Теперь подгружаем её только по нажатию.
let xlsxLoading = null;
function loadXlsxLib(){
  if(typeof XLSX !== 'undefined') return Promise.resolve(true);
  if(xlsxLoading) return xlsxLoading;
  xlsxLoading = new Promise((resolve)=>{
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.crossOrigin = 'anonymous';
    s.onload = ()=> resolve(typeof XLSX !== 'undefined');
    s.onerror = ()=>{ xlsxLoading = null; resolve(false); };
    document.head.appendChild(s);
  });
  return xlsxLoading;
}

document.getElementById('exportXlsxBtn').addEventListener('click', async ()=>{
  if(allEntries.length === 0){ toast('Пока нечего экспортировать'); return; }
  const btn = document.getElementById('exportXlsxBtn');
  const original = btn.textContent;
  btn.disabled = true; btn.textContent = 'Загружаю модуль…';
  const ready = await loadXlsxLib();
  btn.disabled = false; btn.textContent = original;
  if(!ready){ toast('Не удалось загрузить модуль XLSX — скачайте CSV, он открывается в Excel'); return; }
  try{
    const rows = entriesToRows();
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Отметки');
    XLSX.writeFile(wb, `travel-map-${new Date().toISOString().slice(0,10)}.xlsx`);
    toast(`Сохранено: ${rows.length} записей`);
  }catch(err){
    toast('Не удалось создать XLSX — попробуйте CSV');
  }
});

document.getElementById('importBtn').addEventListener('click', ()=>{
  document.getElementById('importInput').click();
});
document.getElementById('importInput').addEventListener('change', (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = async (ev)=>{
    try{
      const parsed = JSON.parse(ev.target.result);
      const imported = Array.isArray(parsed) ? parsed : parsed.entries;
      if(!Array.isArray(imported)){ toast('Файл не похож на резервную копию этого инструмента'); return; }
      // Проверка типа пропускала мусор вроде lat: 999999 — такая запись ломает
      // подгонку масштаба карты. Проверяем и диапазон.
      const validCoord = (lat, lng) =>
        Number.isFinite(lat) && lat >= -90 && lat <= 90 &&
        Number.isFinite(lng) && lng >= -180 && lng <= 180;
      const valid = imported.filter(x => x && x.id && x.type && x.name &&
        (x.type === 'route' ? ((typeof x.coordsEncoded === 'string' && x.coordsEncoded.length > 0) || (Array.isArray(x.coords) && x.coords.length > 1)) :
         x.type === 'city' ? validCoord(x.lat, x.lng) :
         x.type === 'country' ? typeof x.countryKey === 'string' : false));
      const skipped = imported.length - valid.length;
      if(valid.length === 0){ toast('В файле не найдено подходящих записей'); return; }
      // приводим поля к безопасному виду ещё до сохранения, а не только при отрисовке
      valid.forEach(migrateEntry);
      const replace = confirm(
        `Найдено записей: ${valid.length}.` +
        (skipped ? `\nПропущено повреждённых: ${skipped}.` : '') + `\n\n` +
        `ОК — заменить все текущие отметки импортированными.\n` +
        `Отмена — добавить к уже существующим (без дублей).\n\n` +
        `Замена необратима, отменить её нельзя. Перед заменой автоматически скачается копия текущих данных.`
      );
      const importedMeta = (parsed && typeof parsed.tripMeta === 'object' && parsed.tripMeta) ? parsed.tripMeta : null;
      if(replace){
        // единственное необратимое действие во всём приложении: отмены для него нет,
        // поэтому перед заменой сохраняем текущее состояние отдельным файлом
        if(allEntries.length > 0){
          try{
            downloadBackup('-до-импорта', true);
            toast('Скачана копия текущих данных перед заменой');
          }catch(err){
            console.error('pre-import backup failed', err);
          }
        }
        allEntries = valid;
        if(importedMeta) tripMeta = JSON.parse(JSON.stringify(importedMeta));
        if(Array.isArray(parsed.races)) races = JSON.parse(JSON.stringify(parsed.races));
      } else {
        const existingIds = new Set(allEntries.map(x => x.id));
        allEntries = allEntries.concat(valid.filter(x => !existingIds.has(x.id)));
        // при добавлении не затираем уже написанные описания — берём только те поездки, которых ещё нет
        if(importedMeta) Object.keys(importedMeta).forEach(k => { if(!tripMeta[k]) tripMeta[k] = importedMeta[k]; });
        if(Array.isArray(parsed.races)){
          const haveRaces = new Set(races.map(r => r.id));
          races = races.concat(parsed.races.filter(r => r && r.id && !haveRaces.has(r.id)));
        }
      }
      const saved = await saveData();
      rebuildAll();
      if(saved) toast(replace ? 'Данные заменены' : 'Данные добавлены');
    }catch(err){
      toast('Не удалось прочитать файл — проверьте, что это корректный JSON');
    }
    document.getElementById('importInput').value = '';
  };
  reader.readAsText(file);
});

