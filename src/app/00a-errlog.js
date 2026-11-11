// Журнал ошибок (src/lib/errlog.js) и безопасная работа с хранилищем настроек.
// Правило: пустой catch без комментария проверка кода не пропускает
// (scripts/lint.mjs). Неожиданный сбой — в журнал через logError(где, ошибка);
// ожидаемый (нет доступа к хранилищу в приватном окне и т. п.) — с коротким
// комментарием, почему его можно пропустить.

const errorLog = createErrorLog({ storage: (() => {
  try{ return window.localStorage; }
  catch(e){ return null; } // хранилище запрещено браузером — журнал будет только в памяти
})() });

function logError(where, err){
  try{
    errorLog.add(where, err);
    console.warn('[Карта путешествий] ' + where + ':', err);
    // открыто окно проверки — раздел ошибок обновится при следующей перерисовке
  }catch(e){ /* журнал не должен сам ронять приложение */ }
}

// Ошибки, случившиеся до загрузки этого кода, собирает скрипт в <head>
(function drainEarlyErrors(){
  const early = Array.isArray(window.__tmEarlyErrors) ? window.__tmEarlyErrors : [];
  early.forEach(x => logError(x.where, x.err));
  window.__tmEarlyErrors = { push: x => logError(x.where, x.err) };
})();

// Настройки в хранилище браузера: запоминаются «по возможности». Нет доступа
// (приватное окно, запрет сайта) — настройка просто не запомнится, это не сбой.
// Переполнение хранилища — уже сбой: пишем в журнал.
function prefGet(key){
  try{ return localStorage.getItem(key); }
  catch(e){ return null; } // нет доступа к хранилищу — как будто настройки нет
}
function prefSet(key, value){
  try{ localStorage.setItem(key, value); return true; }
  catch(e){
    if(e && (e.name === 'QuotaExceededError' || e.code === 22)) logError('хранилище переполнено: ' + key, e);
    return false;
  }
}
function prefRemove(key){
  try{ localStorage.removeItem(key); }
  catch(e){ /* нет доступа к хранилищу — удалять нечего */ }
}
