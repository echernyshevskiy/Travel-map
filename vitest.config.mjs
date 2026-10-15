// Модульные тесты чистой логики (src/lib). Отдельно от vite.config.mjs, чтобы
// плагины сборки приложения (склейка src/app, мост на window) их не касались.
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['unit/**/*.test.js'], environment: 'node' } });
