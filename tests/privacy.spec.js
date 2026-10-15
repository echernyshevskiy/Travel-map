// Приватность версии для друзей
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { openApp, ROOT, readBaked } = require('./helpers');

test('в файле версии для друзей нет заметок и скрытых записей', async () => {
  const html = fs.readFileSync(path.join(ROOT, 'friends', 'index.html'), 'utf8');
  const baked = readBaked(html);
  expect(baked, 'в сборке не найдены данные').toBeTruthy();
  expect(baked.readOnly).toBe(true);
  const entries = baked.entries;
  expect(entries.length).toBeGreaterThan(0);
  expect(entries.filter(e => e.notes)).toEqual([]);
  expect(entries.filter(e => e.hidden)).toEqual([]);
  expect(html).toContain('name="robots" content="noindex');
});

test('флаг «Не показывать друзьям» сохраняется при правке', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => startEdit(allEntries.find(e => e.id === 'ci_kz')));
  await page.locator('#fieldHidden').check();
  await page.locator('#saveBtn').click();
  await expect.poll(() => page.evaluate(() => allEntries.find(e => e.id === 'ci_kz').hidden)).toBe(true);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('travel-map-data')).entries.find(e => e.id === 'ci_kz').hidden);
  expect(saved).toBe(true);
});
