import { ValidationError } from '../core/errors';
import { assertSameOrigin } from './sameOrigin';
import type { HostPlatform, WorkerHandle } from '../platform/types';
import type { ResolvedWorkerOptions } from '../core/types';

/*
 * Browser HostPlatform. Spawns a CLASSIC Web Worker from a SAME-ORIGIN `workerUrl`
 * (classic, not module — the worker uses `importScripts` to load the core). The
 * worker/core/lang URLs are validated same-origin (fail-closed); there is no on-disk
 * cache and no fs image reader (path/`file:` inputs are rejected by the shared core).
 */
export const browserHost: HostPlatform = {
  spawnWorker(opts: ResolvedWorkerOptions): WorkerHandle {
    // `workerUrl` is guaranteed present + same-origin by `validateResolved` below; re-assert
    // to be safe (defense in depth) before constructing the Worker.
    const url = assertSameOrigin(opts.workerUrl as string, '`workerUrl`');
    const worker = new Worker(url);
    return {
      postMessage: (msg, transfer) => worker.postMessage(msg, transfer ?? []),
      onMessage: (cb) => { worker.onmessage = (e: MessageEvent) => cb(e.data); },
      onError: (cb) => { worker.onerror = (e: ErrorEvent) => cb(new Error(e.message || 'worker error')); },
      onExit: () => { /* the browser has no worker-exit event */ },
      terminate: () => { worker.terminate(); },
      raw: worker,
    };
  },
  // A browser has no on-disk cache; this placeholder is never used for I/O (the WorkerPlatform
  // cache is null), it only satisfies the non-empty `cachePath` invariant.
  defaultCachePath: () => 'browser:no-cache',
  // The removed tesseract.js ACE knobs are ignored; `workerUrl`/`coreUrl` are CONSUMED here.
  legacyIgnoredKeys: ['workerPath', 'corePath', 'workerBlobURL'],
  validateResolved(opts: ResolvedWorkerOptions): void {
    if (!opts.workerUrl) throw new ValidationError('`workerUrl` (a same-origin worker script URL) is required in the browser build.');
    if (!opts.coreUrl) throw new ValidationError('`coreUrl` (a same-origin core-WASM directory URL) is required in the browser build.');
    assertSameOrigin(opts.workerUrl, '`workerUrl`');
    assertSameOrigin(opts.coreUrl, '`coreUrl`');
    // langPath, when supplied, is the same-origin bundled traineddata directory.
    if (opts.langPath !== null) assertSameOrigin(opts.langPath, '`langPath`');
  },
  // No `readFile`: `file:`/path image inputs are rejected by the shared loadImage.
};
