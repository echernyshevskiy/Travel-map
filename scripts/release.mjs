// Релизы на GitHub: тег vX.YY, описание из слитого PR, приложение одним файлом.
// Запускается из .github/workflows/release.yml:
//   node scripts/release.mjs             — релиз текущей версии (из src/index.html), если его ещё нет
//   node scripts/release.mjs --backfill  — ещё и все прошлые версии, слитые через PR из ветки vX.YY
//   … --dry-run                          — только показать, что было бы создано
// Нужны переменные окружения GITHUB_TOKEN (права contents: write) и GITHUB_REPOSITORY.
// Тег ставится на коммит слияния PR; к релизу прикладывается index.html из
// этого коммита (готовое приложение — его можно скачать и открыть без сайта).
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const VERSION_RE = /^v\d+\.\d+$/;

// версия приложения — та, что показана в «О программе»
export function readVersion(html) {
  const m = html.match(/Версия: (v\d+\.\d+)/);
  return m ? m[1] : null;
}

// сравнение версий vA.B по числам: v2.9 < v2.10
export function cmpVersion(a, b) {
  const [a1, a2] = a.slice(1).split('.').map(Number);
  const [b1, b2] = b.slice(1).split('.').map(Number);
  return a1 - b1 || a2 - b2;
}

// Что выпустить. prs — слитые PR ({ number, title, body, head: { ref }, merge_commit_sha, merged_at });
// tags — уже существующие теги; current — версия из src/index.html; headSha — коммит, на котором запущено.
// Возвращает список { version, sha, title, body, pr } от старых к новым.
export function planReleases({ prs, tags, current, headSha, backfill }) {
  const have = new Set(tags);
  const byVersion = new Map();
  for (const pr of prs) {
    const v = pr.head && pr.head.ref;
    if (!pr.merged_at || !VERSION_RE.test(v || '')) continue;
    // если веток с одной версией несколько — берём последнюю слитую
    const prev = byVersion.get(v);
    if (!prev || prev.merged_at < pr.merged_at) byVersion.set(v, pr);
  }
  const plan = [];
  const add = (version, pr) => {
    if (have.has(version) || plan.some(p => p.version === version)) return;
    plan.push(
      pr
        ? { version, sha: pr.merge_commit_sha, title: pr.title || version, body: (pr.body || '').trim(), pr: pr.number }
        : { version, sha: headSha, title: version, body: '', pr: null }
    );
  };
  if (backfill) for (const [v, pr] of byVersion) add(v, pr);
  if (current) add(current, byVersion.get(current));
  return plan.sort((a, b) => cmpVersion(a.version, b.version));
}

export function releaseBody(item, repo) {
  const link = item.pr ? `PR: https://github.com/${repo}/pull/${item.pr}\n\n` : '';
  const text = item.body || 'Описание изменений — в истории коммитов.';
  return `${link}${text}\n\n---\nПриложение одним файлом — во вложении \`travel-map-${item.version}.html\`: скачайте и откройте в браузере.`;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const dry = args.has('--dry-run');
  const backfill = args.has('--backfill');
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (!repo || !token) throw new Error('нужны GITHUB_REPOSITORY и GITHUB_TOKEN');
  const api = async (path, init = {}) => {
    const res = await fetch(path.startsWith('http') ? path : `https://api.github.com/repos/${repo}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', ...(init.headers || {}) }
    });
    if (!res.ok) throw new Error(`${init.method || 'GET'} ${path}: ${res.status} ${await res.text()}`);
    return res.status === 204 ? null : res.json();
  };
  const all = async path => {
    const out = [];
    for (let page = 1; ; page++) {
      const chunk = await api(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
      out.push(...chunk);
      if (chunk.length < 100) return out;
    }
  };

  const current = readVersion(readFileSync('src/index.html', 'utf8'));
  const headSha = execFileSync('git', ['rev-parse', 'HEAD']).toString().trim();
  const prs = await all('/pulls?state=closed&sort=updated&direction=desc');
  const tags = (await all('/tags')).map(t => t.name);
  const plan = planReleases({ prs, tags, current, headSha, backfill });
  if (!plan.length) {
    console.log(`Релиз ${current} уже есть — делать нечего`);
    return;
  }
  // «последним» GitHub должен показывать самую новую версию, а не ту, что создана последней
  const newest = [...tags.filter(t => VERSION_RE.test(t)), ...plan.map(p => p.version)].sort(cmpVersion).pop();
  for (const item of plan) {
    console.log(`${dry ? '[проба] ' : ''}${item.version} → ${item.sha.slice(0, 7)}${item.pr ? ` (PR #${item.pr})` : ''}`);
    if (dry) continue;
    const rel = await api('/releases', {
      method: 'POST',
      body: JSON.stringify({
        tag_name: item.version,
        target_commitish: item.sha,
        name: item.title,
        body: releaseBody(item, repo),
        make_latest: item.version === newest ? 'true' : 'false'
      })
    });
    let html = null;
    try {
      html = execFileSync('git', ['show', `${item.sha}:index.html`], { maxBuffer: 64 * 1024 * 1024 });
    } catch (e) {
      console.log(`  index.html в ${item.sha.slice(0, 7)} нет — релиз без вложения`);
    }
    if (html) {
      const name = `travel-map-${item.version}.html`;
      const url = rel.upload_url.replace(/\{.*\}$/, '') + `?name=${encodeURIComponent(name)}`;
      await api(url, { method: 'POST', headers: { 'content-type': 'text/html' }, body: html });
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => {
    console.error(e.message);
    process.exit(1);
  });
}
