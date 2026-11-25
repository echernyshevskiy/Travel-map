// Включает проверки перед коммитом из папки .githooks (сейчас — поиск
// секретов gitleaks). Запускается само при `npm install` / `npm ci`.
// В CI не нужно: там коммиты делает сборка сайта, а секреты проверяет
// отдельный шаг в .github/workflows/tests.yml.
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

if (process.env.CI || !existsSync('.git')) process.exit(0);
try {
  execFileSync('git', ['config', 'core.hooksPath', '.githooks']);
  console.log('Проверки перед коммитом включены (.githooks): поиск секретов gitleaks');
} catch (e) {
  console.log('Не удалось включить проверки перед коммитом — git не найден');
}
