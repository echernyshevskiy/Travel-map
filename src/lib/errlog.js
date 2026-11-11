// Журнал ошибок приложения: сбои, которые раньше молча глотались, теперь
// попадают сюда и видны в «Проверке данных» (раздел «Ошибки приложения»).
// Хранятся последние MAX записей: время, место, текст ошибки и пара строк
// стека. Содержимое записей пользователя сюда не пишется: длинные фрагменты
// в кавычках из текста ошибки (так браузер цитирует разбираемый JSON)
// заменяются многоточием. Повтор той же ошибки подряд не плодит записи,
// а увеличивает счётчик. unit/errlog.test.js.

export const ERRLOG_KEY = 'travel-map-errlog';
export const ERRLOG_MAX = 50;
const MSG_MAX = 300;

// текст ошибки без длинных цитат и без лишней длины
export function errorText(err) {
  let s;
  if (err && typeof err === 'object' && 'message' in err) s = (err.name && err.name !== 'Error' ? err.name + ': ' : '') + err.message;
  else s = String(err);
  s = s
    .replace(/"[^"]{13,}"|'[^']{13,}'|«[^»]{13,}»/g, '«…»')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > MSG_MAX ? s.slice(0, MSG_MAX - 1) + '…' : s;
}

// до трёх строк стека, только имя файла вместо полного адреса
export function stackLines(err) {
  const st = err && typeof err === 'object' && typeof err.stack === 'string' ? err.stack : '';
  if (!st) return [];
  return st
    .split('\n')
    .map(l => l.trim())
    .filter(l => /^at |@/.test(l))
    .slice(0, 3)
    .map(l => l.replace(/(?:https?|file|blob):\/\/[^\s)]*\/([^/\s)?#]*)(?:[?#][^\s):]*)?/g, '$1').slice(0, 160));
}

// storage — объект с getItem/setItem (localStorage) или null: тогда журнал
// живёт только в памяти. Сбои самого хранилища журнал не роняют.
export function createErrorLog({ storage = null, key = ERRLOG_KEY, max = ERRLOG_MAX, now = () => Date.now() } = {}) {
  let items = null;
  const load = () => {
    if (items) return items;
    items = [];
    try {
      const raw = storage && storage.getItem(key);
      const arr = raw ? JSON.parse(raw) : [];
      if (Array.isArray(arr)) items = arr.filter(x => x && typeof x.msg === 'string').slice(-max);
    } catch (e) {
      /* хранилище недоступно или испорчено — начинаем с пустого журнала */
    }
    return items;
  };
  const save = () => {
    try {
      if (storage) storage.setItem(key, JSON.stringify(items));
    } catch (e) {
      /* не записалось — журнал останется в памяти до перезагрузки */
    }
  };
  return {
    add(where, err) {
      const list = load();
      const entry = { t: now(), where: String(where || '').slice(0, 80), msg: errorText(err) };
      const stack = stackLines(err);
      if (stack.length) entry.stack = stack;
      const last = list[list.length - 1];
      if (last && last.where === entry.where && last.msg === entry.msg) {
        last.n = (last.n || 1) + 1;
        last.t = entry.t;
      } else {
        list.push(entry);
        if (list.length > max) list.splice(0, list.length - max);
      }
      save();
      return entry;
    },
    list() {
      return load().slice();
    },
    clear() {
      items = [];
      try {
        if (storage) storage.removeItem(key);
      } catch (e) {
        /* не удалилось из хранилища — в памяти журнал уже пуст */
      }
    }
  };
}

// текст журнала для «Скопировать»: новые сверху
export function formatErrorLog(list, fmtTime = t => new Date(t).toISOString().replace('T', ' ').slice(0, 19)) {
  return list
    .slice()
    .reverse()
    .map(x => `${fmtTime(x.t)}  ${x.where}${x.n > 1 ? ` (×${x.n})` : ''}\n  ${x.msg}${x.stack ? '\n' + x.stack.map(s => '    ' + s).join('\n') : ''}`)
    .join('\n');
}
