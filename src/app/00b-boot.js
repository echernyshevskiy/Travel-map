// Запуск по этапам (B7). Пока идёт запуск (booting), тяжёлое и невидимое
// сразу — статистика с учётом фильтров, значок проверки данных, подписи
// на карте — не считается в одной длинной задаче с отрисовкой точек, а
// ставится в очередь idleTask и выполняется порциями, когда браузер свободен.
// Когда очередь пуста и запуск закончен, у <html> появляется data-ready="1" —
// по нему тесты понимают, что всё досчитано.

let booting = true;
const idleQueue = [];
let idleScheduled = false;

// Выполнить fn после первой отрисовки, когда браузер свободен. Задачи с одним
// именем не копятся: остаётся последняя.
function idleTask(name, fn) {
  const i = idleQueue.findIndex(t => t[0] === name);
  if (i >= 0) idleQueue.splice(i, 1);
  idleQueue.push([name, fn]);
  scheduleIdle();
}
function scheduleIdle() {
  if (idleScheduled) return;
  idleScheduled = true;
  const run = () => {
    idleScheduled = false;
    const t0 = performance.now();
    // за один заход — задачи, пока не прошло ~40 мс; остальное — в следующий
    while (idleQueue.length && performance.now() - t0 < 40) {
      const [name, fn] = idleQueue.shift();
      try {
        fn();
      } catch (e) {
        logError('отложенный шаг: ' + name, e);
      }
    }
    if (idleQueue.length) scheduleIdle();
    else markReadyIfDone();
  };
  // сначала дать браузеру нарисовать кадр, потом ждать свободного времени
  requestAnimationFrame(() => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 600 });
    else setTimeout(run, 30);
  });
}
function finishBoot() {
  booting = false;
  markReadyIfDone();
}
function markReadyIfDone() {
  if (!booting && !idleQueue.length && !idleScheduled) document.documentElement.dataset.ready = '1';
}
