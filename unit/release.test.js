import { describe, it, expect } from 'vitest';
import { readVersion, cmpVersion, planReleases, releaseBody } from '../scripts/release.mjs';

const pr = (number, ref, sha, merged_at, extra = {}) => ({
  number,
  title: `${ref}: что-то`,
  body: `описание ${ref}`,
  head: { ref },
  merge_commit_sha: sha,
  merged_at,
  ...extra
});
const prs = [
  pr(27, 'v2.82', 'sha82', '2026-11-13T15:00:00Z'),
  pr(26, 'v2.81', 'sha81', '2026-11-13T12:00:00Z'),
  pr(15, 'readme-demo', 'shaR', '2026-10-29T10:00:00Z'),
  pr(9, 'v2.9', 'sha29', '2026-10-01T10:00:00Z'),
  pr(30, 'v2.83', 'sha83x', null) // закрыт без слияния
];

describe('релизы', () => {
  it('версия из страницы', () => {
    expect(readVersion('<div>Версия: v2.82 · 13.11.2026</div>')).toBe('v2.82');
    expect(readVersion('<div>без версии</div>')).toBeNull();
  });
  it('версии сравниваются как числа', () => {
    expect(cmpVersion('v2.9', 'v2.10')).toBeLessThan(0);
    expect(cmpVersion('v3.0', 'v2.99')).toBeGreaterThan(0);
  });
  it('обычный запуск — только текущая версия, на коммит слияния её PR', () => {
    const plan = planReleases({ prs, tags: [], current: 'v2.82', headSha: 'head', backfill: false });
    expect(plan).toEqual([{ version: 'v2.82', sha: 'sha82', title: 'v2.82: что-то', body: 'описание v2.82', pr: 27 }]);
  });
  it('релиз уже есть — ничего', () => {
    expect(planReleases({ prs, tags: ['v2.82'], current: 'v2.82', headSha: 'head', backfill: false })).toEqual([]);
  });
  it('версии без PR из своей ветки — на текущий коммит', () => {
    const plan = planReleases({ prs, tags: [], current: 'v2.90', headSha: 'head', backfill: false });
    expect(plan).toEqual([{ version: 'v2.90', sha: 'head', title: 'v2.90', body: '', pr: null }]);
  });
  it('прошлые версии — все слитые из веток vX.YY, без существующих, по порядку', () => {
    const plan = planReleases({ prs, tags: ['v2.81'], current: 'v2.82', headSha: 'head', backfill: true });
    expect(plan.map(p => p.version)).toEqual(['v2.9', 'v2.82']);
  });
  it('описание — ссылка на PR и текст PR', () => {
    const body = releaseBody({ version: 'v2.82', pr: 27, body: 'Что изменилось' }, 'me/repo');
    expect(body).toContain('https://github.com/me/repo/pull/27');
    expect(body).toContain('Что изменилось');
    expect(body).toContain('travel-map-v2.82.html');
  });
});
