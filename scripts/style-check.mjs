// Проверка оформления (часть npm run lint): размеры текста — только из шкалы
// --fs-* (src/styles/app.css). Мельче 11 px текста в интерфейсе нет.
//   • font-size числом меньше 26 px — ошибка: используйте var(--fs-1…7);
//     крупные декоративные цифры и значки (от 26 px) можно числом;
//   • исключение — строка с пометкой fs-ok и причиной (значок-эмодзи,
//     аварийный баннер, которому нельзя зависеть от стилей).
// Проверяются src/styles/app.css, src/index.html и строки в src/app/*.js.
// Рисунки на холсте (ctx.font) и подписи внутри SVG масштабируются вместе
// с картинкой и сюда не относятся.
import fs from 'node:fs';
import path from 'node:path';

const FONT_MIN_FREE = 26; // от этого размера — декоративное, можно числом

export function checkStyles(root) {
  const out = [];
  const files = [
    'src/styles/app.css',
    'src/index.html',
    ...fs
      .readdirSync(path.join(root, 'src/app'))
      .filter(f => f.endsWith('.js'))
      .map(f => 'src/app/' + f)
  ];
  for (const file of files) {
    const lines = fs.readFileSync(path.join(root, file), 'utf8').split('\n');
    lines.forEach((line, i) => {
      for (const m of line.matchAll(/font-size\s*:\s*([0-9.]+)px/g)) {
        if (+m[1] >= FONT_MIN_FREE || /fs-ok/.test(line)) continue;
        out.push({
          file,
          line: i + 1,
          col: m.index + 1,
          sev: 2,
          rule: 'font-scale',
          msg: `размер текста ${m[1]}px вне шкалы: используйте var(--fs-1…7) из src/styles/app.css (или пометку fs-ok с причиной)`
        });
      }
    });
  }
  return out;
}
