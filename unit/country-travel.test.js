// Справка о стране: вилки, экстренные номера, разница во времени с домом
import { describe, it, expect } from 'vitest';
import TRAVEL from '../src/data/country_travel.json';
import INFO from '../src/data/country_info.json';
import { plugCompat, emergencyLines, tzDiffMin, timeDiffInfo, formatDiff } from '../src/lib/country-travel.js';

describe('country_travel.json', () => {
  it('есть для всех стран справочника; поля правильной формы', () => {
    expect(Object.keys(TRAVEL).sort()).toEqual(Object.keys(INFO).sort());
    for(const [k, t] of Object.entries(TRAVEL)){
      if(t.plugs) expect(t.plugs, k).toMatch(/^[A-N]+$/);
      if(t.drive) expect(['L', 'R'], k).toContain(t.drive);
      expect([100, 110, 115, 120, 127, 230], k).toContain(t.v);
      if(t.tel) expect(t.tel, k).toMatch(/^\d{1,4}$/);
    }
    expect(Object.values(TRAVEL).filter(t => t.plugs).length).toBeGreaterThan(200);
  });
  it('известные факты', () => {
    expect(TRAVEL['United Kingdom']).toMatchObject({ plugs: 'G', drive: 'L', tel: '44' });
    expect(TRAVEL['Japan']).toMatchObject({ drive: 'L', v: 100, tel: '81' });
    expect(TRAVEL['Russia']).toMatchObject({ plugs: 'CF', drive: 'R', v: 230, tel: '7' });
    expect(TRAVEL['Thailand'].drive).toBe('L');
    expect(TRAVEL['United States of America']).toMatchObject({ v: 120, tel: '1' });
    expect(TRAVEL['Georgia'].em).toEqual({ p: '112', n112: 'main' });
  });
});

describe('вилки', () => {
  it('из России (C, F)', () => {
    expect(plugCompat('CF', 'CF').level).toBe('same');
    expect(plugCompat('CF', 'CEF').level).toBe('same');             // Франция: E принимает и C, и F
    expect(plugCompat('CF', 'CFL')).toMatchObject({ level: 'same' });
    expect(plugCompat('CF', 'CJ')).toMatchObject({ level: 'some', fits: ['C'], nofit: ['F'] }); // Швейцария
    expect(plugCompat('CF', 'L')).toMatchObject({ level: 'some', fits: ['C'] });               // старая итальянская
    expect(plugCompat('CF', 'G').level).toBe('none');               // Британия
    expect(plugCompat('CF', 'AB').level).toBe('none');              // США
    expect(plugCompat(null, 'G')).toBe(null);
  });
});

describe('экстренные номера', () => {
  it('единый 112 и службы без дублей', () => {
    expect(emergencyLines({ p: '102/112', a: '103/112', f: '101/112', n112: 'main' })).toEqual({ single: ['112'], services: [['полиция', ['102']], ['скорая', ['103']], ['пожарные', ['101']]], mobile112: false });
    expect(emergencyLines({ p: '112', n112: 'main' })).toEqual({ single: ['112'], services: [], mobile112: false });
  });
  it('один номер на всё и 112 с мобильного', () => {
    expect(emergencyLines({ p: '911', n112: 'mobile' })).toEqual({ single: ['911'], services: [], mobile112: true });
    expect(emergencyLines({ p: '999/112' })).toEqual({ single: ['999', '112'], services: [], mobile112: false });
    expect(emergencyLines({ p: '110', a: '119', f: '119', n112: 'mobile' }).services).toHaveLength(3);
    expect(emergencyLines(null)).toBe(null);
  });
});

describe('время', () => {
  it('разница с Москвой с учётом летнего времени', () => {
    const jan = new Date(Date.UTC(2026, 0, 15)), jul = new Date(Date.UTC(2026, 6, 15));
    expect(tzDiffMin('Europe/Berlin', 'Europe/Moscow', jan)).toBe(-120);
    expect(tzDiffMin('Europe/Berlin', 'Europe/Moscow', jul)).toBe(-60);
    expect(tzDiffMin('America/New_York', 'Europe/Moscow', jan)).toBe(-480);
    expect(tzDiffMin('Asia/Tbilisi', 'Europe/Moscow', jul)).toBe(60);
    expect(tzDiffMin('Asia/Kolkata', 'Europe/Moscow', jan)).toBe(150);
  });
  it('ближайший перевод часов и неизменная разница', () => {
    const t = timeDiffInfo('Europe/Berlin', 'Europe/Moscow', new Date(Date.UTC(2026, 10, 8)));
    expect(t).toMatchObject({ now: -120, winter: -120, summer: -60 });
    expect(t.next.diff).toBe(-60);
    expect(t.next.date.toISOString().slice(0, 10)).toBe('2027-03-28');   // последнее воскресенье марта
    const g = timeDiffInfo('Asia/Tbilisi', 'Europe/Moscow', new Date(Date.UTC(2026, 10, 8)));
    expect(g).toMatchObject({ now: 60, winter: 60, summer: 60, next: null });
    // южное полушарие: в Сиднее летнее время — в январе
    const s = timeDiffInfo('Australia/Sydney', 'Europe/Moscow', new Date(Date.UTC(2026, 10, 8)));
    expect([s.winter, s.summer]).toEqual([480, 420]);
  });
  it('формат', () => {
    expect([formatDiff(300), formatDiff(-120), formatDiff(150), formatDiff(-30), formatDiff(0)]).toEqual(['+5 ч', '−2 ч', '+2 ч 30 мин', '−30 мин', '0 ч']);
  });
});
