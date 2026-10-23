// Политика безопасности содержимого (CSP) для собранного index.html.
// Встроенные скрипты разрешаются только по SHA-256 их текста: всё, что
// попадёт в страницу иначе (атрибут onerror в подложенном названии, внедрённый
// <script>), браузер не выполнит. Сетевые запросы — только к тем сервисам,
// которыми пользуется приложение, поэтому даже проскочивший код не сможет
// отправить данные на посторонний адрес через fetch.
// Вызывается из сборки (vite.config.mjs) и из build-friends.mjs; можно и вручную:
//   node scripts/csp.mjs index.html friends/index.html
import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const CSP_CONNECT = [
  'https://nominatim.openstreetmap.org', // поиск мест
  'https://router.project-osrm.org',     // маршрут по дорогам
  'https://api.github.com',              // синхронизация
];
const XLSX_CDN = 'https://cdnjs.cloudflare.com'; // запасной источник модуля Excel (с проверкой целостности)

export function inlineScriptHashes(html){
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while((m = re.exec(html))){
    const attrs = m[1];
    if(/\bsrc\s*=/.test(attrs)) continue;
    if(/type\s*=\s*["']application\/(ld\+)?json["']/i.test(attrs)) continue; // данные, не код
    out.push("'sha256-" + crypto.createHash('sha256').update(m[2], 'utf8').digest('base64') + "'");
  }
  return out;
}

export function buildPolicy(html){
  return [
    "default-src 'self'",
    `script-src 'self' ${inlineScriptHashes(html).join(' ')} ${XLSX_CDN}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    `connect-src 'self' ${CSP_CONNECT.join(' ')}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

const META_RE = /<meta http-equiv="Content-Security-Policy" content="[^"]*">\n?/;
export function applyCsp(html){
  // старую политику убираем до подсчёта: её текст не входит в скрипты, но так проще читать
  let out = html.replace(META_RE, '');
  const meta = `<meta http-equiv="Content-Security-Policy" content="${buildPolicy(out)}">\n`;
  // сразу после кодировки — до любого скрипта и стиля
  const at = out.search(/<meta charset=[^>]*>\n?/i);
  if(at < 0) throw new Error('csp: не найден <meta charset>');
  const end = out.indexOf('>', at) + 1;
  const nl = out[end] === '\n' ? end + 1 : end;
  return out.slice(0, nl) + meta + out.slice(nl);
}

if(process.argv[1] === fileURLToPath(import.meta.url)){
  const files = process.argv.slice(2);
  (files.length ? files : ['index.html']).forEach(f => {
    fs.writeFileSync(f, applyCsp(fs.readFileSync(f, 'utf8')));
    console.log('CSP обновлена:', f);
  });
}
