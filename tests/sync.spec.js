// Синхронизация через GitHub — с имитацией API (настоящий GitHub не нужен)
const { test, expect } = require('@playwright/test');
const { openApp, expectNoErrors } = require('./helpers');

const REPO = 'tester/travel-map-data';
const TOKEN = 'github_pat_TEST_0123456789abcdefghij';

// Общий «GitHub» для нескольких вкладок-устройств
function fakeGitHub(){
  const gh = { file: null, sha: null, commits: 0, offline: false, private: true };
  gh.handler = route => {
    const req = route.request();
    if(gh.offline) return route.abort('internetdisconnected');
    if(req.headers()['authorization'] !== 'Bearer ' + TOKEN) return route.fulfill({ status: 401, body: '{}' });
    const p = new URL(req.url()).pathname;
    if(p === `/repos/${REPO}`) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ private: gh.private }) });
    if(p === `/repos/${REPO}/contents/travel-data.json`){
      if(req.method() === 'GET'){
        if(gh.file === null) return route.fulfill({ status: 404, body: '{}' });
        return route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify({ sha: gh.sha, encoding: 'base64', content: Buffer.from(gh.file, 'utf8').toString('base64') }) });
      }
      const body = JSON.parse(req.postData());
      if((gh.sha || undefined) !== body.sha) return route.fulfill({ status: 409, body: '{}' });
      gh.file = Buffer.from(body.content, 'base64').toString('utf8');
      gh.sha = 'sha' + (++gh.commits);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: gh.sha } }) });
    }
    return route.fulfill({ status: 404, body: '{}' });
  };
  gh.data = () => gh.file && JSON.parse(gh.file);
  return gh;
}
async function device(browser, gh, entries){
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept());
  const opened = await openApp(page, { entries, mocks: {} });
  await page.route('https://api.github.com/**', gh.handler);
  return { ctx, page, errors: opened.errors };
}
async function connect(page){
  await page.evaluate(() => document.getElementById('syncSection').scrollIntoView());
  await page.fill('#syncRepoInput', REPO);
  await page.fill('#syncTokenInput', TOKEN);
  await page.click('#syncConnectBtn');
  await expect(page.locator('#syncStatus')).toContainText('Синхронизировано');
}
const city = (id, name) => ({ id, type: 'city', name, year: 2024, lat: 56 + Math.random(), lng: 37, countryKey: 'Russia', status: 'visited', color: '#3F5240', photos: [] });
const names = page => page.evaluate(() => allEntries.map(e => e.name).sort());

test.beforeEach(async ({}, info) => { test.skip(info.project.name !== 'desktop', 'достаточно одной раскладки'); });

test('два устройства: правки офлайн складываются, удаление не воскресает', async ({ browser }) => {
  const gh = fakeGitHub();
  const a = await device(browser, gh, [city('c1', 'Казань'), city('c2', 'Тверь')]);
  await connect(a.page);
  expect(gh.data().entries).toHaveLength(2);
  const b = await device(browser, gh, []);
  await connect(b.page);
  expect(await names(b.page)).toEqual(['Казань', 'Тверь']);

  gh.offline = true;
  await a.page.evaluate(() => { allEntries.push({ id: 'n1', type: 'city', name: 'Суздаль', year: 2025, lat: 56.4, lng: 40.4, countryKey: 'Russia', status: 'visited', color: '#3F5240', photos: [] }); return saveData(); });
  await b.page.evaluate(() => { allEntries.find(e => e.id === 'c2').name = 'Тверь (зимой)'; return saveData(); });
  expect(await a.page.evaluate(() => syncNow())).toBe(false);
  await expect(a.page.locator('#syncStatus')).toContainText('не отправлено');
  gh.offline = false;
  for(const d of [a, b, a]) expect(await d.page.evaluate(() => syncNow())).toBe(true);
  expect(await names(a.page)).toEqual(['Казань', 'Суздаль', 'Тверь (зимой)']);
  expect(await names(b.page)).toEqual(['Казань', 'Суздаль', 'Тверь (зимой)']);

  await a.page.evaluate(() => deleteEntry('c1'));
  for(const d of [a, b, b, a]) await d.page.evaluate(() => syncNow());
  expect(await names(b.page)).not.toContain('Казань');
  expect(await names(a.page)).not.toContain('Казань');
  expect(gh.data().tombstones.entries).toHaveProperty('c1');

  const commits = gh.commits;
  for(const d of [a, b, a]) await d.page.evaluate(() => syncNow());
  expect(gh.commits).toBe(commits); // без изменений — без коммитов
  await expectNoErrors([...a.errors, ...b.errors]);
});

test('одна запись на двух устройствах — побеждает более поздняя правка', async ({ browser }) => {
  const gh = fakeGitHub();
  const a = await device(browser, gh, [city('c1', 'Псков')]);
  await connect(a.page);
  const b = await device(browser, gh, []);
  await connect(b.page);
  await a.page.evaluate(() => { allEntries[0].name = 'Псков (раньше)'; return saveData(); });
  await b.page.waitForTimeout(50);
  await b.page.evaluate(() => { allEntries[0].name = 'Псков (позже)'; return saveData(); });
  for(const d of [a, b, a]) await d.page.evaluate(() => syncNow());
  expect(await names(a.page)).toEqual(['Псков (позже)']);
});

test('публичный репозиторий и неверный токен не подключаются; токен не попадает в данные', async ({ browser }) => {
  const gh = fakeGitHub(); gh.private = false;
  const a = await device(browser, gh, [city('c1', 'Казань')]);
  await a.page.fill('#syncRepoInput', REPO);
  await a.page.fill('#syncTokenInput', TOKEN);
  await a.page.click('#syncConnectBtn');
  await expect(a.page.locator('#toast')).toContainText('публичный');
  expect(await a.page.evaluate(() => !!readSyncConfig())).toBe(false);

  const gh2 = fakeGitHub();
  const b = await device(browser, gh2, [city('c1', 'Казань')]);
  await b.page.fill('#syncRepoInput', REPO);
  await b.page.fill('#syncTokenInput', 'github_pat_WRONG_0000000000000000');
  await b.page.click('#syncConnectBtn');
  await expect(b.page.locator('#toast')).toContainText('Токен');
  await connect(b.page);
  const stored = await b.page.evaluate(() => localStorage.getItem('travel-map-data'));
  expect(stored).not.toContain('github_pat_');
  expect(gh2.file).not.toContain('github_pat_');
});
