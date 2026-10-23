// Сборка «Карты путешествий»: исходники в src/, на выходе — один самодостаточный
// index.html (стили, Leaflet, данные и код внутри файла), как и раньше.
// После сборки файл копируется в корень репозитория: GitHub Pages отдаёт его оттуда.
import { applyCsp } from './scripts/csp.mjs';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.dirname(new URL(import.meta.url).pathname);

// Шрифт флагов вшивается в маленький скрипт в <head>, который решает, нужен ли он
function flagFont(){
  return {
    name: 'flag-font',
    transformIndexHtml(html){
      const b64 = fs.readFileSync(path.join(ROOT, 'src/assets/flags.woff2')).toString('base64');
      return html.replace('__FLAG_FONT_B64__', b64);
    }
  };
}

// Код приложения лежит частями в src/app/NN-раздел.js. Части пока делят одно
// пространство имён (так было в едином файле), поэтому сборка склеивает их по
// порядку номеров в один модуль. Независимую логику постепенно выносим в
// настоящие ES-модули src/lib/ с явными import/export и модульными тестами.
const APP_DIR = path.join(ROOT, 'src/app');
const APP_ID = path.join(APP_DIR, 'index.js'); // виртуальный файл, на диске его нет
function appParts(){
  return {
    name: 'app-parts',
    enforce: 'pre',
    resolveId(source){ if(source === 'virtual:app') return APP_ID; return null; },
    load(id){
      if(id !== APP_ID) return null;
      const files = fs.readdirSync(APP_DIR).filter(f => /^\d\d[\w-]*\.js$/.test(f)).sort();
      return files.map(f => {
        const file = path.join(APP_DIR, f);
        this.addWatchFile(file);
        return `// ===== src/app/${f} =====\n` + fs.readFileSync(file, 'utf8');
      }).join('\n');
    }
  };
}

// Окно для отладки и автотестов. Код приложения — ES-модуль, его имена снаружи
// не видны, и самому приложению глобальные имена не нужны (обработчики навешиваются
// через addEventListener). Но в консоли и в автотестах удобно добраться до
// данных и функций: плагин собирает из кода список верхнеуровневых объявлений и
// публикует их одним объектом window.__travelMap (свойства-ссылки, переменные
// let можно и менять). Список строится при сборке, новые функции попадают в него сами.
// Под автоматизацией браузера (navigator.webdriver — Playwright, Selenium) имена
// дополнительно повторяются на window (поверх одноимённых, например элемента #map),
// чтобы тесты могли писать просто entries,
// а не __travelMap.entries. У обычного посетителя window остаётся чистым.
function debugHook(){
  return {
    name: 'debug-hook',
    enforce: 'pre',
    transform(code, id){
      if(id !== APP_ID) return null;
      const ast = this.parse(code);
      const fns = [], consts = [], lets = [];
      const collect = (pat, bucket) => {
        if(!pat) return;
        if(pat.type === 'Identifier') bucket.push(pat.name);
        else if(pat.type === 'ObjectPattern') pat.properties.forEach(p => collect(p.type === 'RestElement' ? p.argument : p.value, bucket));
        else if(pat.type === 'ArrayPattern') pat.elements.forEach(e => collect(e, bucket));
        else if(pat.type === 'AssignmentPattern') collect(pat.left, bucket);
        else if(pat.type === 'RestElement') collect(pat.argument, bucket);
      };
      for(const node of ast.body){
        if(node.type === 'ImportDeclaration') node.specifiers.forEach(sp => consts.push(sp.local.name));
        else if(node.type === 'FunctionDeclaration' && node.id) fns.push(node.id.name);
        else if(node.type === 'ClassDeclaration' && node.id) consts.push(node.id.name);
        else if(node.type === 'VariableDeclaration') node.declarations.forEach(d => collect(d.id, node.kind === 'const' ? consts : lets));
      }
      // имена внутри обёртки — с подчёркиваниями, чтобы не заслонить одноимённые имена приложения
      const props = fns.concat(consts).map(n => `${JSON.stringify(n)}:__d(()=>${n})`)
        .concat(lets.map(n => `${JSON.stringify(n)}:__d(()=>${n},__v=>{${n}=__v})`)).join(',');
      const hook = `\n;(()=>{const __d=(get,set)=>({get,set,configurable:true});const __p={${props}};` +
        `Object.defineProperty(window,'__travelMap',{value:Object.defineProperties({},__p),configurable:true});` +
        `if(navigator.webdriver){for(const __k in __p){try{Object.defineProperty(window,__k,__p[__k])}catch(__e){}}}})();\n`;
      return { code: code + hook, map: null };
    }
  };
}

// готовый файл — в корень репозитория (вариант A: Pages отдаёт его из ветки)
function copyToRoot(){
  return {
    name: 'copy-to-root',
    closeBundle(){
      // политика безопасности считается по уже собранному файлу: хэши встроенных скриптов
      const out = path.join(ROOT, 'dist/index.html');
      fs.writeFileSync(out, applyCsp(fs.readFileSync(out, 'utf8')));
      fs.copyFileSync(out, path.join(ROOT, 'index.html'));
    }
  };
}

export default defineConfig({
  root: 'src',
  base: './',
  json: { stringify: true },
  plugins: [flagFont(), appParts(), debugHook(), viteSingleFile({ removeViteModuleLoader: true }), copyToRoot()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2019',
    // карта должна открываться и с диска: никаких отдельных файлов рядом
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 4000,
    reportCompressedSize: false
  }
});
