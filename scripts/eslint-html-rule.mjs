// Правило проверки кода «escaped-html»: данные попадают в разметку только
// экранированными. Защита от того, чтобы новая строчка вида
//   el.innerHTML = `<b>${entry.name}</b>`
// не открыла дорогу вставке чужого кода через название записи.
//
// Что проверяется:
//   • каждая шаблонная строка, в тексте которой есть тег (<b>, </div> …);
//   • всё, что присваивается в innerHTML / outerHTML и передаётся в
//     insertAdjacentHTML.
// Каждая подстановка ${…} должна быть заведомо безопасной:
//   • обёрнута в escapeHtml / escapeAttr / safeUrl / encodeURIComponent;
//   • число или булево: x.length, арифметика, сравнение, +x, Math.*, Number(),
//     .toFixed(), индекс из .map((x, i) => …), счётчик цикла;
//   • постоянная строка; вложенная шаблонная строка; a ? b : c; a || b; a && b;
//     a + b; X.map(…).join(…) — тогда проверяются их части;
//   • локальная переменная (const, или let, которой присваивают только
//     безопасное) — проверяется то, чем её заполнили;
//   • встроенный справочник (import X from '../data/…'): это наши файлы;
//   • поле из SANITIZED_PROPS: id, цвет, год, месяц… — их тип и вид
//     проверяются при загрузке данных (sanitizeEntryFields, sanitizeRace в
//     src/app/09-layers.js), так что там заведомо нет разметки;
//   • готовая разметка: переменная, поле или функция, в имени которой есть
//     «html» (rowsHtml, html, buildCountryInfoHtml()) — договорённость: такое
//     имя означает «уже собрано из безопасных частей»;
//   • функции из SAFE_CALLS — возвращают текст из чисел, дат и наших строк;
//   • помечена комментарием html-ok внутри подстановки:
//       ${x /* html-ok: причина */}
//     или строкой // html-ok: причина прямо перед строкой с подстановкой.
// Всё остальное — ошибка проверки. Как исправить: обернуть в escapeHtml(…)
// (escapeAttr — для атрибутов, safeUrl — для ссылок), либо, если значение
// заведомо безопасно, переименовать в …Html, добавить функцию в SAFE_CALLS
// или пометить html-ok с причиной.

const ESCAPERS = new Set(['escapeHtml', 'escapeAttr', 'safeUrl', 'encodeURIComponent', 'gpxEscape']);
// возвращают число или булево
const NUMERIC_CALLS = new Set(['Number', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'Boolean']);
const NUMERIC_METHODS = new Set(['toFixed', 'toPrecision', 'indexOf', 'lastIndexOf', 'findIndex', 'includes', 'some', 'every', 'has',
  'getTime', 'getFullYear', 'getMonth', 'getDate', 'getDay', 'getHours', 'getMinutes', 'getUTCFullYear', 'getUTCMonth', 'getUTCDate',
  'test', 'localeCompare', 'startsWith', 'endsWith', 'charCodeAt', 'codePointAt',
  'getChildCount', 'getZoom', 'distanceTo']); // Leaflet: числа
const NUMERIC_OBJECTS = new Set(['Math', 'Number', 'Date']);
// строковые преобразования: безопасно, если безопасно исходное
const STRING_METHODS = new Set(['trim', 'toUpperCase', 'toLowerCase', 'slice', 'substring', 'substr', 'padStart', 'padEnd', 'repeat', 'toString', 'at']);
// даты и числа в текст — безопасны всегда (Date.prototype.toLocale…, Number.prototype.toLocaleString)
const LOCALE_METHODS = new Set(['toLocaleDateString', 'toLocaleTimeString', 'toISOString']);
// Наши функции, которые возвращают безопасный текст: собирают его из чисел,
// дат и постоянных строк, а пользовательский текст внутри экранируют сами.
// Добавляя сюда функцию, убедитесь, что это так (и что так останется).
export const SAFE_CALLS = new Set([
  // src/lib/format.js — числа и даты в текст
  'formatPace', 'formatRaceTime', 'fmtDelta', 'daysWord', 'pluralVisits', 'monthsWord', 'formatDateRange', 'formatDiff',
  // поиск по нашим постоянным таблицам: флаг страны, подписи цели, компании, сезона, месяца
  'countryFlag', 'quizFlag', 'purposeLabel', 'companyLabel', 'communityLabel', 'seasonLabel', 'monthLabel', 'activityLabel',
  // числа в текст: население, склонения, координаты и цвет KML
  'popText', 'seasWord', 'oceansWord', 'kmlColor', 'kmlCoord',
  // время в столице: Intl.DateTimeFormat
  'formatCapitalTime',
]);
// поля, вид которых проверяется при загрузке (src/app/09-layers.js)
export const SANITIZED_PROPS = new Set([
  'id', 'color', 'year', 'month', 'status', 'type', 'lat', 'lng', 'dateFrom', 'dateTo', 'trackDays',
  'distanceKm', 'place', 'participants', // sanitizeRace: числа
]);
// числовые свойства
const NUMERIC_PROPS = new Set(['length', 'size']);

