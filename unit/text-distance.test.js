import { describe, it, expect } from 'vitest';
import { levenshteinWithin } from '../src/lib/text-distance.js';

// эталон — полная таблица
function full(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[a.length][b.length];
}

describe('levenshteinWithin', () => {
  it('знакомые пары', () => {
    expect(levenshteinWithin('коломна', 'коломбо', 2)).toBe(2);
    expect(levenshteinWithin('тбилиси', 'тбилис', 2)).toBe(1);
    expect(levenshteinWithin('москва', 'москва', 2)).toBe(0);
    expect(levenshteinWithin('москва', 'минск', 2)).toBe(3); // больше порога
    expect(levenshteinWithin('', 'ab', 2)).toBe(2);
    expect(levenshteinWithin('abc', '', 2)).toBe(3);
  });
  it('совпадает с полной таблицей на случайных строках (до порога)', () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const word = () => Array.from({ length: 1 + Math.floor(rnd() * 9) }, () => 'абвгде'[Math.floor(rnd() * 6)]).join('');
    for (let t = 0; t < 4000; t++) {
      const a = word(),
        b = rnd() < 0.5 ? word() : a.slice(0, Math.floor(rnd() * a.length)) + 'аб'.slice(0, Math.floor(rnd() * 3)) + a.slice(Math.floor(rnd() * a.length));
      for (const k of [1, 2, 3]) {
        const d = full(a, b);
        expect(levenshteinWithin(a, b, k), `${a} / ${b} / k=${k}`).toBe(d <= k ? d : k + 1);
      }
    }
  });
});
