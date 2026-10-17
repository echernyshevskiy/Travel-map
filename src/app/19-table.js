// ---------- full entries table modal ----------
let selectedIds = new Set();

function updateBulkBar(){
  syncSelectAllCheckbox(allEntries.filter(passesFilter));
  const bar = document.getElementById('bulkBar');
  const count = document.getElementById('bulkCount');
  if(selectedIds.size === 0){
    bar.style.display = 'none';
    return;
  }
  bar.style.display = 'flex';
  count.textContent = `Выбрано: ${selectedIds.size}`;
}

document.getElementById('selectAllCheckbox').addEventListener('change', (e)=>{
  const visible = allEntries.filter(passesFilter);
  if(e.target.checked){
    visible.forEach(entry => selectedIds.add(entry.id));
  } else {
    visible.forEach(entry => selectedIds.delete(entry.id));
  }
  renderTable();
});

document.getElementById('bulkClear').addEventListener('click', ()=>{
  selectedIds.clear();
  renderTable();
});

document.getElementById('bulkApplySeason').addEventListener('click', async ()=>{
  const value = document.getElementById('bulkSeasonValue').value;
  const touched = allEntries.filter(e => selectedIds.has(e.id));
  if(touched.length === 0){ toast('Ничего не выбрано'); return; }
  recordBulkAction('сезон для нескольких записей', touched, ['season'], []);
  touched.forEach(e => { e.season = value; });
  const saved = await saveData();
  rebuildAll();
  renderTable();
  if(saved) showUndoToast(`Сезон «${seasonLabel(value)}» проставлен для ${selectedIds.size} записей`);
});

document.getElementById('bulkApplyPurpose').addEventListener('click', async ()=>{
  const value = document.getElementById('bulkPurposeValue').value;
  const touched = allEntries.filter(e => selectedIds.has(e.id));
  if(touched.length === 0){ toast('Ничего не выбрано'); return; }
  recordBulkAction('цель для нескольких записей', touched, ['purpose'], []);
  touched.forEach(e => { e.purpose = value; });
  const saved = await saveData();
  rebuildAll();
  renderTable();
  if(saved) showUndoToast(`Цель «${purposeLabel(value)}» проставлена для ${selectedIds.size} записей`);
});

document.getElementById('bulkApplyTrip').addEventListener('click', async ()=>{
  const value = document.getElementById('bulkTripValue').value.trim();
  if(!value){ toast('Введите название поездки'); return; }
  const touched = allEntries.filter(e => selectedIds.has(e.id));
  if(touched.length === 0){ toast('Ничего не выбрано'); return; }
  recordBulkAction('поездку для нескольких записей', touched, ['trip','tripOrder'], []);
  const oldTrips = new Set();
  touched.forEach(e=>{ if(e.trip && e.trip !== value) oldTrips.add(e.trip); e.trip = value; });
  oldTrips.forEach(cleanupTripMetaIfOrphaned);
  const saved = await saveData();
  rebuildAll();
  renderTable();
  if(saved) showUndoToast(`Поездка «${value}» проставлена для ${selectedIds.size} записей`);
});

document.getElementById('bulkApplyCompany').addEventListener('click', async ()=>{
  const value = document.getElementById('bulkCompanyValue').value;
  const touched = allEntries.filter(e => selectedIds.has(e.id));
  if(touched.length === 0){ toast('Ничего не выбрано'); return; }
  // сообщество имеет смысл только при компании «Сообщество» — иначе снимаем,
  // чтобы в данных не осталось висящего значения без основания
  recordBulkAction('компанию для нескольких записей', touched, ['company','community'], []);
  touched.forEach(e => { e.company = value; if(value !== 'group') e.community = undefined; });
  const saved = await saveData();
  rebuildAll();
  renderTable();
  if(saved) showUndoToast(`Компания «${companyLabel(value)}» проставлена для ${touched.length} записей`);
});

document.getElementById('bulkApplyVisited').addEventListener('click', async ()=>{
  const touched = allEntries.filter(e => selectedIds.has(e.id) && e.type !== 'route' && e.status === 'wishlist');
  if(touched.length === 0){ toast('Среди выбранного нет записей в статусе «Хочу посетить»'); return; }
  recordBulkAction('отметку посещёнными', touched, ['status'], []);
  touched.forEach(e => { e.status = 'visited'; });
  const count = touched.length;
  const saved = await saveData();
  rebuildAll();
  renderTable();
  if(saved) showUndoToast(`Отмечено посещёнными: ${count}`);
});

