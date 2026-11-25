import { describe, it, expect } from 'vitest';
import { entryEndDate, cutoffDate, delayedSets } from '../scripts/friends-delay.mjs';

const NOW = new Date('2026-11-25T10:00:00Z');

describe('отложенная публикация', () => {
  it('конец записи: точные даты, трек на несколько дней, месяц, год, без даты', () => {
    expect(entryEndDate({ dateFrom: '2026-11-01', dateTo: '2026-11-05' })).toBe('2026-11-05');
    expect(entryEndDate({ dateFrom: '2026-11-01' })).toBe('2026-11-01');
    expect(entryEndDate({ dateFrom: '2026-10-30', trackDays: 3 })).toBe('2026-11-01');
    expect(entryEndDate({ year: 2026, month: 2 })).toBe('2026-02-28');
    expect(entryEndDate({ year: 2024, month: 2 })).toBe('2024-02-29');
    expect(entryEndDate({ year: 2025 })).toBe('2025-12-31');
    expect(entryEndDate({ name: 'без даты' })).toBeNull();
  });
  it('граница — сегодня минус N дней', () => {
    expect(cutoffDate(7, NOW)).toBe('2026-11-18');
    expect(cutoffDate(0, NOW)).toBe('2026-11-25');
  });
  it('недавние записи и вся текущая поездка скрыты, старые и без даты — нет', () => {
    const entries = [
      { id: 'old', year: 2025, month: 6 },
      { id: 'month', dateFrom: '2026-10-20' },
      { id: 'yday', dateFrom: '2026-11-24' },
      { id: 'nodate' },
      // поездка: первые дни давно, последний — вчера → скрыта целиком
      { id: 't1', trip: 'Алтай', dateFrom: '2026-11-01' },
      { id: 't2', trip: 'Алтай', dateFrom: '2026-11-24', hidden: true },
      // текущий месяц без дня: могла идти до конца месяца — скрыта
      { id: 'thisMonth', year: 2026, month: 11 },
      { id: 'future', dateFrom: '2027-03-01' },
      // мечта с датой — не местоположение
      { id: 'dream', status: 'wishlist', year: 2026, month: 11 }
    ];
    const races = [{ id: 'r1', date: '2026-11-22' }, { id: 'r2', date: '2026-09-26' }, { id: 'r3' }];
    const d = delayedSets({ entries, races, days: 7, now: NOW });
    expect([...d.entryIds].sort()).toEqual(['future', 't1', 't2', 'thisMonth', 'yday']);
    expect([...d.trips]).toEqual(['Алтай']);
    expect([...d.raceIds]).toEqual(['r1']);
    expect(d.cutoff).toBe('2026-11-18');
  });
  it('N = 0 — выключено', () => {
    const d = delayedSets({ entries: [{ id: 'yday', dateFrom: '2026-11-24' }], races: [], days: 0, now: NOW });
    expect(d.entryIds.size).toBe(0);
    expect(d.cutoff).toBeNull();
  });
});
