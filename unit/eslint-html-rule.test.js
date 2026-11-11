// Правило проверки кода «данные в разметку — только экранированными»
// (scripts/eslint-html-rule.mjs): что пропускает и что ловит.
import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import rule from '../scripts/eslint-html-rule.mjs';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;
const tester = new RuleTester({ languageOptions: { ecmaVersion: 2023, sourceType: 'module' } });
const bad = (code, n = 1) => ({ code, errors: Array.from({ length: n }, () => ({ messageId: 'unsafe' })) });

tester.run('escaped-html', rule, {
  valid: [
    // экранирование
    'el.innerHTML = `<b>${escapeHtml(entry.name)}</b>`;',
    'el.innerHTML = `<a href="${escapeAttr(safeUrl(e.url))}">x</a>`;',
    // числа и булевы
    'el.innerHTML = `<b>${list.length}</b><i>${a * 2}</i><s>${Math.round(x)}</s><u>${(+x).toFixed(1)}</u>`;',
    // поля, проверяемые при загрузке
    'el.innerHTML = `<div data-id="${e.id}" style="color:${e.color}">${e.year}</div>`;',
    // постоянные строки, условия, вложенные шаблоны
    'el.innerHTML = `<b>${ok ? "да" : `нет ${n.length}`}</b>`;',
    // map/join с экранированием внутри, индекс
    'el.innerHTML = `<ul>${items.map((x, i) => `<li data-i="${i}">${escapeHtml(x.name)}</li>`).join("")}</ul>`;',
    // элементы постоянного массива
    'const COLORS = ["#fff", "#000"]; el.innerHTML = COLORS.map(c => `<i style="color:${c}"></i>`).join("");',
    // поле постоянного объекта
    'const T = [{ ru: "Город" }]; el.innerHTML = T.map(t => `<b>${t.ru}</b>`).join("");',
    // переменная, собранная из безопасного
    'let n = 0; n++; const s = `${n} шт.`; el.innerHTML = `<b>${s}</b>`;',
    // имя с Html — готовая разметка
    'const rowsHtml = build(); el.innerHTML = `<div>${rowsHtml}</div>`;',
    // своя функция, возвращающая постоянные строки
    'const kind = e => e.type === "city" ? "город" : "страна"; el.innerHTML = `<b>${kind(e)}</b>`;',
    // параметр своей функции, которой везде передают числа
    'function ring(size){ return `<svg width="${size}"></svg>`; } a.innerHTML = ring(46); b.innerHTML = ring(64);',
    // помощник, который получает функцию-обработчик строки
    'function section(items, rowHtml){ return `<div>${items.map(rowHtml).join("")}</div>`; } el.innerHTML = section(list, (m, i) => `<p data-i="${i}">${escapeHtml(m.name)}</p>`);',
    // пометка
    'el.innerHTML = `<b>${raw /* html-ok: уже разметка из нашего шаблона */}</b>`;',
    '// html-ok: проверено выше\nel.innerHTML = `<b>${raw}</b>`;',
    // шаблон без тегов — не разметка
    'toast(`Удалено: ${entry.name}`);',
    // ключи объекта, набранные из годов (они проверяются при загрузке)
    'const by = {}; list.forEach(e => { by[e.year] = (by[e.year] || 0) + 1; }); el.innerHTML = Object.keys(by).map(y => `<b>${y}: ${by[y]}</b>`).join("");',
    // поле объекта, собранного литералом: проверяется только это поле
    'const up = races.map(r => ({ r, left: daysUntil(r.date) })).filter(x => x.left >= 0)[0]; const daysUntil = d => 5; el.innerHTML = `<b>${up.left}</b>`;',
    'const rows = []; list.forEach(d => rows.push({ label: "x", entry: d, count: d.items.length })); el.innerHTML = rows.map(r => `<b>${r.label} ${r.count}</b>`).join("");',
    // reduce по числам
    'const total = list.reduce((s, e) => s + e.n.length, 0); el.innerHTML = `<b>${total}</b>`;'
  ],
  invalid: [
    bad('el.innerHTML = `<b>${entry.name}</b>`;'),
    bad('el.innerHTML = "<b>" + entry.name + "</b>";'),
    bad('el.insertAdjacentHTML("beforeend", `<i>${note}</i>`);'),
    bad('el.innerHTML = `<b>${cond ? entry.name : "—"}</b>`;'),
    bad('el.innerHTML = `<ul>${items.map(x => `<li>${x.name}</li>`).join("")}</ul>`;'),
    // элемент данных — не безопасен, даже если это параметр обработчика
    bad('el.innerHTML = allEntries.map(e => `<b>${e.trip}</b>`).join("");'),
    // переменная, которой где-то присвоили данные
    bad('let s = "x"; s = entry.notes; el.innerHTML = `<b>${s}</b>`;'),
    // параметр своей функции, которой хоть раз передали данные
    // (отмечены и сама подстановка, и оба места, где результат уходит в разметку)
    bad('function chip(t){ return `<b>${t}</b>`; } a.innerHTML = chip("ок"); b.innerHTML = chip(entry.name);', 3),
    // элемент, переданный помощнику: строку он получает без экранирования
    bad('function section(items, rowHtml){ return `<div>${items.map(rowHtml).join("")}</div>`; } el.innerHTML = section(list, m => `<p>${m.name}</p>`);'),
    // функция, которая возвращает данные
    bad('const title = e => e.name; el.innerHTML = `<b>${title(e)}</b>`;'),
    // неизвестный вызов
    bad('el.innerHTML = `<b>${getLabel(e)}</b>`;'),
    // ключи объекта, набранные из данных
    bad('const by = {}; list.forEach(e => { by[e.trip] = 1; }); el.innerHTML = Object.keys(by).map(t => `<b>${t}</b>`).join("");'),
    bad('const names = []; list.forEach(e => names.push(e.name)); el.innerHTML = `<p>${names.join(", ")}</p>`;'),
    // а соседнее поле с данными — нет
    bad('const rows = []; list.forEach(d => rows.push({ label: d.name, count: 1 })); el.innerHTML = rows.map(r => `<b>${r.label}</b>`).join("");'),
    // присваивание не шаблоном
    bad('el.innerHTML = entry.notes;')
  ]
});
