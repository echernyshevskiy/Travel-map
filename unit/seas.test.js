// Справочник подписей морей (src/data/seas.json, собирается scripts/build-seas.mjs)
import { describe, it, expect } from 'vitest';
import SEAS from '../src/data/seas.json';

describe('seas.json', () => {
  it('строки правильной формы: название, вид, масштаб, центр и концы двух хорд', () => {
    expect(SEAS.length).toBeGreaterThan(200);
    for(const r of SEAS){
      const [name, kind, z, ...nums] = r;
      expect(typeof name).toBe('string');
      expect(name, name).toMatch(/^[А-ЯЁа-яё0-9 .,'«»()IVX-]+$/);
      expect(['ocean', 'sea', 'gulf']).toContain(kind);
      expect(z).toBeGreaterThanOrEqual(2); expect(z).toBeLessThanOrEqual(7);
      expect(nums).toHaveLength(10);
      for(let i = 0; i < 10; i += 2){ expect(Math.abs(nums[i]), name).toBeLessThanOrEqual(90); expect(Math.abs(nums[i + 1]), name).toBeLessThanOrEqual(360); }
    }
  });
  it('без ударений и без «голых» имён у важных морей', () => {
    const names = new Set(SEAS.map(r => r[0]));
    for(const n of ['Чёрное море', 'Балтийское море', 'Азовское море', 'Средиземное море', 'Красное море', 'Финский залив', 'Тихий океан', 'Северный Ледовитый океан']) expect(names.has(n), n).toBe(true);
    expect(SEAS.some(r => /́/.test(r[0]))).toBe(false);
  });
  it('океаны появляются раньше морей, моря — раньше заливов', () => {
    const minOf = k => Math.min(...SEAS.filter(r => r[1] === k).map(r => r[2]));
    expect(minOf('ocean')).toBeLessThan(minOf('sea'));
    expect(minOf('sea')).toBeLessThanOrEqual(minOf('gulf'));
  });
});
