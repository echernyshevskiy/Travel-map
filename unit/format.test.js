import { describe, it, expect } from 'vitest';
import {
  escapeHtml, safeUrl, normSearch, formatPace, parseRaceTime, formatRaceTime,
  fmtDelta, daysWord, pluralVisits, monthsWord,
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