// Если среди выбранного есть видимые друзьям — скрываем все, иначе все показываем
document.getElementById('bulkToggleHidden').addEventListener('click', async ()=>{
  const touched = allEntries.filter(e => selectedIds.has(e.id));
  if(touched.length === 0) return;
  const hide = touched.some(e => !e.hidden);
  recordBulkAction(hide ? 'скрытие от друзей' : 'показ друзьям', touched, ['hidden'], []);
  touched.forEach(e => { if(hide) e.hidden = true; else delete e.hidden; });
  const saved = await saveData();
  rebuildAll();
  renderTable();
  if(saved) showUndoToast(hide ? `Скрыто от друзей: ${touched.length}` : `Снова видно друзьям: ${touched.length}`);
});

document.getElementById('bulkDelete').addEventListener('click', async ()=>{
  const n = selectedIds.size;
  if(!confirm(`Удалить ${n} выбранных записей?`)) return;
  const affectedTrips = new Set(allEntries.filter(e => selectedIds.has(e.id) && e.trip).map(e => e.trip));
  const removedItems = [];
  allEntries.forEach((e, idx) => {
    if(selectedIds.has(e.id)){ removedItems.push({ entry: e, index: idx }); decodedCoordsCache.delete(e.id); }
  });
  allEntries = allEntries.filter(e => !selectedIds.has(e.id));
  selectedIds.clear();
  lastAction = { type: 'delete', items: removedItems, tripsToCleanup: affectedTrips };
  const saved = await saveData();
  rebuildAll();
  renderTable();
  if(saved) showUndoToast(`Удалено записей: ${n}`);
});

document.getElementById('openTableBtn').addEventListener('click', ()=>{
  document.getElementById('tableSearchInput').value = searchQuery;
  renderTable();
  document.getElementById('tableModal').style.display = 'flex';
});
document.getElementById('closeTableModal').addEventListener('click', closeTableModal);
document.getElementById('tableModal').addEventListener('click', (e)=>{
  if(e.target.id === 'tableModal') closeTableModal();
});
function closeTableModal(){
  document.getElementById('tableModal').style.display = 'none';
}

