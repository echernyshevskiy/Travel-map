// v2.78: точечное обновление после правки (B9) — слои записей, у которых на
// карте ничего не поменялось, при перестроении не трогаются
const { test, expect } = require('@playwright/test');
const { openApp, expectNoErrors, encodePolyline } = require('./helpers');
const { largeData } = require('./fixtures/large-data');

const data = largeData(encodePolyline);

// всё, что видно на карте и в статистике
const snapshot = page =>
  page.evaluate(() => {
    const map_ = {};
    for (const e of allEntries) {
      const l = layers[e.id];
      if (!l) {
        map_[e.id] = null;
        continue;
      }
      const on = l instanceof L.Marker ? cityCluster.hasLayer(l) : map.hasLayer(l);
      let look;
      if (l instanceof L.Marker) look = [l.getLatLng().lat, l.getLatLng().lng, l.options.icon.options.html, l.options.title];
      else if (typeof l.setLatLngs === 'function' && !l.eachLayer) {
        const ll = l.getLatLngs().flat(3);
        look = [l.options.color, l.options.dashArray, l.options.opacity, ll.length, ll[0] && ll[0].lat, ll.at(-1) && ll.at(-1).lng];
      } else {
        const sub = l.getLayers()[0];
        look = [l.__countryKey, sub && sub.options.color, sub && sub.options.fillColor, sub && sub.options.fillOpacity, sub && sub.options.dashArray];
      }
      map_[e.id] = [on, look];
    }
    const text = id => (document.getElementById(id) || {}).textContent || '';
    return {
      map: map_,
      layerCount: Object.keys(layers).length,
      glance: text('glanceBar'),
      stats: text('mnavStatsSection') + [...document.querySelectorAll('.stat-row b, #filteredStats')].map(b => b.textContent).join('|')
    };
  });

test.describe('B9: точечное обновление после правки', () => {
  test('30 случайных правок — карта и статистика такие же, как после полного пересчёта', async ({ page }) => {
    test.setTimeout(120_000);
    const { errors } = await openApp(page, { entries: data.entries, races: data.races, tripMeta: data.tripMeta });
    await page.evaluate(() => {
      let s = 7;
      const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
      const pick = a => a[Math.floor(rnd() * a.length)];
      const colors = ['#3F5240', '#A6592E', '#2F5D7C', '#7A1620'];
      const keys = ['Georgia', 'Armenia', 'Turkey', 'France', 'Italy', 'Spain'];
      for (let k = 0; k < 30; k++) {
        const e = pick(allEntries);
        const what = k % 10;
        if (what === 0) e.notes = 'заметка ' + k;
        else if (what === 1) e.year = 2000 + Math.floor(rnd() * 25);
        else if (what === 2) e.color = pick(colors);
        else if (what === 3) e.name = (e.name || '') + ' ' + k;
        else if (what === 4) e.favorite = !e.favorite;
        else if (what === 5) e.status = e.status === 'wishlist' ? 'visited' : 'wishlist';
        else if (what === 6 && e.type === 'city') {
          e.lat += 0.3;
          e.lng -= 0.2;
        } else if (what === 7 && e.type === 'country') e.countryKey = pick(keys);
        else if (what === 8) allEntries.splice(allEntries.indexOf(e), 1);
        else if (what === 9) allEntries.push({ ...e, id: 'copy' + k, name: 'Копия ' + k });
        else e.trip = 'Поездка ' + k;
        rebuildAll();
      }
    });
    const quick = await snapshot(page);
    // полный пересчёт: забываем подписи слоёв — каждый слой переустанавливается
    await page.evaluate(() => {
      Object.values(layers).forEach(l => (l.__sig = null));
      rebuildAll();
    });
    const full = await snapshot(page);
    expect(quick.layerCount).toBe(full.layerCount);
    expect(quick.glance).toBe(full.glance);
    expect(quick.stats).toBe(full.stats);
    for (const id of Object.keys(full.map)) expect(quick.map[id], 'запись ' + id).toEqual(full.map[id]);
    await expectNoErrors(errors);
  });

  test('правка заметки не трогает слои; смена цвета — только у своей записи', async ({ page }) => {
    const { errors } = await openApp(page, { entries: data.entries, races: data.races, tripMeta: data.tripMeta });
    const touched = await page.evaluate(() => {
      // помечаем каждый слой: перестроенный слой получит новую подпись
      Object.values(layers).forEach(l => (l.__mark = l.__sig));
      const city = allEntries.find(e => e.type === 'city');
      city.notes = 'новая заметка';
      rebuildAll();
      const afterNote = Object.values(layers).filter(l => l.__mark !== l.__sig).length;
      city.color = city.color === '#A6592E' ? '#3F5240' : '#A6592E';
      rebuildAll();
      const afterColor = Object.entries(layers)
        .filter(([, l]) => l.__mark !== l.__sig)
        .map(([id]) => id);
      return { afterNote, afterColor, cityId: city.id };
    });
    expect(touched.afterNote).toBe(0);
    expect(touched.afterColor).toEqual([touched.cityId]);
    await expectNoErrors(errors);
  });

  test('замер: сохранение правки на большом архиве (CPU ×4) — быстрее 150 мс', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'замер — на одной раскладке');
    await openApp(page, { entries: data.entries, races: data.races, tripMeta: data.tripMeta });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const times = [];
    for (let k = 0; k < 5; k++) {
      times.push(
        await page.evaluate(k => {
          allEntries[10 + k].notes = 'замер ' + k;
          const t0 = performance.now();
          rebuildAll();
          return performance.now() - t0;
        }, k)
      );
      await page.waitForTimeout(300);
    }
    times.sort((a, b) => a - b);
    const median = times[2];
    test.info().annotations.push({ type: 'замер', description: `правка заметки: ${Math.round(median)} мс (бюджет 150; до v2.78 — 170–280)` });
    expect(median).toBeLessThan(150);
  });
});
