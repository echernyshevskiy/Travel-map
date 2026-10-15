import { describe, it, expect } from 'vitest';
import { getAllCityVisits, uniqueCityVisits, distinctCityKeys } from '../src/lib/visits.js';

const city = (name, extra = {}) => ({ type: 'city', name, lat: 1, lng: 2, year: 2024, ...extra });
const route = (names, extra = {}) => ({
  type: 'route', year: 2024, color: '#f00', waypointNames: names,
  waypointCoords: names.map((_, i) => [i, i]), waypointCountryKeys: names.map(() => 'Россия'), ...extra,
});

describe('getAllCityVisits', () => {
  it('берёт отметки городов и остановки маршрутов, остальное пропускает', () => {
    const v = getAllCityVisits([city('Казань', { favorite: true }), route(['Тверь', 'Клин']), { type: 'country', name: 'Грузия' }]);
    expect(v.map(x => x.name)).toEqual(['Казань', 'Тверь', 'Клин']);
    expect(v[0]).toMatchObject({ fromRoute: false, favorite: true });
    expect(v[2]).toMatchObject({ fromRoute: true, favorite: false, status: 'visited', color: '#f00', lat: 1, countryKey: 'Россия' });
  });
  it('остановка без координат не ломает список', () => {
    const v = getAllCityVisits([{ type: 'route', year: 2024, waypointNames: ['Где-то'] }]);
    expect(v[0]).toMatchObject({ name: 'Где-то', lat: null, lng: null, countryKey: null });
  });
});

describe('uniqueCityVisits', () => {
  it('город отметкой и остановкой в одном месяце — один визит', () => {
    const v = getAllCityVisits([city('Москва', { month: 5 }), route(['Москва', 'Тула'], { month: 5 })]);
    expect(uniqueCityVisits(v).map(x => x.name)).toEqual(['Москва', 'Тула']);
  });
  it('разные месяцы и годы — разные визиты; регистр и пробелы не важны', () => {
    const v = [{ name: 'Сочи', year: 2023, month: 7 }, { name: ' сочи ', year: 2023, month: 7 },
      { name: 'Сочи', year: 2023, month: 8 }, { name: 'Сочи', year: 2024, month: 7 }];
    expect(uniqueCityVisits(v)).toHaveLength(3);
  });
  it('без месяца склеивает по году и поездке, пустые названия отбрасывает', () => {
    const v = [{ name: 'Рим', year: 2019, trip: 'Италия' }, { name: 'Рим', year: 2019, trip: 'Италия' },
      { name: 'Рим', year: 2019, trip: 'Ещё раз' }, { name: '', year: 2019 }, { name: null }];
    expect(uniqueCityVisits(v)).toHaveLength(2);
  });
});

describe('distinctCityKeys', () => {
  it('одно название без разных стран — один город', () => {
    const k = distinctCityKeys([{ name: 'Москва', countryKey: 'Россия' }, { name: 'москва' }]);
    expect([...k]).toEqual(['москва']);
  });
  it('Париж во Франции и в США — два города', () => {
    const k = distinctCityKeys([{ name: 'Париж', countryKey: 'Франция' }, { name: 'Париж', countryKey: 'США' }, { name: 'Париж' }]);
    expect(k.size).toBe(2);
    expect(k.has('париж|Франция')).toBe(true);
  });
});
