import type { CoreFactory } from '../core/tess';
import type { ResolvedWorkerOptions } from '../core/types';

/*
 * The platform seam. `core/` is platform-agnostic and reaches the environment
 * ONLY through these interfaces; `node/` and `browser/` each implement them.
 * Two sides, because the worker runs in a separate context (worker_threads vs
 * Web Worker): a HostPlatform on the main thread, a WorkerPlatform in the worker.
 */

/** Papers over `worker_threads.Worker` (Node) and `Worker` (browser), main-thread side. */
export interface WorkerHandle {
  postMessage(msg: unknown, transfer?: ArrayBuffer[]): void;
  onMessage(cb: (msg: unknown) => void): void;
  onError(cb: (err: Error) => void): void;
  /** Node emits `exit`; the browser has no equivalent — the cb simply never fires. */
  onExit(cb: (code: number) => void): void;
  terminate(): Promise<void> | void;
  /** The underlying platform worker, exposed on `TesseractWorker.worker`. */
  raw: unknown;
}

/** Papers over `worker_threads.parentPort` (Node) and `self` (browser), worker side. */
export interface PortHandle {
  postMessage(msg: unknown, transfer?: ArrayBuffer[]): void;
  onMessage(cb: (msg: unknown) => void): void;
}

export interface Sha256Digest {
  hex: string;
  b64: string;
}

/** On-disk traineddata cache. `null` on a platform without one (browser). */
export interface LangCache {
  read(cachePath: string, lang: string): Promise<Uint8Array | null>;
  write(cachePath: string, lang: string, data: Uint8Array): Promise<void>;
  clear(cachePath: string, langCodes: string[]): Promise<void>;
}

export interface LoadCoreOptions {
  lstmOnly: boolean;
  /** BROWSER: same-origin core-WASM directory URL (validated host-side). */
  coreUrl?: string | null;
}

/** Worker-side primitives (differ Node vs browser). */
export interface WorkerPlatform {
  /** Load the tesseract.js-core Emscripten factory (Node: `require`; browser: `importScripts`
   *  a SAME-ORIGIN core URL — never a network fetch of the core). */
  loadCore(opts: LoadCoreOptions): Promise<CoreFactory>;
  /** Gunzip with an output cap (bomb guard). */
  gunzip(data: Uint8Array, maxBytes: number): Promise<Uint8Array>;
  sha256(data: Uint8Array): Promise<Sha256Digest>;
  cache: LangCache | null;
  /** Read `<base>/<fileName>` from a local dir (Node fs) or a same-origin URL (browser). */
  readLocalLangData(base: string, fileName: string, maxBytes: number): Promise<Uint8Array>;
  /** BROWSER: the traineddata ALWAYS comes from the same-origin bundle — never the jsdelivr
   *  CDN fetch. Set so any `langPath` (incl. an http(s) same-origin dev URL) is read via
   *  `readLocalLangData`, not routed to the Node https-only CDN path. Node leaves it unset. */
  localLangOnly?: boolean;
}

/** Main-thread primitives (differ Node vs browser). Stateless: the resolved options are
 *  passed to `spawnWorker` (so the browser reads `workerUrl`, Node reads `resourceLimits`). */
export interface HostPlatform {
  spawnWorker(opts: ResolvedWorkerOptions): WorkerHandle;
  /** Default on-disk cache dir. Browser returns a placeholder (cache is disabled). */
  defaultCachePath(): string;
  /** Option keys silently ignored (with a warning) on this platform — e.g. Node ignores the
   *  browser-only `workerUrl`/`coreUrl` and the removed tesseract.js `workerPath` ACE knobs. */
  legacyIgnoredKeys: readonly string[];
  /** Validate the resolved options for this platform (Node: langPath is an https URL or an
   *  existing dir; browser: langPath/workerUrl/coreUrl are present + same-origin). Throw on
   *  anything unacceptable — fail-closed. */
  validateResolved(opts: ResolvedWorkerOptions): void;
  /** Read an image from a fs path / `file:` URL. Absent → such inputs are rejected (browser). */
  readFile?: (spec: string, maxBytes: number) => Promise<Uint8Array>;
}
