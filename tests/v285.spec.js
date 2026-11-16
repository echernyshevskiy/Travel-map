// v2.85: подсказки городов при наборе — без запросов в Nominatim (E3);
// правка в другой вкладке не затирается молча (E5)
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { openApp, expectNoErrors } = require('./helpers');

const VILLAGE = {
  lat: '61.0667',
  lon: '42.1000',
  name: 'Верхняя Тойма',
  display_name: 'Верхняя Тойма, Архангельская область, Россия',
  addresstype: 'village',
  class: 'place',
  type: 'village',
  address: { village: 'Верхняя Тойма', state: 'Архангельская область', country: 'Россия', country_code: 'ru' }
};
const desktopOnly = info => test.skip(info.project.name !== 'desktop', 'достаточно одной раскладки');

test.describe('E3: в сеть — только по просьбе', () => {
  test('форма города: набор — справочник без запросов; строка «Искать в сети» и Enter — запрос', async ({ page }, info) => {
    desktopOnly(info);
    const hits = [];
    const mocks = {
      'nominatim.openstreetmap.org/search': url => {
        hits.push(url);
        return { status: 200, contentType: 'application/json', body: JSON.stringify([VILLAGE]) };
      }
    };
    const { errors } = await openApp(page, { mocks });
    await page.click('#stab-add');
    await page.locator('.type-btn[data-type="city"]').click();
    const input = page.locator('#citySearch');
    await input.pressSequentially('Казан', { delay: 40 });
    await expect(page.locator('#citySuggest .suggest-item').first()).toContainText('Казань');
    await expect(page.locator('#citySuggest [data-online-search]')).toBeVisible();
    await page.waitForTimeout(1200);
    expect(hits).toEqual([]); // пока человек печатает, запросов нет

    // места нет в справочнике — строка «Искать в сети»
    await input.fill('');
    await input.pressSequentially('Верхняя Тойма', { delay: 20 });
    await expect(page.locator('#citySuggest')).toContainText('Ничего не найдено');
    await page.waitForTimeout(900);
    expect(hits).toEqual([]);
    await page.locator('#citySuggest [data-online-search]').click();
    await expect(page.locator('#citySuggest .suggest-item').first()).toContainText('Верхняя Тойма');
    expect(hits.length).toBe(1);
    await expect(page.locator('#citySuggest [data-online-search]')).toHaveCount(0);

    // Enter при пустом справочнике — тоже сетевой поиск
    await input.fill('');
    await input.pressSequentially('Нижняя Тойма', { delay: 20 });
    await expect(page.locator('#citySuggest')).toContainText('Ничего не найдено');
    await input.press('Enter');
    await expect.poll(() => hits.length).toBe(2);
    await expectNoErrors(errors);
  });

  test('общий поиск: набор без запросов, сеть — по строке под подсказками', async ({ page }, info) => {
    desktopOnly(info);
    const hits = [];
    const mocks = {
      'nominatim.openstreetmap.org/search': url => {
        hits.push(url);
        return { status: 200, contentType: 'application/json', body: JSON.stringify([VILLAGE]) };
      }
    };
    const { errors } = await openApp(page, { mocks });
    const input = page.locator('#globalSearch');
    await input.pressSequentially('Верхняя Тойма', { delay: 20 });
    await expect(page.locator('#worldSuggest')).toContainText('В справочнике не найдено');
    await page.waitForTimeout(1200);
    expect(hits).toEqual([]);
    await page.locator('#worldSuggest [data-online-search]').click();
    await expect(page.locator('#worldSuggest')).toContainText('Верхняя Тойма');
    expect(hits.length).toBe(1);
    await expectNoErrors(errors);
  });
});

test.describe('E5: две вкладки', () => {
  test('правка в другой вкладке: предупреждение, здесь не сохраняется, после обновления — её данные', async ({ page, context }, info) => {
    desktopOnly(info);
    const { errors } = await openApp(page);
    const other = await context.newPage();
    // вторая вкладка: тот же сайт из файлов сборки, чужие адреса закрыты
    await other.route('**/*', route => {
      const rel = route.request().url().slice(page.url().length).split(/[?#]/)[0] || 'index.html';
      const file = path.join(__dirname, '..', decodeURIComponent(rel));
      return route.request().url().startsWith(page.url()) && fs.existsSync(file) ? route.fulfill({ path: file }) : route.abort();
    });
    await other.goto(page.url());
    await other.waitForFunction(() => document.documentElement.dataset.ready === '1');
    await expect(page.locator('#tabConflict')).toHaveCount(0); // просто открыть вторую вкладку — не повод
    await other.evaluate(async () => {
      allEntries.push({ id: 'tab2', type: 'city', name: 'Псков', year: 2026, lat: 57.82, lng: 28.33, countryKey: 'Russia', status: 'visited', photos: [] });
      await saveData();
    });
    await expect(page.locator('#tabConflict')).toBeVisible();
    // правка здесь не затирает запись из той вкладки
    const ok = await page.evaluate(async () => {
      allEntries[0].name = 'Правка в первой вкладке';
      return saveData();
    });
    expect(ok).toBe(false);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('travel-map-data')).entries.some(e => e.id === 'tab2'))).toBe(true);
    await page.click('#tabConflict button');
    await page.waitForFunction(() => document.documentElement.dataset.ready === '1' && allEntries.some(e => e.id === 'tab2'));
    await expect(page.locator('#tabConflict')).toHaveCount(0);
    await expectNoErrors(errors);
  });
});
