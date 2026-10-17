import { describe, it, expect } from 'vitest';
import { travelerProfile } from '../src/lib/traveler.js';

const continentOf = k => ({ Russia: 'Европа', Georgia: 'Азия', France: 'Европа', Japan: 'Азия', Peru: 'Южная Америка', Egypt: 'Африка' }[k] || null);
const city = (name, k, extra = {}) => ({ type: 'city', name, countryKey: k, year: 2024, status: 'visited', ...extra });
const route = (extra) => ({ type: 'route', name: 'r', year: 2024, status: 'visited', distanceKm: 20, ...extra });

describe('travelerProfile', () => {
  it('мало данных — портрета нет', () => {
    expect(travelerProfile([city('Москва', 'Russia')])).toBeNull();
  });
  it('походы с набором высоты — «Горный странник»', () => {
    const hikes = Array.from({ length: 8 }, (_, i) => route({ activity: 'hiking', distanceKm: 20, elevationGain: 900, countryKey: 'Georgia', trip: 'Кавказ ' + i }));
    const p = travelerProfile([...hikes, city('Тбилиси', 'Georgia')], { continentOf });
    expect(p.id).toBe('mountain');
    expect(p.axes.find(a => a.id === 'nature').value).toBeGreaterThan(0.5);
  });
  it('много стран и континентов — «Коллекционер стран»', () => {
    const keys = ['France', 'Japan', 'Peru', 'Egypt', 'Georgia'];
    const list = [];
    for(let i = 0; i < 40; i++) list.push({ type: 'country', name: 'c' + i, countryKey: keys[i % 5] + (i >= 5 ? i : ''), year: 2010 + (i % 10), status: 'visited' });
    const p = travelerProfile(list, { continentOf: k => continentOf(k.replace(/\d+$/, '')) });
    expect(p.id).toBe('collector');
    expect(p.facts.countries).toBe(40);
    expect(p.axes.find(a => a.id === 'abroad').value).toBe(1);
  });
  it('шкала «один ↔ в компании» и повторные визиты', () => {
    const list = [
      city('Казань', 'Russia', { company: 'alone' }), city('Казань', 'Russia', { company: 'alone' }), city('Казань', 'Russia', { company: 'alone' }),
      city('Сочи', 'Russia', { company: 'friends' }),
    ];
    const p = travelerProfile(list, { continentOf });
    expect(p.axes.find(a => a.id === 'company').value).toBeCloseTo(-0.5, 5);
    expect(p.axes.find(a => a.id === 'new').value).toBeLessThan(0);     // в Казань возвращаемся
    expect(p.axes.find(a => a.id === 'abroad').value).toBe(-1);
  });
  it('длительность поездок — по точным датам, если они есть', () => {
    const list = [
      city('Рим', 'Italy', { trip: 'Италия', dateFrom: '2024-05-01', dateTo: '2024-05-14' }),
      city('Флоренция', 'Italy', { trip: 'Италия', dateFrom: '2024-05-10' }),
      city('Тверь', 'Russia', { trip: 'Тверь', dateFrom: '2024-06-01' }),
    ];
    const p = travelerProfile(list, { continentOf });
    expect(p.facts.longestTrip).toBe(14);
    expect(p.facts.avgTripDays).toBe(7.5);
  });
  it('факты: любимый сезон, месяц, самый насыщенный год; планы не считаются', () => {
    const list = [
      city('A', 'Russia', { season: 'winter', month: 1, year: 2020 }), city('B', 'Russia', { season: 'winter', month: 1, year: 2021 }),
      city('C', 'Russia', { season: 'summer', month: 7, year: 2021 }), city('D', 'Russia', { status: 'wishlist', season: 'summer', month: 7, year: 2021 }),
      city('E', 'Russia', { season: 'summer', month: 7, year: 2021 }),
    ];
    const p = travelerProfile(list, { continentOf });
    expect(p.facts.busiestYear).toEqual({ year: 2021, count: 3 });
    expect(['winter', 'summer']).toContain(p.facts.favoriteSeason);
    expect(p.tags.length).toBeLessThanOrEqual(2);
  });
});