const TAG_RE = /<\/?[a-zA-Z][\w-]*[\s>/]/;
const isHtmlTemplate = node => node.quasis.some(q => TAG_RE.test(q.value.cooked ?? q.value.raw ?? ''));
const unchain = n => (n && n.type === 'ChainExpression' ? n.expression : n);
const nameOf = n => {
  n = unchain(n);
  if(!n) return '';
  if(n.type === 'Identifier') return n.name;
  if(n.type === 'MemberExpression' && !n.computed && n.property.type === 'Identifier') return n.property.name;
  return '';
};
const htmlNamed = name => /html/i.test(name);
const ITER_METHODS = new Set(['map', 'forEach', 'filter', 'some', 'every', 'find', 'findIndex', 'flatMap', 'reduce']);

export default {
  meta: {
    type: 'problem',
    docs: { description: 'Подстановки в разметку — только через escapeHtml/escapeAttr/safeUrl' },
    schema: [],
    messages: {
      unsafe: 'Подстановка «{{text}}» идёт в разметку без экранирования: оберните в escapeHtml(…) / escapeAttr(…) или пометьте /* html-ok: причина */ (подробнее — scripts/eslint-html-rule.mjs)',
    },
  },
  create(context){
    const sc = context.sourceCode;
    const text = sc.text;
    const okComments = sc.getAllComments().filter(c => /html-ok/.test(c.value));
    const okLines = new Set();
    okComments.filter(c => c.type === 'Line').forEach(c => { okLines.add(c.loc.end.line); okLines.add(c.loc.end.line + 1); });
    const marked = node => {
      if(okLines.has(node.loc.start.line)) return true;
      // комментарий внутри той же подстановки ${ … }
      const open = text.lastIndexOf('${', node.range[0]);
      if(open === -1) return false;
      const close = text.indexOf('}', node.range[1]);
      return okComments.some(c => c.range[0] > open && c.range[1] <= (close === -1 ? text.length : close + 1) && c.range[0] >= node.range[0] - 40);
    };

    // Функция, перед которой стоит комментарий «html-ok-params: причина»: её
    // параметры считаются безопасными — так помечают помощники, которым
    // передают только числа или уже экранированный текст (collRing(got, total, size)).
    const paramsMarked = fn => {
      let n = fn;
      // const f = (…) => …  /  function f(…)  /  export function …
      while(n.parent && ['VariableDeclarator', 'VariableDeclaration', 'ExportNamedDeclaration'].includes(n.parent.type)) n = n.parent;
      if(n.type === 'VariableDeclarator') n = n.parent;
      const before = sc.getCommentsBefore(n);
      if(before.some(c => /html-ok-params/.test(c.value))) return true;
      // комментарий внутри скобок параметров: (m, i /* html-ok-params: … */) => …
      const inner = sc.getCommentsInside(fn).filter(c => fn.body && c.range[1] <= fn.body.range[0]);
      return inner.some(c => /html-ok-params/.test(c.value));
    };

    // возвращаемые выражения функции
    const returned = fn => {
      fn = unchain(fn);
      if(!fn || !/Function/.test(fn.type)) return null;
      if(fn.body.type !== 'BlockStatement') return [fn.body];
      const out = [];
      const walk = n => {
        if(!n || typeof n !== 'object') return;
        if(n !== fn.body && /Function/.test(n.type)) return;
        if(n.type === 'ReturnStatement'){ if(n.argument) out.push(n.argument); return; }
        for(const k of Object.keys(n)){
          if(k === 'parent') continue;
          const v = n[k];
          if(Array.isArray(v)) v.forEach(walk); else if(v && typeof v.type === 'string') walk(v);
        }
      };
      walk(fn.body);
      return out;
    };

    // переменная, на которую ссылается идентификатор
    const resolveVar = id => {
      let ref = null;
      for(let sco = sc.getScope(id); sco && !ref; sco = sco.upper) ref = sco.references.find(r => r.identifier === id) || null;
      return ref && ref.resolved;
    };
    // тело функции, которую объявили под этим именем (function f(){}, const f = () => …)
    const functionOf = v => {
      if(!v || v.defs.length !== 1) return null;
      const d = v.defs[0];
      if(d.type === 'FunctionName') return d.node;
      if(d.type === 'Variable' && d.node.init && /Function/.test(d.node.init.type) && d.parent.kind === 'const') return d.node.init;
      return null;
    };
    const PATTERN_PARTS = ['ArrayPattern', 'ObjectPattern', 'Property', 'AssignmentPattern', 'RestElement'];
    const topParam = (name, fn) => { let t = name; while(t.parent && t.parent !== fn && PATTERN_PARTS.includes(t.parent.type)) t = t.parent; return t; };

    // параметр функции-обработчика: X.map((x, i) => …) — индекс число,
    // элемент безопасен, если безопасен весь X; reduce((acc, x) => …, init) —
    // накопитель безопасен, если безопасны init и то, что возвращает обработчик
    function callbackParamSafe(fn, name, iterCall, collection){
      const method = nameOf(iterCall.callee);
      const top = topParam(name, fn);
      const idx = fn.params.indexOf(top);
      if(method === 'reduce'){
        if(idx === 0) return iterCall.arguments.length > 1 && safe(iterCall.arguments[1]) && (returned(fn) || []).every(safe);
        if(idx === 2) return top === name;
        return idx === 1 && safe(collection);
      }
      if(idx === 1) return top === name;
      return idx === 0 && safe(collection);
    }
    // параметр своей функции: безопасен, если во всех местах вызова на этом
    // месте передают безопасное (функцию нигде не передают как значение)
    const resolvingSites = new Set(), resolvingCalls = new Set();
    function callSitesSafe(fn, name){
      const top = topParam(name, fn);
      const k = fn.params.indexOf(top);
      if(k < 0 || top.type === 'RestElement') return false;
      let fv = null;
      if(fn.type === 'FunctionDeclaration' && fn.id) fv = sc.getDeclaredVariables(fn)[0];
      else if(fn.parent && fn.parent.type === 'VariableDeclarator' && fn.parent.parent.kind === 'const' && fn.parent.id.type === 'Identifier') fv = sc.getDeclaredVariables(fn.parent)[0];
      if(!fv) return false;
      const uses = fv.references.filter(r => !r.init);
      if(!uses.length) return false;
      if(resolvingSites.has(fv)) return true;
      resolvingSites.add(fv);
      try{
        return uses.every(r => {
          const c = r.identifier.parent;
          // X.map(f): f — обработчик, его параметры — элемент и индекс X
          if(c && c.type === 'CallExpression' && c.arguments[0] === r.identifier){
            const cc = unchain(c.callee);
            if(cc.type === 'MemberExpression' && ITER_METHODS.has(nameOf(cc))) return callbackParamSafe(fn, name, c, cc.object);
          }
          if(!c || c.type !== 'CallExpression' || c.callee !== r.identifier) return false;
          if(c.arguments.some(a => a.type === 'SpreadElement')) return false;
          const a = c.arguments[k];
          return !a || safe(a); // не передали — undefined или значение по умолчанию
        }) && (top.type !== 'AssignmentPattern' || safe(top.right));
      } finally {
        resolvingSites.delete(fv);
      }
    }
    function paramSafe(def){
      const fn = def.node;
      if(paramsMarked(fn)) return true;
      if(callSitesSafe(fn, def.name)) return true;
      const call = fn.parent;
      if(!(call && call.type === 'CallExpression')) return false;
      const callee = unchain(call.callee);
      // X.map(fn), X.forEach(fn) …
      if(call.arguments[0] === fn && callee.type === 'MemberExpression' && ITER_METHODS.has(nameOf(callee))) return callbackParamSafe(fn, def.name, call, callee.object);
      // f(…, fn): внутри f этот параметр уходит в Y.map(параметр) — тогда так же, с Y из f
      if(callee.type === 'Identifier'){
        const f = functionOf(resolveVar(callee));
        const k = call.arguments.indexOf(fn);
        const p = f && f.params[k];
        if(!p || p.type !== 'Identifier') return false;
        const pv = sc.getDeclaredVariables(f).find(x => x.name === p.name);
        if(!pv) return false;
        const uses = pv.references.filter(r => !r.init);
        if(!uses.length) return false;
        return uses.every(r => {
          const c = r.identifier.parent;
          const cc = c && c.type === 'CallExpression' && c.arguments[0] === r.identifier && unchain(c.callee);
          if(!cc || cc.type !== 'MemberExpression' || !ITER_METHODS.has(nameOf(cc))) return false;
          return callbackParamSafe(fn, def.name, c, cc.object);
        });
      }
      return false;
    }

    // переменная: из чего её собрали
    const resolving = new Set();
    function variableSafe(id){
      const v = resolveVar(id);
      if(!v || !v.defs.length) return false;
      if(resolving.has(v)) return true; // цикл: проверяем по остальным присваиваниям
      resolving.add(v);
      try{
        for(const def of v.defs){
          if(def.type === 'Parameter'){ if(!paramSafe(def)) return false; continue; }
          if(def.type === 'Variable'){
            const d = def.node; // VariableDeclarator
            const loop = d.parent && d.parent.parent;
            if(loop && (loop.type === 'ForOfStatement' || loop.type === 'ForInStatement') && loop.left === d.parent){ if(!safe(loop.right)) return false; continue; }
            // const x = …, const { a, b } = …, const [a, b] = … — безопасно, если безопасно то, чем заполнили
            if(d.init && !safe(d.init)) return false;
            continue;
          }
          // встроенные справочники приложения (import X from '../data/…') — наши файлы
          if(def.type === 'ImportBinding' && def.parent && /\/data\//.test(def.parent.source.value) && def.node.type === 'ImportDefaultSpecifier') continue;
          return false;
        }
        // наполнение контейнера: x[k] = v, x.push(v), x.add(v), x.set(k, v) —
        // ключи и значения тоже должны быть безопасны
        for(const r of v.references){
          const m = r.identifier.parent;
          if(!m || m.type !== 'MemberExpression' || m.object !== r.identifier) continue;
          const up = m.parent;
          if(up && up.type === 'AssignmentExpression' && up.left === m){
            if(m.computed && !safe(m.property)) return false;
            if(!safe(up.right)) return false;
          } else if(up && up.type === 'CallExpression' && up.callee === m && ['push', 'unshift', 'add', 'set', 'splice', 'fill'].includes(nameOf(m))){
            const args = nameOf(m) === 'splice' ? up.arguments.slice(2) : up.arguments;
            if(!args.every(safe)) return false;
          }
        }
        // все прочие присваивания
        for(const r of v.references){
          if(!r.isWrite() || r.init) continue;
          const p = r.identifier.parent;
          if(p.type === 'UpdateExpression') continue; // i++ — число
          if(p.type === 'AssignmentExpression' && p.left === r.identifier){
            if(['-=', '*=', '/=', '%=', '**=', '|=', '&=', '<<=', '>>='].includes(p.operator)) continue;
            if(!safe(p.right)) return false;
            continue;
          }
          return false;
        }
        return true;
      } finally {
        resolving.delete(v);
      }
    }
    // вызов своей функции: безопасно, если безопасно всё, что она возвращает
    function localCallSafe(id){
      const v = resolveVar(id);
      const f = functionOf(v);
      if(!f) return false;
      if(resolvingCalls.has(v)) return true;
      resolvingCalls.add(v);
      try{
        const ret = returned(f);
        return !!ret && ret.every(safe);
      } finally {
        resolvingCalls.delete(v);
      }
    }

    // Безопасно ли поле p у объекта node: объект собран литералом { p: … }
    // (напрямую, через const, или как элемент массива/результат .map) —
    // тогда проверяется только значение этого поля, а не весь объект.
    const propVisiting = new Set();
    function propSafe(node, p, depth){
      node = unchain(node);
      if(!node || depth > 8) return false;
      if(node.type === 'ObjectExpression'){
        if(node.properties.some(pr => pr.type === 'SpreadElement')) return false;
        const pr = node.properties.find(x => !x.computed && (x.key.name === p || x.key.value === p));
        return !!pr && safe(pr.value);
      }
      if(node.type === 'ConditionalExpression') return propSafe(node.consequent, p, depth + 1) && propSafe(node.alternate, p, depth + 1);
      if(node.type === 'MemberExpression' && node.computed) return elemPropSafe(node.object, p, depth + 1); // xs[0].p
      if(node.type === 'CallExpression'){
        const callee = unchain(node.callee);
        if(callee.type === 'MemberExpression' && ['find', 'at', 'pop', 'shift'].includes(nameOf(callee))) return elemPropSafe(callee.object, p, depth + 1);
        if(callee.type === 'Identifier'){
          const f = functionOf(resolveVar(callee));
          const ret = f && returned(f);
          return !!ret && ret.length > 0 && ret.every(r => propSafe(r, p, depth + 1));
        }
        return false;
      }
      if(node.type === 'Identifier'){
        const v = resolveVar(node);
        if(!v || v.defs.length !== 1 || propVisiting.has(v)) return false;
        const def = v.defs[0];
        propVisiting.add(v);
        try{
          if(def.type === 'Variable' && def.node.id.type === 'Identifier' && def.parent.kind === 'const' && def.node.init){
            // поле не переписывают: x.p = …
            const rewritten = v.references.some(r => { const m = r.identifier.parent; return m.type === 'MemberExpression' && m.object === r.identifier && m.parent.type === 'AssignmentExpression' && m.parent.left === m; });
            return !rewritten && propSafe(def.node.init, p, depth + 1);
          }
          if(def.type === 'Parameter'){
            // элемент в X.map(x => …) / X.forEach(x => …)
            const fn = def.node, call = fn.parent;
            if(fn.params[0] !== def.name || !call || call.type !== 'CallExpression' || call.arguments[0] !== fn) return false;
            const callee = unchain(call.callee);
            if(callee.type !== 'MemberExpression' || !ITER_METHODS.has(nameOf(callee)) || nameOf(callee) === 'reduce') return false;
            return elemPropSafe(callee.object, p, depth + 1);
          }
          return false;
        } finally {
          propVisiting.delete(v);
        }
      }
      return false;
    }
    // поле p у каждого элемента коллекции node
    function elemPropSafe(node, p, depth){
      node = unchain(node);
      if(!node || depth > 8) return false;
      if(node.type === 'ArrayExpression') return node.elements.every(e => e && e.type !== 'SpreadElement' && propSafe(e, p, depth + 1));
      if(node.type === 'CallExpression'){
        const callee = unchain(node.callee);
        const m = nameOf(callee);
        if(callee.type === 'MemberExpression' && ['filter', 'sort', 'slice', 'reverse'].includes(m)) return elemPropSafe(callee.object, p, depth + 1);
        if(callee.type === 'MemberExpression' && m === 'map'){
          const ret = returned(node.arguments[0]);
          return !!ret && ret.length > 0 && ret.every(r => propSafe(r, p, depth + 1));
        }
        return false;
      }
      if(node.type === 'Identifier'){
        const v = resolveVar(node);
        if(!v || v.defs.length !== 1 || propVisiting.has(v)) return false;
        const def = v.defs[0];
        if(def.type !== 'Variable' || def.node.id.type !== 'Identifier' || !def.node.init) return false;
        propVisiting.add(v);
        try{
          // элементы, добавленные push/unshift, тоже
          for(const r of v.references){
            const m = r.identifier.parent;
            if(m.type === 'MemberExpression' && m.object === r.identifier){
              const up = m.parent;
              if(up.type === 'CallExpression' && up.callee === m && ['push', 'unshift'].includes(nameOf(m))){
                if(!up.arguments.every(a => a.type !== 'SpreadElement' && propSafe(a, p, depth + 1))) return false;
              } else if(up.type === 'AssignmentExpression' && up.left === m) return false;
            } else if(r.isWrite() && !r.init) return false;
          }
          return elemPropSafe(def.node.init, p, depth + 1);
        } finally {
          propVisiting.delete(v);
        }
      }
      return false;
    }

    // проверить выражение; onBad — что делать с небезопасной частью
    function walk(node, onBad){
      if(!node) return;
      if(marked(node)) return;
      switch(node.type){
        case 'Literal': return;
        case 'TemplateLiteral': node.expressions.forEach(e => walk(e, onBad)); return;
        case 'ConditionalExpression': walk(node.consequent, onBad); walk(node.alternate, onBad); return;
        case 'LogicalExpression':
          if(node.operator !== '&&') walk(node.left, onBad);
          walk(node.right, onBad); return;
        case 'BinaryExpression':
          if(node.operator === '+'){ walk(node.left, onBad); walk(node.right, onBad); }
          return; // прочие операторы дают число или булево
        case 'UnaryExpression': return; // +x, -x, !x, typeof x
        case 'UpdateExpression': return;
        case 'SequenceExpression': walk(node.expressions[node.expressions.length - 1], onBad); return;
        case 'ChainExpression': walk(node.expression, onBad); return;
        case 'AssignmentExpression': walk(node.right, onBad); return;
        case 'Identifier':
          if(['undefined', 'NaN', 'Infinity'].includes(node.name) || htmlNamed(node.name)) return;
          if(variableSafe(node)) return;
          onBad(node); return;
        case 'MemberExpression': {
          const p = nameOf(node);
          if(NUMERIC_PROPS.has(p) || SANITIZED_PROPS.has(p) || htmlNamed(p)) return;
          // поле объекта, собранного здесь же: { left: daysUntil(…), r } — смотрим только это поле
          if(!node.computed && p && propSafe(node.object, p, 0)) return;
          // часть безопасного целого: поле постоянного объекта, элемент постоянного массива
          walk(node.object, () => onBad(node)); return;
        }
        case 'ObjectExpression':
          node.properties.forEach(pr => walk(pr.type === 'SpreadElement' ? pr.argument : pr.value, onBad)); return;
        case 'SpreadElement': walk(node.argument, onBad); return;
        case 'NewExpression': {
          const n = nameOf(node.callee);
          if(n === 'Date') return;
          if(['Set', 'Map', 'Array'].includes(n)){ node.arguments.forEach(a => walk(a, onBad)); return; }
          onBad(node); return;
        }
        case 'CallExpression': {
          const callee = unchain(node.callee);
          const fname = nameOf(callee);
          if(ESCAPERS.has(fname) || SAFE_CALLS.has(fname) || NUMERIC_CALLS.has(fname) || htmlNamed(fname)) return;
          if(callee.type === 'Identifier' && fname === 'String'){ node.arguments.forEach(a => walk(a, onBad)); return; }
          if(callee.type === 'Identifier' && localCallSafe(callee)) return;
          if(callee.type === 'MemberExpression'){
            const obj = unchain(callee.object);
            if(obj.type === 'Identifier' && (obj.name === 'Object' || obj.name === 'Array') && ['keys', 'values', 'entries', 'from', 'of'].includes(fname)){
              if(fname === 'from' && node.arguments[1]){ const ret = returned(node.arguments[1]); if(ret){ ret.forEach(r => walk(r, onBad)); return; } }
              node.arguments.slice(0, fname === 'of' ? undefined : 1).forEach(a => walk(a, onBad)); return;
            }
            if(obj.type === 'Identifier' && NUMERIC_OBJECTS.has(obj.name)) return; // Math.round, Date.now, Number.isFinite
            if(NUMERIC_METHODS.has(fname) || LOCALE_METHODS.has(fname)) return;
            if(fname === 'join'){
              node.arguments.forEach(a => walk(a, onBad));
              const inner = obj.type === 'CallExpression' ? obj : null;
              if(inner && ['map', 'flatMap'].includes(nameOf(inner.callee))){
                const cb = inner.arguments[0];
                if(cb && cb.type === 'Identifier' && (htmlNamed(cb.name) || ESCAPERS.has(cb.name) || SAFE_CALLS.has(cb.name) || NUMERIC_CALLS.has(cb.name) || localCallSafe(cb))) return;
                const ret = returned(cb);
                if(ret){ ret.forEach(r => walk(r, onBad)); return; }
              }
              // массив без .map: безопасно, если безопасен сам массив
              walk(obj, onBad); return;
            }
            if(STRING_METHODS.has(fname) || fname === 'toLocaleString'){ walk(obj, onBad); return; }
            if(fname === 'replace' || fname === 'replaceAll'){
              // замена постоянной строкой: безопасно, если безопасно исходное
              walk(obj, onBad);
              const rep = node.arguments[1];
              if(rep && /Function/.test(rep.type)) (returned(rep) || [rep]).forEach(r => walk(r, onBad)); else walk(rep, onBad);
              return;
            }
            if(fname === 'get'){ walk(obj, onBad); return; } // Map.get — безопасно, если безопасен весь Map
            if(fname === 'concat'){ walk(obj, onBad); node.arguments.forEach(a => walk(a, onBad)); return; }
            if(['filter', 'slice', 'sort', 'reverse', 'flat'].includes(fname)){ walk(obj, onBad); return; }
            if(fname === 'fill'){ walk(obj, onBad); walk(node.arguments[0], onBad); return; }
            if(fname === 'map' || fname === 'flatMap'){
              const cb = node.arguments[0];
              if(cb && cb.type === 'Identifier' && htmlNamed(cb.name)) return; // X.map(rowHtml)
              if(cb && cb.type === 'Identifier' && (NUMERIC_CALLS.has(cb.name) || ESCAPERS.has(cb.name) || SAFE_CALLS.has(cb.name))) return; // X.map(Number), X.map(escapeHtml)
              if(cb && cb.type === 'Identifier' && localCallSafe(cb)) return; // X.map(btn), где btn — своя функция
              if(cb && cb.type === 'Identifier' && cb.name === 'String'){ walk(obj, onBad); return; }
              const ret = returned(cb);
              if(ret){ ret.forEach(r => walk(r, onBad)); return; }
            }
            if(fname === 'reduce' && node.arguments.length > 1){
              walk(node.arguments[1], onBad);
              const ret = returned(node.arguments[0]);
              if(ret){ ret.forEach(r => walk(r, onBad)); return; }
            }
          }
          onBad(node); return;
        }
        case 'ArrayExpression': node.elements.forEach(e => walk(e, onBad)); return;
        default:
          onBad(node);
      }
    }
    function safe(node){
      let ok = true;
      walk(node, () => { ok = false; });
      return ok;
    }

    const reported = new Set();
    const report = node => {
      const key = node.range.join(':');
      if(reported.has(key)) return;
      reported.add(key);
      const t = sc.getText(node).replace(/\s+/g, ' ');
      context.report({ node, messageId: 'unsafe', data: { text: t.length > 60 ? t.slice(0, 57) + '…' : t } });
    };
    const checkSink = node => {
      if(node.type === 'TemplateLiteral' && isHtmlTemplate(node)) return; // проверит обработчик шаблонов
      walk(node, report);
    };

    return {
      TemplateLiteral(node){
        if(node.parent && node.parent.type === 'TaggedTemplateExpression') return;
        if(isHtmlTemplate(node)) node.expressions.forEach(e => walk(e, report));
      },
      AssignmentExpression(node){
        const p = nameOf(node.left);
        if(node.left.type === 'MemberExpression' && (p === 'innerHTML' || p === 'outerHTML')) checkSink(node.right);
      },
      CallExpression(node){
        if(nameOf(node.callee) === 'insertAdjacentHTML' && node.arguments[1]) checkSink(node.arguments[1]);
      },
    };
  },
};
