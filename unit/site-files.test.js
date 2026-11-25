import { describe, it, expect } from 'vitest';
import { siteFiles } from '../scripts/site-files.mjs';

describe('файлы сайта', () => {
  const tracked = [
    'index.html',
    'sw.js',
    'manifest.json',
    'icon-192.png',
    'fonts/a.woff2',
    'borders/m/00.json',
    'covers/Altai.webp',
    'vendor/maplibre-gl-6.16.0/maplibre-gl.mjs',
    'friends/manifest.json',
    'friends/icon-192.png',
    'src/app/01-map.js',
    'tests/helpers.js',
    'unit/x.test.js',
    'scripts/build-friends.mjs',
    'docs/data-repo/backup.yml',
    '.github/workflows/friends.yml',
    '.githooks/pre-commit',
    '.gitleaks.toml',
    '.gitignore',
    'package.json',
    'package-lock.json',
    'vite.config.mjs',
    'playwright.config.js',
    'README.md',
    'DEVELOPMENT.md'
  ];
  it('сайту — только нужное, собранные файлы — всегда', () => {
    expect(siteFiles(tracked)).toEqual([
      'borders/m/00.json',
      'covers/Altai.webp',
      'fonts/a.woff2',
      'friends/icon-192.png',
      'friends/index.html',
      'friends/manifest.json',
      'friends/sw.js',
      'icon-192.png',
      'index.html',
      'manifest.json',
      'sw.js',
      'vendor/maplibre-gl-6.16.0/maplibre-gl.mjs'
    ]);
  });
  it('то, что сборка положила в fonts/ и vendor/, попадает на сайт, даже если не закоммичено', () => {
    const out = siteFiles(['index.html'], ['fonts/new.woff2', 'vendor/lib-2.0/lib.mjs']);
    expect(out).toContain('fonts/new.woff2');
    expect(out).toContain('vendor/lib-2.0/lib.mjs');
  });
});
