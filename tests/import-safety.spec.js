// Подложенный файл резервной копии не может выполнить код
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openApp, expectNoErrors } = require('./helpers');

const P = tag => `"'><img src=x onerror="window.__pw=(window.__pw||[]).concat('${tag}')">`;

test('вредные значения в полях импорта обезвреживаются', async ({ page }) => {
  const base = i => ({ id: 'f' + i, type: 'city', name: 'Город' + i, year: 2024, month: 5, lat: 40 + i * 0.1, lng: 20, countryKey: 'Greece', status: 'visited', color: '#3F5240', photos: [] });
  const entries = ['name','notes','trip','purpose','company','season','status','month','year','countryKey','color','instagramUrl']
    .map((f, i) => ({ ...base(i), [f]: P(f) }));
  entries.push({ ...base(40), id: P('id') });
  const races = [{ id: P('raceid'), name: P('racename'), date: '2025-05-01', distanceKm: 10, time: '50:00', place: P('place'), participants: 100 }];
  const file = path.join(os.tmpdir(), 'evil-backup.json');
  fs.writeFileSync(file, JSON.stringify({ entries, races, tripMeta: { 'X': { narrative: P('narrative') } } }));

  const { errors } = await openApp(page, { entries: [], races: [] });
  page.on('dialog', d => d.accept());
  await page.setInputFiles('#importInput', file);
  await expect.poll(() => page.evaluate(() => allEntries.length)).toBe(entries.length);
  for(const id of ['openTableBtn', 'openRunningBtn', 'openDiaryBtn', 'openPassportBtn']){
    await page.evaluate(id => document.getElementById(id).click(), id);
    await page.keyboard.press('Escape');
  }
  await page.evaluate(() => allEntries.forEach(e => { const d = document.createElement('div'); d.innerHTML = buildPopup(e); document.body.appendChild(d); }));
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__pw || [])).toEqual([]);
  expect(await page.evaluate(() => allEntries.every(e => /^#[0-9a-f]{3,8}$/i.test(e.color) && /^[\w-]+$/.test(e.id)))).toBe(true);
  await expectNoErrors(errors);
});
