import { ValidationError, WorkerError } from './errors';
import type { Scheduler, SchedulableAction, TesseractWorker } from './types';

// `globalThis.crypto.randomUUID` is a standard global on Node 18+ AND the browser —
// isomorphic, no `require('crypto')`.
const uuid = (): string => globalThis.crypto.randomUUID();

/*
 * Actions that may be dispatched through `scheduler.addJob`. Dispatch is by
 * property lookup on the worker object, so it is allowlisted (tesseract.js
 * called `worker[action]` with any string).
 */
const SCHEDULABLE_ACTIONS: ReadonlySet<string> = new Set<SchedulableAction>([
  'recognize', 'detect', 'setParameters', 'reinitialize',
  'writeText', 'readText', 'removeFile', 'FS',
]);

interface Task {
  action: SchedulableAction;
  args: unknown[];
  resolve: (value: unknown) => void;
  reject: (err: unknown) => void;
}

let schedulerCounter = 0;

export function createScheduler(): Scheduler {
  schedulerCounter += 1;
  const id = `Scheduler-${schedulerCounter}-${uuid().slice(0, 8)}`;
  const workers = new Map<string, TesseractWorker>();
  const idle: TesseractWorker[] = [];
  const queue: Task[] = [];
  let terminated = false;

  // A job that failed because its worker is DEAD (the app called `worker.terminate()`
  // directly, or the thread crashed/exited) — audit L3. Such a worker must leave the
  // rotation, else every future job routed to it fails in `WorkerError`.
  const isDeadWorkerError = (err: unknown): boolean =>
    err instanceof WorkerError
    && /(no longer alive|has been terminated|Worker terminated|thread crashed|exited unexpectedly)/i.test(err.message);

  const dropWorker = (worker: TesseractWorker): void => {
    workers.delete(worker.id);
    const i = idle.indexOf(worker);
    if (i >= 0) idle.splice(i, 1);
  };

  const exec = async (worker: TesseractWorker, task: Task): Promise<void> => {
    let workerDead = false;
    try {
      const method = worker[task.action] as (...args: unknown[]) => Promise<unknown>;
      task.resolve(await method.apply(worker, task.args));
    } catch (err) {
      task.reject(err);
      workerDead = isDeadWorkerError(err);
    }
    // Drop a dead worker instead of re-idling it (audit L3); otherwise keep it in rotation.
    if (workerDead) dropWorker(worker);
    else runNext(worker); // eslint-disable-line @typescript-eslint/no-use-before-define
  };

  const runNext = (worker: TesseractWorker): void => {
    if (terminated || !workers.has(worker.id)) return;
    const task = queue.shift();
    if (task) {
      void exec(worker, task);
    } else {
      idle.push(worker);
    }
  };

  const addWorker = (worker: TesseractWorker): string => {
    if (terminated) throw new WorkerError(`[${id}]: Scheduler has been terminated.`);
    if (!worker || typeof worker.id !== 'string' || typeof worker.recognize !== 'function') {
      throw new ValidationError('addWorker expects a worker created by createWorker().');
    }
    if (workers.has(worker.id)) throw new ValidationError(`[${id}]: Worker ${worker.id} was already added.`);
    workers.set(worker.id, worker);
    runNext(worker);
    return worker.id;
  };

  const addJob = (action: SchedulableAction, ...args: unknown[]): Promise<unknown> => {
    if (terminated) return Promise.reject(new WorkerError(`[${id}]: Scheduler has been terminated.`));
    if (!SCHEDULABLE_ACTIONS.has(action)) {
      return Promise.reject(new ValidationError(`[${id}]: Action not schedulable: "${action}". Allowed: ${[...SCHEDULABLE_ACTIONS].join(', ')}`));
    }
    if (workers.size === 0) {
      return Promise.reject(new WorkerError(`[${id}]: Add at least one worker before adding jobs.`));
    }
    return new Promise((resolve, reject) => {
      const task: Task = { action, args, resolve, reject };
      const worker = idle.pop();
      if (worker) void exec(worker, task);
      else queue.push(task);
    });
  };

  const terminate = async (): Promise<void> => {
    if (terminated) return;
    terminated = true;
    for (const task of queue.splice(0)) {
      task.reject(new WorkerError(`[${id}]: Scheduler terminated before this job ran.`));
    }
    idle.length = 0;
    const all = [...workers.values()];
    workers.clear();
    await Promise.allSettled(all.map((w) => w.terminate()));
  };

  return {
    id,
    addWorker,
    addJob: addJob as Scheduler['addJob'],
    terminate,
    getQueueLen: () => queue.length,
    getNumWorkers: () => workers.size,
  };
}
