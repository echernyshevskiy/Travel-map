import { describe, it, expect } from 'vitest';
import {
  escapeHtml, safeUrl, normSearch, formatPace, parseRaceTime, formatRaceTime,
  fmtDelta, daysWord, pluralVisits, monthsWord, cleanPlaceName, looksLikeAdminArea,
  parseIsoDate, formatDateRange, daysInclusive, dateSpan, localDateAt,
} from '../src/lib/format.js';

describe('escapeHtml и safeUrl', () => {
  it('экранирует все пять опасных символов', () => {
    expect(escapeHtml(`<img src=x onerror="a('b')">&`)).toBe('&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;');
    expect(escapeHtml(null)).toBe('');
  });
  it('ссылки без схемы получают https://, опасные схемы отбрасываются', () => {
    expect(safeUrl('maps.google.com/x')).toBe('https://maps.google.com/x');
    expect(safeUrl(' https://instagram.com/p/1 ')).toBe('https://instagram.com/p/1');
    expect(safeUrl('mailto:a@b.c')).toBe('mailto:a@b.c');
    expect(safeUrl('javascript:alert(1)')).toBe('');
    expect(safeUrl('JavaScript:alert(1)')).toBe('');
    expect(safeUrl('data:text/html,<b>')).toBe('');
    expect(safeUrl('')).toBe('');
  });
  it('поиск не различает регистр и ё/е', () => {
    expect(normSearch('  Орёл ')).toBe('орел');
  });
});

describe('темп', () => {
  it('округляет секунды без «4:60»', () => {
    expect(formatPace(5)).toBe('5:00 /км');
    expect(formatPace(4 + 59.7 / 60)).toBe('5:00 /км');
    expect(formatPace(4 + 59.4 / 60)).toBe('4:59 /км');
    expect(formatPace(6.25)).toBe('6:15 /км');
  });
  it('нет темпа — null', () => {
    expect(formatPace(0)).toBeNull();
    expect(formatPace(Infinity)).toBeNull();
    expect(formatPace(undefined)).toBeNull();
  });
});

describe('время забега', () => {
  it('понимает ч:мм:сс, мм:сс, доли секунды и запятую', () => {
    expect(parseRaceTime('1:38:24')).toBeCloseTo(98.4, 6);
    expect(parseRaceTime('48:12')).toBeCloseTo(48.2, 6);
    expect(parseRaceTime('48:12,5')).toBeCloseTo(48 + 12.5 / 60, 6);
    expect(parseRaceTime('45')).toBe(45);
  });
  it('мусор и ноль — null', () => {
    for(const s of ['', '  ', 'abc', '1::2', '0', '-5', '1:2:3:4']) expect(parseRaceTime(s)).toBeNull();
  });
  it('formatRaceTime — обратное преобразование', () => {
    expect(formatRaceTime(98.4)).toBe('1:38:24');
    expect(formatRaceTime(48.2)).toBe('48:12');
    expect(formatRaceTime(59.999)).toBe('1:00:00');
    expect(formatRaceTime(null)).toBe('—');
    for(const s of ['3:05:07', '42:00', '1:00:01']) expect(formatRaceTime(parseRaceTime(s))).toBe(s);
  });
  it('fmtDelta: знак и формат', () => {
    expect(fmtDelta(-1.5)).toBe('−1:30');
    expect(fmtDelta(0.25)).toBe('+0:15');
    expect(fmtDelta(61)).toBe('+1:01:00');
  });
});

describe('склонения', () => {
  const cases = [[1, 'день', 'визит', 'месяц'], [2, 'дня', 'визита', 'месяца'], [5, 'дней', 'визитов', 'месяцев'],
    [11, 'дней', 'визитов', 'месяцев'], [12, 'дней', 'визитов', 'месяцев'], [21, 'день', 'визит', 'месяц'],
    [22, 'дня', 'визита', 'месяца'], [111, 'дней', 'визитов', 'месяцев'], [0, 'дней', 'визитов', 'месяцев']];
  it.each(cases)('%i → %s / %s / %s', (n, d, v, m) => {
    expect(daysWord(n)).toBe(d);
    expect(pluralVisits(n)).toBe(v);
    expect(monthsWord(n)).toBe(m);
  });
});

