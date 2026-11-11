import { describe, it, expect } from 'vitest';
import { createErrorLog, errorText, stackLines, formatErrorLog, ERRLOG_MAX } from '../src/lib/errlog.js';

const memStorage = () => {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m };
};
const brokenStorage = () => ({
  getItem() {
    throw new Error('SecurityError');
  },
  setItem() {
    throw new Error('QuotaExceededError');
  },
  removeItem() {
    throw new Error('SecurityError');
  }
});

describe('errorText', () => {
  it('берёт имя и текст ошибки', () => {
    expect(errorText(new TypeError('x is not a function'))).toBe('TypeError: x is not a function');
    expect(errorText(new Error('просто'))).toBe('просто');
    expect(errorText('строка')).toBe('строка');
    expect(errorText(undefined)).toBe('undefined');
  });
  it('не тащит в журнал длинные цитаты из данных', () => {
    const e = new SyntaxError('Unexpected token \'x\', "{"entries":[{"name":"Секретное место"}]}" is not valid JSON');
    const t = errorText(e);
    expect(t).not.toContain('Секретное');
    expect(t).toContain('«…»');
    expect(t).toContain("'x'"); // короткие цитаты остаются — они про синтаксис, не про данные
  });
  it('обрезает слишком длинный текст', () => {
    expect(errorText(new Error('а'.repeat(1000))).length).toBeLessThanOrEqual(300);
  });
});

describe('stackLines', () => {
  it('до трёх строк, адрес — только имя файла', () => {
    const e = new Error('x');
    e.stack =
      'Error: x\n    at foo (https://example.org/Travel-map/index.html?v=2:1:100)\n    at bar (file:///C:/a/b/index.html:1:200)\n    at baz (index.html:1:3)\n    at qux (index.html:1:4)';
    expect(stackLines(e)).toEqual(['at foo (index.html:1:100)', 'at bar (index.html:1:200)', 'at baz (index.html:1:3)']);
    expect(stackLines('строка')).toEqual([]);
  });
});

describe('createErrorLog', () => {
  it('хранит не больше ERRLOG_MAX записей, старые уходят', () => {
    const st = memStorage();
    const log = createErrorLog({ storage: st });
    for (let i = 0; i < ERRLOG_MAX + 15; i++) log.add('место ' + i, new Error('ошибка ' + i));
    const list = log.list();
    expect(list.length).toBe(ERRLOG_MAX);
    expect(list[0].msg).toBe('ошибка 15');
    expect(list.at(-1).msg).toBe('ошибка ' + (ERRLOG_MAX + 14));
    // и переживает перезагрузку
    expect(createErrorLog({ storage: st }).list().length).toBe(ERRLOG_MAX);
  });
  it('повтор той же ошибки подряд — счётчик, а не новая запись', () => {
    let t = 1000;
    const log = createErrorLog({ storage: memStorage(), now: () => t++ });
    log.add('глобус', new Error('сбой'));
    log.add('глобус', new Error('сбой'));
    log.add('глобус', new Error('сбой'));
    log.add('список', new Error('сбой'));
    const list = log.list();
    expect(list.length).toBe(2);
    expect(list[0].n).toBe(3);
    expect(list[0].t).toBe(1002);
  });
  it('работает без хранилища и с недоступным хранилищем', () => {
    for (const storage of [null, brokenStorage()]) {
      const log = createErrorLog({ storage });
      expect(() => log.add('x', new Error('y'))).not.toThrow();
      expect(log.list().length).toBe(1);
      expect(() => log.clear()).not.toThrow();
      expect(log.list()).toEqual([]);
    }
  });
  it('испорченная запись в хранилище не мешает', () => {
    const st = memStorage();
    st.setItem('travel-map-errlog', '{не json');
    expect(createErrorLog({ storage: st }).list()).toEqual([]);
    st.setItem('travel-map-errlog', JSON.stringify([{ msg: 'ок', where: 'a', t: 1 }, null, { foo: 1 }]));
    expect(createErrorLog({ storage: st }).list().length).toBe(1);
  });
  it('очистка убирает журнал и из хранилища', () => {
    const st = memStorage();
    const log = createErrorLog({ storage: st });
    log.add('a', 'b');
    log.clear();
    expect(st.getItem('travel-map-errlog')).toBe(null);
    expect(createErrorLog({ storage: st }).list()).toEqual([]);
  });
});

describe('formatErrorLog', () => {
  it('новые сверху, со счётчиком и стеком', () => {
    const txt = formatErrorLog(
      [
        { t: 0, where: 'a', msg: 'первая' },
        { t: 1, where: 'b', msg: 'вторая', n: 2, stack: ['at f (index.html:1:2)'] }
      ],
      t => 'T' + t
    );
    expect(txt).toBe('T1  b (×2)\n  вторая\n    at f (index.html:1:2)\nT0  a\n  первая');
  });
});
