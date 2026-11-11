// v2.72: карточка страны — справка для поездки и разница во времени с домом
const { test, expect } = require('@playwright/test');
const { openApp, expectNoErrors } = require('./helpers');

const open = (page, key, ll) =>
  page.evaluate(
    ([k, ll]) => {
      cpopOpen.info = true;
      cpopOpen.travel = true;
      map.setView(ll, 5, { animate: false });
      openCountryPopup(k, L.latLng(ll));
    },
    [key, ll]
  );
const rows = page =>
  page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll('.leaflet-popup .ci-row')].map(r => [
        r.querySelector('.ci-k').textContent.trim(),
        r.lastElementChild.textContent.replace(/\s+/g, ' ').trim()
      ])
    )
  );

test('карточка страны: розетки, напряжение, движение, код, экстренные номера', async ({ page }) => {
  const { errors } = await openApp(page);
  await open(page, 'United Kingdom', [52.5, -1.5]);
  let r = await rows(page);
  expect(r['Розетки']).toBe('тип G — нужен переходник');
  expect(r['Напряжение']).toBe('220–240 В — как дома');
  expect(r['Движение']).toBe('левостороннее — не как дома');
  expect(r['Код страны']).toBe('+44');
  expect(r['Экстренные']).toBe('999 или 112');
  await open(page, 'Japan', [36, 138]);
  r = await rows(page);
  expect(r['Напряжение']).toMatch(/^100 В — не как дома: подойдут зарядки и техника с пометкой «100–240 V»$/);
  expect(r['Экстренные']).toBe('полиция 110 · скорая 119 · пожарные 119 · с мобильного — 112');
  await open(page, 'Switzerland', [46.8, 8.2]);
  r = await rows(page);
  expect(r['Розетки']).toBe('тип C, J — подойдёт вилка C, для F нужен переходник');
  await open(page, 'Russia', [56, 38]);
  r = await rows(page);
  expect(r['Розетки']).toBe('тип C, F'); // дома — без сравнения с домом
  expect(r['Экстренные']).toBe('единый 112 · полиция 102 · скорая 103 · пожарные 101');
  expect(r['Сейчас там']).not.toMatch(/дома/);
  await expectNoErrors(errors);
});

test('разница во времени с домом — с учётом летнего времени', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'достаточно одной раскладки');
  // 8 ноября 2026, 12:00 по Москве
  await page.clock.setFixedTime(new Date('2026-11-08T09:00:00Z'));
  const { errors } = await openApp(page);
  await open(page, 'Germany', [51, 10]);
  let r = await rows(page);
  expect(r['Сейчас там']).toBe('10:00, GMT+1 — на 2 ч раньше, чем домаразница меняется: в январе −2 ч, в июле −1 ч; с 28 марта — −1 ч');
  await open(page, 'United States of America', [39, -98]);
  r = await rows(page);
  expect(r['Сейчас там']).toMatch(/^04:00, GMT-5 \(в столице\) — на 8 ч раньше, чем дома/);
  await open(page, 'Georgia', [42, 43.5]);
  r = await rows(page);
  expect(r['Сейчас там']).toBe('13:00, GMT+4 — на 1 ч позже, чем дома');
  // летом в Германии — уже −1 ч
  await page.clock.setFixedTime(new Date('2026-07-01T09:00:00Z'));
  await open(page, 'Germany', [51, 10]);
  r = await rows(page);
  expect(r['Сейчас там']).toMatch(/^11:00, GMT\+2 — на 1 ч раньше, чем дома.*с 25 октября — −2 ч$/);
  await expectNoErrors(errors);
});

test('отметка страны: в её карточке тоже есть справка', async ({ page }) => {
  const { errors } = await openApp(page);
  const html = await page.evaluate(() =>
    buildPopup({ type: 'country', countryKey: 'Thailand', name: 'Таиланд', year: 2024, purpose: 'tourism', status: 'visited' })
  );
  expect(html).toContain('Розетки');
  expect(html).toContain('левостороннее');
  expect(html).toContain('+66');
  await expectNoErrors(errors);
});
