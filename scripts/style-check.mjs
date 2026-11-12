// Проверка оформления (часть npm run lint). Размеры, цвета и слои задаются
// переменными в начале src/styles/app.css, а не числами в каждом правиле.
//   Размеры текста — только из шкалы --fs-*; мельче 11 px текста нет.
//   • font-size числом меньше 26 px — ошибка: используйте var(--fs-1…7);
//     крупные декоративные цифры и значки (от 26 px) можно числом;
//   • исключение — строка с пометкой fs-ok и причиной (значок-эмодзи,
//     аварийный баннер, которому нельзя зависеть от стилей).
//   Цвета (#abc, rgb(…), rgba(…) числами) — только в блоках переменных
//     :root и [data-theme='dark']; в правилах — var(--…), а с прозрачностью
//     rgb(var(--…-rgb) / 0.3). Во встроенных style="…" в разметке и шаблонах
//     тоже. Цвета, которыми рисуют на холсте и в Leaflet (опции слоёв), сюда
//     не относятся.
//   z-index — переменные --z-* (слои страницы); 0–9 можно числом для порядка
//     внутри одного блока.
//   Пометка style-ok с причиной снимает проверку цвета и слоя на строке.
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
  out.push(...checkCssTokens(root));
  out.push(
    ...checkInlineColors(
      root,
      files.filter(f => f !== 'src/styles/app.css')
    )
  );
  return out;
}

const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d/g;

// цвета и z-index в стилях: числами — только в блоках переменных
function checkCssTokens(root) {
  const file = 'src/styles/app.css';
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  const out = [];
  const lineAt = i => text.slice(0, i).split('\n').length;
  for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1].trim().split('\n').pop().trim();
    if (/^(:root|\[data-theme='dark'\])$/.test(selector)) continue;
    const body = m[2],
      start = m.index + m[0].indexOf('{') + 1;
    for (const c of body.matchAll(COLOR_RE)) {
      const line = lineAt(start + c.index);
      if (/style-ok/.test(text.split('\n')[line - 1])) continue;
      out.push({
        file,
        line,
        col: 1,
        sev: 2,
        rule: 'color-token',
        msg: `цвет «${c[0]}…» числом в правиле ${selector}: заведите переменную в :root (и для тёмной темы) и пишите var(--…)`
      });
    }
    for (const z of body.matchAll(/z-index\s*:\s*(-?\d+)/g)) {
      if (Math.abs(+z[1]) <= 9) continue;
      const line = lineAt(start + z.index);
      if (/style-ok/.test(text.split('\n')[line - 1])) continue;
      out.push({ file, line, col: 1, sev: 2, rule: 'z-token', msg: `z-index ${z[1]} числом в правиле ${selector}: используйте слой var(--z-…) из :root` });
    }
  }
  return out;
}

// цвета во встроенных style="…" в разметке и шаблонах
function checkInlineColors(root, files) {
  const out = [];
  for (const file of files) {
    fs.readFileSync(path.join(root, file), 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (/style-ok/.test(line)) return;
        for (const st of line.matchAll(/style="([^"]*)"/g)) {
          const c = st[1].match(/#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d/);
          if (c)
            out.push({
              file,
              line: i + 1,
              col: st.index + 1,
              sev: 2,
              rule: 'color-token',
              msg: `цвет «${c[0]}…» числом во встроенном стиле: используйте var(--…)`
            });
        }
      });
  }
  return out;
}
