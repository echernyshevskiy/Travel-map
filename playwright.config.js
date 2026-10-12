// Тесты открывают страницы прямо из файлов репозитория: сервер не нужен,
// запросы к адресу https://travel-map.test/ отдаются из папки репозитория,
// всё остальное (тайлы, шрифты, геокодер) либо подменяется в тесте, либо
// блокируется — так результат не зависит от сети.
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    trace: 'retain-on-failure',
    serviceWorkers: 'block', // сервис-воркер ходил бы в сеть мимо перехвата запросов
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
});
