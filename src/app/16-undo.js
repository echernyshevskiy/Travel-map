function showUndoToast(message){
  const t = document.getElementById('toast');
  t.innerHTML = `${escapeHtml(message)} <button id="undoDeleteBtn" style="margin-left:8px;background:none;border:none;color:var(--on-accent);text-decoration:underline;text-underline-offset:2px;cursor:pointer;font-family:inherit;font-size:inherit;">Отменить</button>`;
  t.style.display = 'block';
  document.getElementById('undoDeleteBtn').addEventListener('click', undoLastAction);
  clearTimeout(t._timer);
  t._timer = setTimeout(()=>{
    t.style.display = 'none';
    if(lastAction && lastAction.type === 'delete' && lastAction.tripsToCleanup){
      lastAction.tripsToCleanup.forEach(cleanupTripMetaIfOrphaned);
      saveData();
    }
    lastAction = null;
  }, 7000);
}

// Массовые действия (импорт из фото, объединение в поездку, исправление стран)
// меняют десятки записей разом. Универсальный снимок: запоминаем, какие записи
// были созданы, и прежнее состояние тех, что менялись.
function snapshotEntries(entries, fields){
  return entries.map(e => {
    const snap = { id: e.id };
    fields.forEach(f => { snap[f] = e[f]; });
    return snap;
  });
}

function recordBulkAction(label, changed, fields, createdIds){
  lastAction = {
    type: 'bulk', label,
    snapshot: changed ? snapshotEntries(changed, fields) : [],
    fields: fields || [],
    createdIds: createdIds || []
  };
}

async function undoLastAction(){
  if(!lastAction) return;
  document.getElementById('toast').style.display = 'none';
  if(lastAction.type === 'races'){
    if(lastAction.removed) races = races.concat(lastAction.snapshot);
    lastAction = null;
    const saved = await saveData();
    renderRaces();
    if(saved) toast('Старт восстановлен');
    return;
  }
  if(lastAction.type === 'bulk'){
    // сначала убираем созданное, затем возвращаем прежние значения изменённым
    if(lastAction.createdIds.length){
      const drop = new Set(lastAction.createdIds);
      allEntries = allEntries.filter(e => !drop.has(e.id));
      drop.forEach(id => decodedCoordsCache.delete(id));
    }
    lastAction.snapshot.forEach(snap=>{
      const entry = allEntries.find(e => e.id === snap.id);
      if(!entry) return;
      lastAction.fields.forEach(f => { entry[f] = snap[f]; });
    });
    const label = lastAction.label;
    lastAction = null;
    const saved = await saveData();
    rebuildAll();
    renderTable();
    if(saved) toast(label ? `Отменено: ${label}` : 'Отменено');
    return;
  }
  if(lastAction.type === 'delete'){
    const items = [...lastAction.items].sort((a,b) => a.index - b.index);
    items.forEach(({entry, index}) => {
      allEntries.splice(Math.min(index, allEntries.length), 0, entry);
    });
    const count = items.length;
    lastAction = null;
    const saved = await saveData();
    rebuildAll();
    renderTable();
    if(saved) toast(count > 1 ? `Восстановлено записей: ${count}` : 'Восстановлено');
  } else if(lastAction.type === 'edit'){
    const entry = allEntries.find(e => e.id === lastAction.id);
    if(entry) Object.keys(lastAction.snapshot).forEach(k => { entry[k] = lastAction.snapshot[k]; });
    lastAction = null;
    const saved = await saveData();
    rebuildAll();
    renderTable();
    if(saved) toast('Правки отменены');
  }
}

