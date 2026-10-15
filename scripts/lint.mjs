// Проверка кода ESLint.
// Разделы src/app/NN-*.js делят одно пространство имён (сборка склеивает их в
// один модуль), поэтому по отдельности их проверять бессмысленно: каждое имя из
// соседнего раздела выглядело бы необъявленным. Скрипт склеивает их так же, как
// сборка, проверяет целиком и переводит номера строк обратно в исходные файлы.
// src/lib/ — обычные модули, проверяются как есть.
//   node scripts/lint.mjs          — ошибки (выход с кодом 1) и предупреждения
import { ESLint } from 'eslint';
import js from '@eslint/js';
import globals from 'globals';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const APP = path.join(ROOT, 'src/app');

const rules = {
  ...js.configs.recommended.rules,
  // настоящие ошибки
  'no-undef': 'error',
  'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
  // привычный стиль кода, а не ошибка
  'no-empty': ['error', { allowEmptyCatch: true }],
  'no-useless-escape': 'off',
  'no-control-regex': 'off',
  'no-cond-assign': ['error', 'except-parens'],
  'no-prototype-builtins': 'off',
  'no-misleading-character-class': 'off', // флаги-эмодзи в регулярных выражениях
};
const eslint = new ESLint({
  cwd: ROOT,
  overrideConfigFile: true,
  overrideConfig: [{
    languageOptions: {
      ecmaVersion: 2023, sourceType: 'module',
      globals: {
        ...globals.browser,
        L: 'readonly',                    // Leaflet (src/vendor/leaflet-global.js)
        XLSX: 'readonly',                 // SheetJS — подгружается по требованию при экспорте в Excel
        showFatalErrorBanner: 'readonly', // из классического скрипта в <head> index.html
      },
    },
    rules,
  }],
});

// склейка разделов с таблицей «строка склейки → файл и строка»
const parts = fs.readdirSync(APP).filter(f => /^\d\d[\w-]*\.js$/.test(f)).sort();
let code = '', line = 1;
const spans = [];
for(const f of parts){
  const src = fs.readFileSync(path.join(APP, f), 'utf8').replace(/\n?$/, '\n');
  spans.push({ file: 'src/app/' + f, from: line });
  code += src;
  line += src.split('\n').length - 1;
}
const where = l => { let s = spans[0]; for(const x of spans) if(x.from <= l) s = x; return { file: s.file, line: l - s.from + 1 }; };

const results = [];
const [app] = await eslint.lintText(code, { filePath: path.join(APP, 'index.js') });
app.messages.forEach(m => results.push({ ...where(m.line), col: m.column, sev: m.severity, msg: m.message, rule: m.ruleId }));
for(const r of await eslint.lintFiles(['src/lib/*.js'])){
  r.messages.forEach(m => results.push({ file: path.relative(ROOT, r.filePath), line: m.line, col: m.column, sev: m.severity, msg: m.message, rule: m.ruleId }));
}

results.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
for(const r of results) console.log(`${r.sev === 2 ? 'ошибка' : 'внимание'}  ${r.file}:${r.line}:${r.col}  ${r.msg}  (${r.rule})`);
const errors = results.filter(r => r.sev === 2).length, warns = results.length - errors;
console.log(errors || warns ? `\nошибок: ${errors}, предупреждений: ${warns}` : 'Код чистый: ошибок и предупреждений нет');
process.exit(errors ? 1 : 0);