describe('названия мест от геокодера', () => {
  it.each([
    ['Theewaterskloof Local Municipality', 'Theewaterskloof'],
    ['Kouga Local Municipality', 'Kouga'],
    ['City of Cape Town Metropolitan Municipality', 'City of Cape Town'],
    ['Municipality of Kotor', 'Kotor'],
    ['городской округ Самара', 'Самара'],
    ['Тольятти городской округ', 'Тольятти'],
    ['Comune di Lucca', 'Lucca'],
    ['Gemeinde Zermatt', 'Zermatt'],
    ['Тбилиси', 'Тбилиси'],
    ['Orange County', 'Orange County'],
    ['', ''],
  ])('%s → %s', (a, b) => expect(cleanPlaceName(a)).toBe(b));
  it('служебное слово целиком не выкидывает название', () => {
    expect(cleanPlaceName('Municipality')).toBe('Municipality');
  });
  it('районы и сельсоветы распознаются', () => {
    expect(looksLikeAdminArea('Ак-Суйский район')).toBe(true);
    expect(looksLikeAdminArea('Нарочский сельский Совет')).toBe(true);
    expect(looksLikeAdminArea('Kouga Local Municipality')).toBe(true);
    expect(looksLikeAdminArea('Казань')).toBe(false);
  });
});

describe('точные даты', () => {
  it('разбор проверяет и формат, и сам день', () => {
    expect(parseIsoDate('2025-09-12')).toMatchObject({ y: 2025, m: 9, d: 12 });
    for(const bad of ['2025-02-30', '2025-13-01', '12.09.2025', '', null, undefined, '2025-9-1']) expect(parseIsoDate(bad)).toBeNull();
    expect(parseIsoDate('2024-02-29')).not.toBeNull();   // високосный
  });
  it.each([
    ['2025-09-12', null, '12 сен 2025'],
    ['2025-09-12', '2025-09-12', '12 сен 2025'],
    ['2025-09-12', '2025-09-18', '12–18 сен 2025'],
    ['2025-06-28', '2025-07-03', '28 июн – 3 июл 2025'],
    ['2024-12-30', '2025-01-02', '30 дек 2024 – 2 янв 2025'],
    ['2025-05-09', '2025-05-11', '9–11 мая 2025'],
    ['2025-09-18', '2025-09-12', '18 сен 2025'],          // конец раньше начала — только начало
    [null, '2025-09-12', null],
  ])('%s — %s → %s', (a, b, want) => expect(formatDateRange(a, b)).toBe(want));
  it('дни включительно, через границу месяца и года', () => {
    expect(daysInclusive('2025-09-12', '2025-09-18')).toBe(7);
    expect(daysInclusive('2024-12-30', '2025-01-02')).toBe(4);
    expect(daysInclusive('2025-09-12')).toBe(1);
    expect(daysInclusive('плохо')).toBe(0);
  });
  it('размах поездки по записям с датами', () => {
    expect(dateSpan([{ dateFrom: '2025-06-28', dateTo: '2025-07-01' }, { dateFrom: '2025-07-03' }, { year: 2025 }]))
      .toEqual({ from: '2025-06-28', to: '2025-07-03', days: 6 });
    expect(dateSpan([{ year: 2025, month: 6 }])).toBeNull();
  });
  it('местная дата по долготе: вечер в Хабаровске — уже завтра по UTC', () => {
    const t = Date.UTC(2025, 5, 1, 15, 30);               // 15:30 UTC = 01:30 следующего дня в UTC+10
    expect(localDateAt(t, 135)).toBe('2025-06-02');
    expect(localDateAt(t, -75)).toBe('2025-06-01');
    expect(localDateAt(NaN, 0)).toBeNull();
  });
});
