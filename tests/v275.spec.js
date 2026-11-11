// v2.75: журнал ошибок вместо пустых перехватов (B1)
const { test, expect } = require('@playwright/test');
const { openApp, expectNoErrors } = require('./helpers');

const openDiagnostics = page => page.evaluate(() => document.getElementById('openDiagnosticsBtn').click());
const errSection = page => page.locator('#diagnosticsModal #errorLogSection');

test.describe('B1: журнал ошибок', () => {
  test('пустой журнал — раздела в проверке нет', async ({ page }) => {
    const { errors } = await openApp(page);
    await openDiagnostics(page);
    await expect(page.locator('#diagnosticsModal')).toBeVisible();
    await expect(errSection(page)).toHaveCount(0);
    await expectNoErrors(errors);
  });

  test('сбой скрипта попадает в журнал, виден в проверке и переживает перезагрузку', async ({ page }) => {
    await openApp(page);
    // искусственный сбой «в фоне»: такие раньше видели только в консоли
    await page.evaluate(() =>
      setTimeout(() => {
        throw new Error('проверочный сбой 4417');
      }, 0)
    );
    await page.evaluate(() => Promise.reject(new Error('проверочный отказ 4418')).catch(() => {}) && null);
    await page.evaluate(() => {
      Promise.reject(new Error('проверочный отказ 4419'));
    });
    await expect.poll(() => page.evaluate(() => (localStorage.getItem('travel-map-errlog') || '').includes('4419'))).toBe(true);
    await page.keyboard.press('Escape'); // баннер о сбое не мешает
    await openDiagnostics(page);
    const sec = errSection(page);
    await expect(sec).toBeVisible();
    await expect(sec).toContainText('проверочный сбой 4417');
    await expect(sec).toContainText('скрипт');
    await expect(sec).toContainText('проверочный отказ 4419');
    await expect(sec).toContainText('фоновая операция');
    await expect(sec).not.toContainText('4418'); // перехваченный отказ — не ошибка
    // после перезагрузки журнал на месте
    await page.reload();
    await page.waitForFunction(() => !!window.__travelMap);
    await openDiagnostics(page);
    await expect(errSection(page)).toContainText('проверочный сбой 4417');
  });

  test('переполнение хранилища при сохранении настройки — в журнале, приложение работает', async ({ page }) => {
    const { errors } = await openApp(page);
    await page.evaluate(() => {
      const orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (k === 'travel-map-theme') throw new DOMException('нет места', 'QuotaExceededError');
        return orig.call(this, k, v);
      };
    });
    const before = await page.evaluate(() => document.documentElement.dataset.theme || '');
    await page.click('#themeToggleBtn');
    // тема переключилась, хотя и не запомнилась
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme || '')).not.toBe(before);
    await openDiagnostics(page);
    await expect(errSection(page)).toContainText('хранилище переполнено: travel-map-theme');
    await expectNoErrors(errors);
  });

  test('нет доступа к хранилищу (приватное окно) — не сбой, журнал пуст', async ({ page }) => {
    const { errors } = await openApp(page);
    await page.evaluate(() => {
      const orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (k === 'travel-map-theme') throw new DOMException('запрещено', 'SecurityError');
        return orig.call(this, k, v);
      };
    });
    await page.click('#themeToggleBtn');
    await openDiagnostics(page);
    await expect(errSection(page)).toHaveCount(0);
    await expectNoErrors(errors);
  });

  test('«Скопировать» и «Очистить»', async ({ page, context }, info) => {
    await openApp(page);
    await page.evaluate(() =>
      setTimeout(() => {
        throw new Error('для копирования 7731');
      }, 0)
    );
    await expect.poll(() => page.evaluate(() => (localStorage.getItem('travel-map-errlog') || '').includes('7731'))).toBe(true);
    await page.keyboard.press('Escape');
    await openDiagnostics(page);
    // буфер обмена: перехватываем запись, чтобы не зависеть от разрешений браузера
    await page.evaluate(() => {
      window.__copied = null;
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: t => {
            window.__copied = t;
            return Promise.resolve();
          }
        }
      });
    });
    await page.click('#errorLogCopyBtn');
    await expect.poll(() => page.evaluate(() => window.__copied)).toContain('для копирования 7731');
    const copied = await page.evaluate(() => window.__copied);
    expect(copied).toMatch(/^Карта путешествий v2\.\d+/);
    await page.click('#errorLogClearBtn');
    await expect(errSection(page)).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('travel-map-errlog'))).toBe(null);
  });

  test('в журнал не попадает содержимое записей', async ({ page }) => {
    await openApp(page);
    // ошибка разбора JSON цитирует разбираемый текст — в журнале его быть не должно
    await page.evaluate(() =>
      setTimeout(() => {
        JSON.parse('{"entries":[{"name":"Тайное место 9921"}');
      }, 0)
    );
    await expect.poll(() => page.evaluate(() => (localStorage.getItem('travel-map-errlog') || '').length)).toBeGreaterThan(0);
    expect(await page.evaluate(() => localStorage.getItem('travel-map-errlog'))).not.toContain('9921');
  });

  test('версия для друзей: журнала в проверке нет', async ({ page }) => {
    const { errors } = await openApp(page, { build: 'friends' });
    await expect(page.locator('#openDiagnosticsBtn')).toBeHidden();
    expect(await page.evaluate(() => (typeof buildErrorLogSection === 'function' ? buildErrorLogSection() : ''))).toBe('');
    await expectNoErrors(errors);
  });
});
