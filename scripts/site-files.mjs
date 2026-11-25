// Складывает опубликованный сайт в папку (по умолчанию _site) для GitHub Pages:
//   node scripts/site-files.mjs _site
// Берёт файлы репозитория, которые нужны сайту, — основную версию, версию для
// друзей, шрифты, границы, обложки, библиотеки, значки — и пропускает исходники,
// тесты, служебные файлы. index.html, friends/index.html и friends/sw.js берутся
// с диска (их только что собрали), остальное — как в репозитории.
// Вызывается из .github/workflows/friends.yml.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// папки и файлы, которые сайту не нужны
const SKIP_DIRS = ['src', 'tests', 'unit', 'scripts', 'docs', '.github', '.githooks', 'node_modules'];
const SKIP_FILES = /^(package(-lock)?\.json|[\w.-]+\.config\.(m?js|cjs)|\.[\w.-]+|README\.md|DEVELOPMENT\.md)$/;
// собранные файлы — с диска, даже если в репозитории их нет
const BUILT = ['index.html', 'friends/index.html', 'friends/sw.js'];
// папки, которые сборка заполняет сама (шрифты из @fontsource, библиотека карты):
// берём всё, что в них лежит после сборки, а не только то, что закоммичено, —
// иначе забытый в коммите файл молча пропал бы с сайта
const BUILT_DIRS = ['fonts', 'vendor'];

export function siteFiles(tracked, onDisk = []) {
  const keep = [...tracked, ...onDisk].filter(f => {
    const top = f.split('/')[0];
    if (SKIP_DIRS.includes(top)) return false;
    if (!f.includes('/') && SKIP_FILES.test(f)) return false;
    return true;
  });
  return [...new Set([...keep, ...BUILT])].sort();
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const out = path.resolve(process.argv[2] || '_site');
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root }).toString().split('\0').filter(Boolean);
  const walk = dir =>
    fs.existsSync(path.join(root, dir))
      ? fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(d => (d.isDirectory() ? walk(`${dir}/${d.name}`) : [`${dir}/${d.name}`]))
      : [];
  const files = siteFiles(tracked, BUILT_DIRS.flatMap(walk));
  for (const f of BUILT)
    if (!fs.existsSync(path.join(root, f))) {
      console.error(`Ошибка: нет ${f} — сначала соберите сайт (npm run build и scripts/build-friends.mjs)`);
      process.exit(1);
    }
  fs.rmSync(out, { recursive: true, force: true });
  let bytes = 0;
  for (const f of files) {
    const src = path.join(root, f);
    if (!fs.existsSync(src)) continue; // удалён в рабочей копии
    const dst = path.join(out, f);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    bytes += fs.statSync(dst).size;
  }
  console.log(`Сайт сложен в ${path.relative(root, out) || out}: файлов ${files.length}, ${(bytes / 1048576).toFixed(1)} МБ`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
