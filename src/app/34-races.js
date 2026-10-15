// ---------- официальные старты ----------
function raceShare(r){
  if(!r.place || !r.participants || r.participants <= 0) return null;
  return r.place / r.participants * 100;
}

let editingRaceId = null;
let finishingRace = false; // открыли предстоящий старт, чтобы вписать результат

// Предстоящий старт — тот же старт, только без результата. Отдельный список
// потребовал бы переносить запись между массивами при «переезде»; статус
// превращает это в смену одного поля, как у отметок «посещено / хочу посетить».
// У прежних записей статуса нет — считаем их состоявшимися.
function raceStatus(r){ return r.status === 'upcoming' ? 'upcoming' : 'done'; }

function daysUntil(dateStr){
  if(!dateStr) return null;
  const d = new Date(dateStr + 'T12:00:00');
  if(isNaN(d)) return null;
  const today = new Date(); today.setHours(12,0,0,0);
  return Math.round((d - today) / 86400000);
}

function renderUpcoming(){
  const box = document.getElementById('upcomingBlock');
  if(!box) return;
  const list = races.filter(r => raceStatus(r) === 'upcoming')
                    .sort((a,b)=> String(a.date || '9999').localeCompare(String(b.date || '9999')));
  let html = '';
  if(list.length === 0){
    html = `<div class="hint">Здесь можно держать старты, на которые уже зарегистрированы. Когда пробежите — впишете результат, и старт переедет в официальные.</div>`;
  } else {
    html = `<div style="overflow-x:auto;"><table class="race-table">
      <thead><tr><th>Старт</th><th>Дистанция</th><th>Когда</th>${READ_ONLY ? '' : '<th></th>'}</tr></thead><tbody>` +
      list.map(r=>{
        const left = daysUntil(r.date);
        const when = r.date ? new Date(r.date + 'T12:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'short',year:'numeric'}) : '—';
        const where = [r.city, r.country].filter(Boolean).join(', ');
        // прошедшую дату подсвечиваем: пора вписать результат
        const overdue = left !== null && left < 0;
        const countdown = left === null ? '' :
          overdue ? `<span class="race-share top10">пора вписать результат</span>` :
          left === 0 ? `<span class="race-share top25">сегодня</span>` :
          `<span class="race-share">через ${left} ${daysWord(left)}</span>`;
        return `<tr>
          <td><span class="race-name">${escapeHtml(r.name || '—')}</span>
            ${where ? `<span class="race-where">${escapeHtml(where)}</span>` : ''}</td>
          <td class="race-num">${r.distanceKm ? r.distanceKm.toFixed(1) + ' км' : '—'}</td>
          <td class="race-num">${escapeHtml(when)}<div style="margin-top:3px;">${countdown}</div></td>
          ${READ_ONLY ? '' : `<td class="race-actions">
            <button data-race-finish="${escapeAttr(r.id)}" title="Вписать результат" aria-label="Вписать результат" style="color:var(--amber);">✓</button>
            <button data-race-edit="${escapeAttr(r.id)}" title="Изменить" aria-label="Изменить">✎</button>
            <button data-race-del="${escapeAttr(r.id)}" title="Удалить" aria-label="Удалить">✕</button>
          </td>`}
        </tr>`;
      }).join('') + `</tbody></table></div>`;
  }
  if(!READ_ONLY && editingRaceId !== 'newUpcoming'){
    html += `<button class="cancel-edit" id="upcomingAddBtn" style="margin-top:10px;width:auto;padding:6px 14px;">+ добавить предстоящий</button>`;
  }
  box.innerHTML = html;
  const add = document.getElementById('upcomingAddBtn');
  if(add) add.addEventListener('click', ()=>{ editingRaceId = 'newUpcoming'; renderRaces(); renderUpcoming(); });
  bindRaceRowActions(box);
}

function renderRaces(){
  renderUpcoming();
  const box = document.getElementById('racesBlock');
  if(!box) return;
  const sorted = races.filter(r => raceStatus(r) === 'done')
                      .sort((a,b)=> String(b.date || '').localeCompare(String(a.date || '')));

  let html = '';
  if(sorted.length === 0){
    html += `<div class="hint">Здесь можно вести результаты официальных стартов — отдельно от карты, вручную. Трек для этого не нужен.</div>`;
  } else {
    html += `<div style="overflow-x:auto;"><table class="race-table">
      <thead><tr>
        <th>Старт</th><th>Дистанция</th><th>Время</th><th>Темп</th><th>Место</th><th>Доля</th>
        ${READ_ONLY ? '' : '<th></th>'}
      </tr></thead><tbody>` +
      sorted.map(r=>{
        const min = parseRaceTime(r.time);
        const pace = (min && r.distanceKm) ? formatPace(min / r.distanceKm) : '—';
        const sh = raceShare(r);
        const shCls = sh == null ? '' : sh <= 10 ? 'top10' : sh <= 25 ? 'top25' : '';
        const when = r.date ? new Date(r.date + 'T12:00:00').toLocaleDateString('ru-RU', {day:'numeric', month:'short', year:'numeric'}) : '';
        const where = [where0(r.city), r.country].filter(Boolean).join(', ');
        return `<tr>
          <td><span class="race-name">${escapeHtml(r.name || '—')}</span>
            <span class="race-where">${escapeHtml([when, where].filter(Boolean).join(' · '))}</span></td>
          <td class="race-num">${r.distanceKm ? r.distanceKm.toFixed(1) + ' км' : '—'}</td>
          <td class="race-num">${formatRaceTime(min)}</td>
          <td class="race-num">${pace}</td>
          <td class="race-num">${r.place ? r.place + (r.participants ? ' / ' + r.participants : '') : '—'}</td>
          <td>${sh == null ? '—' : `<span class="race-share ${shCls}">${sh < 1 ? sh.toFixed(1) : Math.round(sh)}%</span>`}</td>
          ${READ_ONLY ? '' : `<td class="race-actions">
            <button data-race-edit="${escapeAttr(r.id)}" title="Изменить" aria-label="Изменить">✎</button>
            <button data-race-del="${escapeAttr(r.id)}" title="Удалить" aria-label="Удалить">✕</button>
          </td>`}
        </tr>`;
      }).join('') + `</tbody></table></div>`;
  }

  if(!READ_ONLY){
    const r = editingRaceId ? races.find(x => x.id === editingRaceId) : null;
    // у предстоящего результата ещё нет — поля времени и места не показываем,
    // пока человек не нажмёт «вписать результат»
    const asUpcoming = editingRaceId === 'newUpcoming' ||
                       (r && raceStatus(r) === 'upcoming' && !finishingRace);
    if(editingRaceId){
      html += `<div class="race-form">
        <div class="race-form-grid">
          <div><label>Название</label><input type="text" id="raceName" value="${escapeAttr(r ? r.name || '' : '')}" placeholder="Казанский марафон"></div>
          <div><label>Дата</label><input type="date" id="raceDate" value="${escapeAttr(r ? r.date || '' : '')}"></div>
          <div><label>Город</label><input type="text" id="raceCity" value="${escapeAttr(r ? r.city || '' : '')}" placeholder="Казань"></div>
          <div><label>Страна</label><input type="text" id="raceCountry" value="${escapeAttr(r ? r.country || '' : '')}" placeholder="Россия"></div>
          <div><label>Дистанция, км</label><input type="number" step="0.1" id="raceDist" value="${r && r.distanceKm ? r.distanceKm : ''}" placeholder="21.1"></div>
          ${asUpcoming ? '' : `
          <div><label>Время</label><input type="text" id="raceTime" value="${escapeAttr(r ? r.time || '' : '')}" placeholder="1:38:24"></div>
          <div><label>Место в абсолюте</label><input type="number" id="racePlace" value="${r && r.place ? r.place : ''}" placeholder="342"></div>
          <div><label>Всего участников</label><input type="number" id="raceTotal" value="${r && r.participants ? r.participants : ''}" placeholder="4120"></div>`}
        </div>
        ${asUpcoming ? '<div class="hint" style="margin-top:8px;">Результат впишете после старта — тогда он переедет в официальные.</div>' : ''}
        <div class="race-form-actions">
          <button class="cancel-edit" id="raceSaveBtn" style="margin-top:0;width:auto;padding:6px 14px;border-color:var(--amber-dim);color:var(--amber);">Сохранить</button>
          <button class="cancel-edit" id="raceCancelBtn" style="margin-top:0;width:auto;padding:6px 14px;">Отмена</button>
        </div>
      </div>`;
    } else {
      html += `<button class="cancel-edit" id="raceAddBtn" style="margin-top:10px;width:auto;padding:6px 14px;">+ добавить старт</button>`;
    }
  }
  box.innerHTML = html;

  const addBtn = document.getElementById('raceAddBtn');
  if(addBtn) addBtn.addEventListener('click', ()=>{ editingRaceId = 'new'; renderRaces(); });
  const cancelBtn = document.getElementById('raceCancelBtn');
  if(cancelBtn) cancelBtn.addEventListener('click', ()=>{ editingRaceId = null; finishingRace = false; renderRaces(); });
  // рекорды, медали и графики зависят от стартов — обновляем вместе с таблицей
  if(document.getElementById('runningModal').style.display === 'flex') try{ renderRunExtras(); }catch(e){ console.warn(e); }
  const saveBtn = document.getElementById('raceSaveBtn');
  if(saveBtn) saveBtn.addEventListener('click', saveRaceForm);
  bindRaceRowActions(box);
}

// Одни и те же действия нужны в обеих таблицах — предстоящих и состоявшихся.
function bindRaceRowActions(box){
  box.querySelectorAll('[data-race-edit]').forEach(b=>{
    b.addEventListener('click', ()=>{ editingRaceId = b.dataset.raceEdit; renderRaces(); });
  });
  box.querySelectorAll('[data-race-finish]').forEach(b=>{
    // «переезд» в состоявшиеся — это открыть ту же запись на правку,
    // где уже видны поля результата
    b.addEventListener('click', ()=>{ editingRaceId = b.dataset.raceFinish; finishingRace = true; renderRaces(); });
  });
  box.querySelectorAll('[data-race-del]').forEach(b=>{
    b.addEventListener('click', async ()=>{
      const id = b.dataset.raceDel;
      const gone = races.find(x => x.id === id);
      races = races.filter(x => x.id !== id);
      lastAction = { type: 'races', snapshot: gone ? [gone] : [], removed: true };
      const saved = await saveData();
      renderRaces();
      if(saved) showUndoToast(`Старт удалён: ${gone ? gone.name : ''}`);
    });
  });
}

async function saveRaceForm(){
  const val = id => (document.getElementById(id) || {}).value || '';
  const name = val('raceName').trim();
  const timeStr = val('raceTime').trim();
  if(!name){ toast('Укажите название старта'); return; }
  const min = parseRaceTime(timeStr);
  if(timeStr && min === null){ toast('Время не распознано — например: 1:38:24 или 48:12'); return; }
  const dist = parseFloat(val('raceDist'));
  const place = parseInt(val('racePlace'), 10);
  const total = parseInt(val('raceTotal'), 10);
  if(place && total && place > total){ toast('Место не может быть больше числа участников'); return; }

  const data = {
    name,
    date: val('raceDate'),
    city: val('raceCity').trim(),
    country: val('raceCountry').trim(),
    distanceKm: isFinite(dist) && dist > 0 ? dist : null,
    time: timeStr,
    place: isFinite(place) && place > 0 ? place : null,
    participants: isFinite(total) && total > 0 ? total : null,
  };
  const wasUpcoming = editingRaceId === 'newUpcoming' ||
    (races.find(x => x.id === editingRaceId) || {}).status === 'upcoming';
  // старт переезжает в состоявшиеся, когда у него появляется время
  data.status = (editingRaceId === 'newUpcoming' || (wasUpcoming && !timeStr)) ? 'upcoming' : 'done';

  if(editingRaceId === 'new' || editingRaceId === 'newUpcoming'){
    races.push({ id: genId(), ...data });
  } else {
    const r = races.find(x => x.id === editingRaceId);
    if(r) Object.assign(r, data);
  }
  const moved = wasUpcoming && data.status === 'done';
  editingRaceId = null;
  finishingRace = false;
  const saved = await saveData();
  renderRaces();
  if(saved) toast(moved ? 'Результат записан — старт в официальных' : 'Старт сохранён');
}

