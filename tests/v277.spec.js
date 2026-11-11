// v2.77: шкала размеров текста (B4), цвета и слои через переменные (B5),
// дом в настройках (B6), запуск по этапам (B7), лёгкий список (B8)
const { test, expect } = require('@playwright/test');
const { openApp, expectNoErrors } = require('./helpers');

// Видимый текст мельче 11 px: элементы с собственным текстом, кроме подписей
// на самой карте (масштабируются с картой) и подписей внутри SVG-рисунков.
const tinyText = page =>
  page.evaluate(() => {
    const out = [];
    const skip = el => el.closest('svg, canvas, .leaflet-marker-pane, .leaflet-tooltip-pane, .ml-label, .ml-sea, #globeWrap');
    for (const el of document.querySelectorAll('body *')) {
      if (skip(el)) continue;
      const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
      if (!own) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || +cs.opacity === 0) continue;
      const fs = parseFloat(cs.fontSize);
      if (fs < 10.95)
        out.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${[...el.classList].join('.')} ${fs}px «${el.textContent.trim().slice(0, 30)}»`);
    }
    return out;
  });

test.describe('B4: шкала размеров текста', () => {
  test('на стартовом экране и в основных окнах нет текста мельче 11 px', async ({ page }, info) => {
    test.setTimeout(90_000);
    const { errors } = await openApp(page);
    await page.waitForTimeout(400);
    expect(await tinyText(page), 'стартовый экран').toEqual([]);
    if (info.project.name === 'desktop') {
      for (const tab of ['list', 'stats', 'filters', 'data']) {
        await page.click('#stab-' + tab);
        expect(await tinyText(page), 'вкладка ' + tab).toEqual([]);
      }
    } else {
      for (const tab of ['list', 'filters', 'add', 'more']) {
        await page.evaluate(t => mnavShow(t), tab);
        await page.waitForTimeout(300);
        expect(await tinyText(page), 'вкладка ' + tab).toEqual([]);
      }
      await page.evaluate(() => mnavShow('map'));
    }
    for (const id of ['openPassportBtn', 'openTableBtn', 'openDiagnosticsBtn', 'openRecapBtn', 'openCollectionsBtn', 'openRunningBtn', 'openMilestonesBtn']) {
      await page.evaluate(id => document.getElementById(id).click(), id);
      await page.waitForTimeout(350);
      expect(await tinyText(page), id).toEqual([]);
      await page.keyboard.press('Escape');
    }
    await expectNoErrors(errors);
  });
});

// выдуманный большой архив: 1000 городов
const bigEntries = () => {
  const base = { photos: [], purpose: 'tourism', status: 'visited', type: 'city', color: '#3F5240', countryKey: 'Russia' };
  return Array.from({ length: 1000 }, (_, i) => ({
    ...base,
    id: 'b' + i,
    name: 'Посёлок ' + String(i).padStart(4, '0'),
    year: 1990 + (i % 35),
    lat: 45 + (i % 100) * 0.1,
    lng: 30 + Math.floor(i / 100) * 0.5
  }));
};
const rowCount = page => page.locator('#entryList .entry-row').count();
const openList = async (page, info) => {
  if (info.project.name === 'desktop') await page.click('#stab-list');
  else await page.evaluate(() => mnavShow('list'));
};

test('компьютер: все пять вкладок боковой панели помещаются (шрифт по шкале)', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'вкладки панели — только на компьютере');
  const { errors } = await openApp(page);
  for (const w of [1366, 1100, 900]) {
    await page.setViewportSize({ width: w, height: 800 });
    await page.waitForTimeout(150);
    const [sw, cw] = await page.evaluate(() => [document.getElementById('sideTabs').scrollWidth, document.getElementById('sideTabs').clientWidth]);
    expect(sw, `ширина ${w}`).toBeLessThanOrEqual(cw + 1);
  }
  await expectNoErrors(errors);
});

test.describe('B8: список порциями', () => {
  test('1000 записей: сначала 40 строк, остальное — по мере прокрутки', async ({ page }, info) => {
    test.setTimeout(90_000);
    const { errors } = await openApp(page, { entries: bigEntries() });
    await openList(page, info);
    expect(await rowCount(page)).toBe(40);
    expect(await page.locator('#entryList *').count()).toBeLessThan(600);
    // прокрутка к концу — дорисовывается следующая порция, без нажатия кнопки
    for (let k = 0; k < 3; k++) {
      await page.locator('#showMoreEntriesBtn').scrollIntoViewIfNeeded();
      await page.waitForTimeout(250);
    }
    expect(await rowCount(page)).toBeGreaterThan(140);
    // кнопка по-прежнему работает (клавиатура)
    const before = await rowCount(page);
    await page.locator('#showMoreEntriesBtn').focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => rowCount(page)).toBeGreaterThan(before);
    // года не повторяются: порции продолжают тот же год, а не начинают заголовок заново
    const heads = await page.locator('#entryList .entry-year-head').evaluateAll(hs => hs.map(h => h.firstChild.textContent));
    expect(new Set(heads).size).toBe(heads.length);
    await expectNoErrors(errors);
  });

  test('«Показать в списке» для записи из самого конца и поиск записи из середины', async ({ page }, info) => {
    test.setTimeout(90_000);
    const { errors } = await openApp(page, { entries: bigEntries() });
    const target = await page.evaluate(() => {
      const sorted = allEntries.slice().sort((a, b) => b.year - a.year || a.name.localeCompare(b.name));
      return sorted[sorted.length - 1].id;
    });
    await page.evaluate(id => showEntryInList(id), target);
    const row = page.locator(`#entryList .entry-row[data-entry-id="${target}"]`);
    await expect(row).toBeVisible();
    await expect(row).toBeInViewport();
    // поиск по названию из середины архива
    await openList(page, info);
    const input = info.project.name === 'desktop' ? '#globalSearch' : '#globalSearch';
    await page.fill(input, 'Посёлок 0517');
    await expect(page.locator('#entryList .entry-row[data-entry-id="b517"], .suggest-item').first()).toBeVisible();
    await expectNoErrors(errors);
  });
});