let tableLimit = LIST_PAGE;
function renderTable(){
  const visible = allEntries.filter(passesFilter).sort((a,b)=> b.year - a.year || a.name.localeCompare(b.name, 'ru'));
  const countText = (activeYears.size || activeMonths.size || activePurposes.size || activeCompanies.size || activeCommunities.size || activeSeasons.size || activeActivities.size || activeStatuses.size || activeTrips.size || searchQuery || activeLayerTypes.size < 3)
    ? `Показано ${visible.length} из ${allEntries.length} — с учётом фильтров в панели слева`
    : `Всего записей: ${allEntries.length}`;
  document.getElementById('modalCount').textContent = countText;

  const tbody = document.getElementById('entriesTableBody');
  tbody.innerHTML = '';
  if(visible.length === 0){
    tbody.innerHTML = `<tr><td colspan="12" style="color:var(--text-dim);white-space:normal;">Нет записей под текущие фильтры.</td></tr>`;
    updateBulkBar();
    return;
  }
  // Раньше на каждую строку создавался элемент и вешалось по четыре обработчика:
  // при 1000 записей это давало около двух секунд. Собираем разметку одной
  // строкой и вставляем разом, клики — делегированием, как уже сделано в списке.
  // Показываем порциями: строим 1000 строк — почти 2 секунды, а пролистать
  // их всё равно невозможно. Порог тот же, что в списке записей.
  const shownRows = visible.slice(0, tableLimit);
  const rows = [];
  shownRows.forEach(entry=>{
    const typeLabel = entry.type === 'country' ? 'Страна' : entry.type === 'city' ? 'Город' : 'Маршрут';
    const activityOrDist = entry.type === 'route'
      ? [
          activityLabel(entry.activity) || '—',
          `${entry.distanceKm.toFixed(1)} км${entry.isEstimated ? ' (по прямой)' : ''}`,
          (entry.elevationGain !== null && entry.elevationGain !== undefined) ? `+${Math.round(entry.elevationGain)} м` : null,
          (entry.durationMin !== null && entry.durationMin !== undefined) ? formatDuration(entry.durationMin) : null
        ].filter(Boolean).join(' · ')
      : '—';
    rows.push(`<tr data-row-id="${escapeAttr(entry.id)}">
      <td>${READ_ONLY ? '' : `<input type="checkbox" class="row-checkbox" ${selectedIds.has(entry.id) ? 'checked' : ''}>`}</td>
      <td><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${entry.color};margin-right:6px;"></span>${typeLabel}</td>
      <td class="name-cell">${((entry.type === 'country' || entry.type === 'city') && countryFlag(entry.countryKey)) ? countryFlag(entry.countryKey) + ' ' : ''}${(entry.type === 'city' && entry.favorite) ? '❤ ' : ''}${escapeHtml(entry.name)}</td>
      <td>${escapeHtml(whenLabel(entry))}</td>
      <td>${purposeLabel(entry.purpose)}</td>
      <td>${companyLabel(entry.company) || '—'}${communityLabel(entry.community) ? ' · ' + communityLabel(entry.community) : ''}</td>
      <td>${seasonLabel(entry.season) || '—'}</td>
      <td>${activityOrDist}</td>
      <td>${entry.status === 'wishlist' ? 'План' : 'Посещено'}</td>
      <td>${entry.trip ? escapeHtml(entry.trip) : '—'}</td>
      <td class="links-cell">${[
        entry.photos && entry.photos.length ? entry.photos.map((u,i) => `<a href="${escapeAttr(safeUrl(u))}" target="_blank" rel="noopener">Фото${entry.photos.length>1 ? ' '+(i+1) : ''}</a>`).join(' · ') : null,
        entry.instagramUrl ? `<a href="${escapeAttr(safeUrl(entry.instagramUrl))}" target="_blank" rel="noopener">📷 Instagram</a>` : null,
        entry.mapLinkUrl ? `<a href="${escapeAttr(safeUrl(entry.mapLinkUrl))}" target="_blank" rel="noopener">🗺️ Карта</a>` : null,
        entry.docLinkUrl ? `<a href="${escapeAttr(safeUrl(entry.docLinkUrl))}" target="_blank" rel="noopener">📄 Документ</a>` : null
      ].filter(Boolean).join(' · ') || '—'}</td>
      <td class="table-actions"><div class="table-actions-inner">
        ${(!READ_ONLY && entry.status === 'wishlist') ? `<button title="Отметить как посещённое" aria-label="Отметить как посещённое" data-act="visit" style="color:var(--amber);">✓</button>` : ''}
        ${READ_ONLY ? '' : `<button title="Редактировать" aria-label="Редактировать" data-act="edit">✎</button>
        <button title="Удалить" aria-label="Удалить" data-act="del">✕</button>`}
      </div></td>
    </tr>`);
  });
  tbody.innerHTML = rows.join('');
  if(visible.length > shownRows.length){
    const rest = visible.length - shownRows.length;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="12" style="white-space:normal;text-align:center;padding:12px;">
      <button class="cancel-edit" id="tableShowMoreBtn" style="margin-top:0;width:auto;padding:6px 14px;">Показать ещё ${Math.min(rest, LIST_PAGE)} из ${rest}</button>
    </td>`;
    tbody.appendChild(tr);
    const more = document.getElementById('tableShowMoreBtn');
    if(more) more.addEventListener('click', ()=>{ tableLimit += LIST_PAGE; renderTable(); });
  }
  updateBulkBar();
}

// Галочка «выбрать всё» отражает фактический выбор среди видимых строк:
// раньше она сбрасывалась при каждой перерисовке, хотя записи оставались выбранными
function syncSelectAllCheckbox(visible){
  const cb = document.getElementById('selectAllCheckbox');
  if(!cb) return;
  const picked = visible.filter(e => selectedIds.has(e.id)).length;
  cb.checked = visible.length > 0 && picked === visible.length;
  cb.indeterminate = picked > 0 && picked < visible.length;
}

// Один обработчик на всю таблицу вместо четырёх на каждую строку: раньше при
// 1000 записей навешивалось 4000 обработчиков, и каждая перерисовка таблицы
// создавала их заново.
document.getElementById('entriesTableBody').addEventListener('click', async (ev)=>{
  const actEl = ev.target.closest('[data-act]');
  const tr = ev.target.closest('[data-row-id]');
  if(!actEl || !tr) return;
  const id = tr.dataset.rowId;
  const entry = allEntries.find(e => e.id === id);
  if(!entry) return;
  const act = actEl.dataset.act;
  if(act === 'visit'){ await upgradeToVisited(id); renderTable(); }
  else if(act === 'edit'){ startEdit(entry); closeTableModal(); }
  else if(act === 'del'){ await deleteEntry(id); renderTable(); }
});
document.getElementById('entriesTableBody').addEventListener('change', (ev)=>{
  const cb = ev.target.closest('.row-checkbox');
  const tr = ev.target.closest('[data-row-id]');
  if(!cb || !tr) return;
  if(cb.checked) selectedIds.add(tr.dataset.rowId); else selectedIds.delete(tr.dataset.rowId);
  updateBulkBar();
});

