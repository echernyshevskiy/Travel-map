// Сборка «Карты путешествий»: исходники в src/, на выходе — один самодостаточный
// index.html (стили, Leaflet, данные и код внутри файла), как и раньше.
// После сборки файл копируется в корень репозитория: GitHub Pages отдаёт его оттуда.
import { applyCsp } from './scripts/csp.mjs';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { packGeoExact } from './src/lib/geo-pack.js';

const ROOT = path.dirname(new URL(import.meta.url).pathname);

// Шрифт флагов (78 КБ) — отдельным файлом fonts/flags.woff2: он нужен только
// там, где система не рисует флаги-эмодзи (Chrome и Edge на Windows), и раньше,
// вшитый в страницу, скачивался всеми. Маленький скрипт в <head> подключает его
// по необходимости; сервис-воркер хранит файл для работы без сети. ?v= — хэш
// содержимого: новая версия шрифта не застрянет в кэше.
const FLAG_FONT_SRC = path.join(ROOT, 'src/assets/flags.woff2');
const flagFontUrl = () => 'fonts/flags.woff2?v=' + crypto.createHash('sha256').update(fs.readFileSync(FLAG_FONT_SRC)).digest('hex').slice(0, 8);
function flagFont(){
  return {
    name: 'flag-font',
    transformIndexHtml(html){ return html.replace('__FLAG_FONT_URL__', flagFontUrl()); }
  };
}

// Шрифты интерфейса (Playfair Display, EB Garamond, Courier Prime; лицензия OFL)
// — из пакетов @fontsource, файлами в fonts/ рядом с приложением. Наборы знаков
// разбиты как у Google (кириллица, латиница, расширенная латиница) с
// unicode-range, так что браузер качает только нужные. ?v= — хэш файла.
const APP_FONTS = [
  ['Playfair Display', 'playfair-display', [[600, 'normal'], [700, 'normal'], [600, 'italic'], [700, 'italic']]],
  ['EB Garamond', 'eb-garamond', [[400, 'normal'], [500, 'normal'], [600, 'normal'], [400, 'italic'], [500, 'italic']]],
  ['Courier Prime', 'courier-prime', [[400, 'normal'], [700, 'normal']]],
];
const FONT_SUBSETS = ['cyrillic', 'latin-ext', 'latin'];
function appFontFaces(){
  const faces = [], files = [];
  for(const [family, pkg, styles] of APP_FONTS){
    const dir = path.join(ROOT, 'node_modules/@fontsource', pkg);
    for(const [w, st] of styles) for(const sub of FONT_SUBSETS){
      const name = `${pkg}-${sub}-${w}-${st}.woff2`, src = path.join(dir, 'files', name);
      if(!fs.existsSync(src)) continue;                 // у Courier Prime нет кириллицы
      // unicode-range — из общего файла начертания, из блока именно этого набора
      const all = fs.readFileSync(path.join(dir, `${w}${st === 'italic' ? '-italic' : ''}.css`), 'utf8');
      const block = all.split('@font-face').find(b => b.includes('/' + name + ')'));
      const range = block && (block.match(/unicode-range:\s*([^;]+);/) || [])[1];
      if(!range || !fs.existsSync(src)) throw new Error('шрифт не найден: ' + name);
      const v = crypto.createHash('sha256').update(fs.readFileSync(src)).digest('hex').slice(0, 8);
      files.push({ name, src });
      faces.push(`@font-face{font-family:'${family}';font-style:${st};font-weight:${w};font-display:swap;src:url(fonts/${name}?v=${v}) format('woff2');unicode-range:${range.trim()};}`);
    }
  }
  return { css: faces.join(''), files };
}
// Полный адрес сайта — для превью ссылки (og:image, og:url): мессенджеры
// относительный адрес картинки не понимают. Берётся из package.json → homepage.
const SITE_URL = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).homepage;
if(!/^https:\/\/.+\/$/.test(SITE_URL || '')) throw new Error('package.json: homepage должен быть полным адресом сайта со слешем в конце');
function siteUrl(){
  return { name: 'site-url', transformIndexHtml: { order: 'post', handler: html => html.split('__SITE_URL__').join(SITE_URL) } };
}
function appFonts(){
  return {
    name: 'app-fonts',
    // после сборки: иначе Vite пытается сам разрешить url(fonts/…) как свой ресурс
    // (пустой <style id="appFonts"> — не комментарий-метка: Vite 8 вычищает комментарии)
    transformIndexHtml: { order: 'post', handler: html => {
      const re = /<style id="appFonts">[\s\S]*?<\/style>/;
      if(!re.test(html)) throw new Error('app-fonts: в index.html нет <style id="appFonts">');
      return html.replace(re, () => `<style id="appFonts">${appFontFaces().css}</style>`);
    } }
  };
}

// Контуры стран и регионов России встраиваются не GeoJSON-ом, а компактной
// строкой без потерь (src/lib/geo-pack.js): вдвое меньше. Импорт с ?geopack.
function geoPack(){
  const PREFIX = '\0geopack:';
  return {
    name: 'geo-pack',
    enforce: 'pre',
    resolveId(source, importer){
      if(!source.endsWith('.json?geopack')) return null;
      return PREFIX + path.resolve(path.dirname(importer), source.replace(/\?geopack$/, '')).replace(/\.json$/, '');
    },
    load(id){
      if(!id.startsWith(PREFIX)) return null;
      const file = id.slice(PREFIX.length) + '.json';
      const p = packGeoExact(JSON.parse(fs.readFileSync(file, 'utf8')));
      if(!p) throw new Error('geo-pack: не удалось записать без потерь ' + file);
      return `import { unpackGeo } from ${JSON.stringify(path.join(ROOT, 'src/lib/geo-pack.js'))};\n` +
        `export default unpackGeo(${JSON.stringify(p.props)}, ${JSON.stringify(p.geom)});`;
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
      // сборка упала раньше — не заслоняем её ошибку своей
      if(!fs.existsSync(out)) return;
      fs.writeFileSync(out, applyCsp(fs.readFileSync(out, 'utf8')));
      fs.copyFileSync(out, path.join(ROOT, 'index.html'));
      fs.mkdirSync(path.join(ROOT, 'fonts'), { recursive: true });
      fs.copyFileSync(FLAG_FONT_SRC, path.join(ROOT, 'fonts/flags.woff2'));
      // шрифты интерфейса; лишние (от прошлых версий) — убираем
      const keep = new Set(['flags.woff2']);
      for(const f of appFontFaces().files){ fs.copyFileSync(f.src, path.join(ROOT, 'fonts', f.name)); keep.add(f.name); }
      for(const f of fs.readdirSync(path.join(ROOT, 'fonts'))) if(!keep.has(f)) fs.rmSync(path.join(ROOT, 'fonts', f));
    }
  };
}

export default defineConfig({
  root: 'src',
  base: './',
  json: { stringify: true },
  plugins: [flagFont(), appFonts(), siteUrl(), geoPack(), appParts(), debugHook(), viteSingleFile({ removeViteModuleLoader: true }), copyToRoot()],
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