test.describe('B6: дом в настройках', () => {
  const waitReady = page => page.waitForFunction(() => document.documentElement.dataset.ready === '1' && !!window.__travelMap);
  const openHomeEditor = async (page, info) => {
    if (info.project.name === 'desktop') await page.click('#stab-data');
    else await page.evaluate(() => mnavShow('more'));
    await page.locator('#homeChangeBtn').scrollIntoViewIfNeeded();
    await page.click('#homeChangeBtn');
  };

  test('по умолчанию дом — Москва, всё как раньше', async ({ page }) => {
    const { errors } = await openApp(page);
    expect(await page.evaluate(() => [HOME_COUNTRY_KEY, HOME_LOCATION.name, HOME_TZ])).toEqual(['Russia', 'Москва, Россия', 'Europe/Moscow']);
    await expect(page.locator('#homeCurrent')).toHaveText('Москва, Россия');
    await expect(page.locator('#statHomeF')).toHaveText('Москва, Россия');
    await expectNoErrors(errors);
  });

  test('смена дома на Тбилиси: страна, пояс, расстояния и карточки пересчитаны, выбор сохраняется', async ({ page }, info) => {
    test.setTimeout(90_000);
    const { errors } = await openApp(page);
    const farBefore = await page
      .locator('#statFarthest, #statFarthestF')
      .first()
      .textContent()
      .catch(() => '');
    await openHomeEditor(page, info);
    await page.fill('#homeSearch', 'Тбилиси');
    await page.locator('#homeSuggest .suggest-item').first().click();
    await page.waitForLoadState('load');
    await waitReady(page);
    expect(await page.evaluate(() => [HOME_COUNTRY_KEY, HOME_LOCATION.name, HOME_TZ])).toEqual(['Georgia', 'Тбилиси, Грузия', 'Asia/Tbilisi']);
    await expect(page.locator('#statHomeF')).toHaveText('Тбилиси, Грузия');
    // карточка России: теперь это не дом — есть разница во времени с Тбилиси
    const ru = await page.evaluate(() => buildCountryInfoHtml('Russia'));
    expect(ru).toMatch(/чем дома|как дома/);
    // карточка Грузии: дом — разницы во времени нет
    expect(await page.evaluate(() => buildCountryInfoHtml('Georgia'))).not.toMatch(/чем дома/);
    // регионы России по-прежнему считаются (они о России, а не о доме)
    expect(await page.evaluate(() => (ruRegionsState && ruRegionsState.visited ? ruRegionsState.visited.size : 0))).toBeGreaterThan(0);
    // «самая дальняя точка» считается от нового дома
    const farAfter = await page
      .locator('#statFarthest, #statFarthestF')
      .first()
      .textContent()
      .catch(() => '');
    if (farBefore) expect(farAfter).not.toBe(farBefore);
    // перезагрузка — дом прежний
    await page.reload();
    await waitReady(page);
    expect(await page.evaluate(() => HOME_COUNTRY_KEY)).toBe('Georgia');
    // вернуть по умолчанию
    await openHomeEditor(page, info);
    await page.click('#homeResetBtn');
    await page.waitForLoadState('load');
    await waitReady(page);
    expect(await page.evaluate(() => HOME_LOCATION.name)).toBe('Москва, Россия');
    await expectNoErrors(errors);
  });

  test('испорченная настройка — дом по умолчанию, без ошибок', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('travel-map-home', '{"name":"<img src=x>","lat":"abc","countryKey":"Nowhere"}'));
    const { errors } = await openApp(page);
    expect(await page.evaluate(() => HOME_LOCATION.name)).toBe('Москва, Россия');
    await expectNoErrors(errors);
  });

  test('версия для друзей: настройки дома нет', async ({ page }) => {
    const { errors } = await openApp(page, { build: 'friends' });
    await expect(page.locator('#homeSection')).toHaveCount(0);
    await expectNoErrors(errors);
  });
});
