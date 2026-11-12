// Расстояние Левенштейна с порогом: «не больше k правок?». Для поиска похожих
// названий в проверке данных нужен только ответ «0, 1, 2 или больше», а полная
// таблица m×n на каждую пару занимала полсекунды на большом архиве при запуске.
// Считаем только полосу шириной 2k+1 вокруг диагонали и выходим, как только
// вся строка полосы превысила порог. unit/text-distance.test.js.

// Расстояние, если оно не больше k, иначе k + 1
export function levenshteinWithin(a, b, k) {
  const m = a.length,
    n = b.length;
  if (Math.abs(m - n) > k) return k + 1;
  if (a === b) return 0;
  if (m === 0) return n <= k ? n : k + 1;
  if (n === 0) return m <= k ? m : k + 1;
  const BIG = k + 1;
  let prev = new Array(n + 1),
    cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j <= k ? j : BIG;
  for (let i = 1; i <= m; i++) {
    const from = Math.max(1, i - k),
      to = Math.min(n, i + k);
    cur[0] = i <= k ? i : BIG;
    if (from > 1) cur[from - 1] = BIG;
    let rowMin = cur[0];
    const ai = a.charCodeAt(i - 1);
    for (let j = from; j <= to; j++) {
      const sub = prev[j - 1] + (ai === b.charCodeAt(j - 1) ? 0 : 1);
      const del = (j <= i + k - 1 ? prev[j] : BIG) + 1;
      const ins = cur[j - 1] + 1;
      let v = sub < del ? sub : del;
      if (ins < v) v = ins;
      if (v > BIG) v = BIG;
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (to < n) cur[to + 1] = BIG;
    if (rowMin > k) return k + 1;
    const t = prev;
    prev = cur;
    cur = t;
  }
  return prev[n] <= k ? prev[n] : k + 1;
}
