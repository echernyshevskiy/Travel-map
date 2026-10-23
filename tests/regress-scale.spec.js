// Большой архив «как настоящий» на медленном телефоне: приложение должно
// открываться и откликаться в пределах бюджета, а все экраны — работать.
// Раньше это проверялось только вручную скриптами на настоящих данных; здесь —
// на синтетическом наборе того же объёма (tests/fixtures/large-data.js).
// Бюджеты с запасом примерно втрое к замерам: тест ловит заметное замедление
// (например, перебор всех точек всех треков на каждое действие), а не шум.
const { test, expect } = require('@playwright/test');
const { openApp, expectNoErrors, encodePolyline } = require('./helpers');
const { largeData } = require('./fixtures/large-data');

const data = largeData(encodePolyline);
const CPU = 4; // как средний Android

test.describe.configure({ mode: 'serial' });
test.beforeEach(({}, info) => { test.skip(info.project.name !== 'desktop', 'замеры — в одной раскладке, с замедлением процессора'); });

async function openLarge(page){
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  const r = await openApp(page, { entries: data.entries, races: data.races, tripMeta: data.tripMeta });
  await page.waitForFunction(() => document.querySelector('.leaflet-interactive, .leaflet-marker-icon'));
  return { ...r, cdp };
}
const budget = (name, ms, max) => {
  test.info().annotations.push({ type: 'замер', description: `${name}: ${Math.round(ms)} мс (бюджет ${max})` });
  expect(ms, `${name}: ${Math.round(ms)} мс при бюджете ${max} мс`).toBeLessThan(max);
};

test('запуск и отклик на большом архиве (CPU ×4)', async ({ page }) => {
  const { errors } = await openLarge(page);
  // запуск меряется вместе с перехватом всех запросов тестом — поэтому бюджет щедрый
  budget('запуск до карты', await page.evaluate(() => performance.now()), 16000);
  const m = await page.evaluate(async () => {
    const t = f => { const a = performance.now(); f(); return performance.now() - a; };
    const out = {};
    out.filters = t(() => applyFilters());
    out.list = t(() => renderList());
    out.table = t(() => renderTable());
    out.diagnostics = t(() => renderDiagnostics());
    out.collections = t(() => renderCollections());
    out.traveler = t(() => renderTraveler());
    out.passport = t(() => renderPassport());
    out.recap = t(() => renderRecap());
    out.labels = t(() => renderMapLabels());
    // квадраты исследованной территории — пересчёт с нуля, без кэша
    out.heat = t(() => { heatSignature = ''; routeSquaresCache.clear(); updateHeat(allEntries.filter(e => e.type === 'route')); });
    const y = document.getElementById('timelineSlider');
    out.timeline = t(() => { y.value = Math.floor(+y.max / 2); applyTimelineOpacity(); });
    y.value = y.max; applyTimelineOpacity();
    globeEnter({ noFlyOut: true });
    await new Promise(r => setTimeout(r, 600));
    const fr = [];
    for(let i = 0; i < 9; i++){ const r = globe.proj.rotate(); globe.proj.rotate([r[0] + 4, r[1], r[2]]); globe.moving = true; fr.push(t(() => globeDraw())); }
    globe.moving = false;
    out.globeFrame = fr.sort((a, b) => a - b)[4];
    const trip = allEntries.find(e => e.trip && e.type === 'route').trip;
    out.tourBuild = t(() => globeTourBuild({ trip }));
    globeExit();
    return out;
  });
  budget('фильтры', m.filters, 600);
  budget('список', m.list, 400);
  budget('таблица', m.table, 500);
  budget('проверка данных', m.diagnostics, 2500);
  budget('коллекции (с ЮНЕСКО)', m.collections, 700);
  budget('тип путешественника', m.traveler, 250);
  budget('паспорт', m.passport, 300);
  budget('итоги года', m.recap, 300);
  budget('подписи «Контуров»', m.labels, 600);
  budget('тепловая карта', m.heat, 1500);
  budget('лента лет', m.timeline, 600);
  budget('кадр глобуса', m.globeFrame, 250);
  budget('подготовка облёта', m.tourBuild, 150);
  await expectNoErrors(errors);
});

test('все экраны и карточки на большом архиве — без ошибок', async ({ page }) => {
  const { errors, cdp } = await openLarge(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  // все окна из меню
  for(const id of ['openTableBtn', 'openPassportBtn', 'openCalendarBtn', 'openRecapBtn', 'openMilestonesBtn', 'openTravelerBtn', 'openDiaryBtn',
    'openCollectionsBtn', 'openCompareBtn', 'openChangelogBtn', 'openRunningBtn', 'openGalleryBtn', 'openQuizBtn', 'openDiagnosticsBtn']){
    await page.evaluate(id => document.getElementById(id).click(), id);
    await page.waitForTimeout(150);
    await page.evaluate(() => document.querySelectorAll('.modal-overlay').forEach(m => { m.style.display = 'none'; }));
  }
  // карточки: каждая третья запись и все маршруты; страницы всех поездок; несколько облётов
  const n = await page.evaluate(async () => {
    let k = 0;
    for(const e of allEntries.filter((e, i) => e.type === 'route' || i % 3 === 0)){ focusEntry(e); k++; }
    map.closePopup();
    [...new Set(allEntries.map(e => e.trip).filter(Boolean))].forEach(t => openTripPage(t));
    document.getElementById('tripPageModal').style.display = 'none';
    const trips = [...new Set(allEntries.filter(e => e.type === 'route' && e.trip).map(e => e.trip))].slice(0, 3);
    for(const t of trips){ globeTourStart({ trip: t }); await new Promise(r => setTimeout(r, 700)); globeTourStop(); }
    globeExit();
    return k;
  });
  expect(n).toBeGreaterThan(100);
  // коллекция ЮНЕСКО целиком и поиск в ней
  await page.evaluate(() => { collectionOpenId = 'unesco'; renderCollections(); document.getElementById('collectionsModal').style.display = 'flex'; });
  await page.fill('#collSearch', 'ка');
  await expect(page.locator('#collSearchRes .coll-item').first()).toBeVisible();
  await expectNoErrors(errors);
});
