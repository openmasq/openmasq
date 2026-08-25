import { OEM, type OEMValue } from './constants';
import { ValidationError, WorkerError, TimeoutError } from './errors';
import {
  normalizeLangs, assertOem, assertParams, assertOutput, assertRecognizeOptions,
  assertConfig, isPlainObject, FS_METHODS,
} from './validate';
import { resolveOptions } from './resolveOptions';
import { loadImage } from './loadImage';
import type {
  Langs, NormalizedLang, WorkerOptions, TesseractWorker,
  TesseractParams, ConfigInput, RecognizeOptions, OutputFormats, JobResult,
  RecognizeData, DetectData, FSMethod, WorkerAction, ResponseMessage,
  SerializedError, LoggerMessage, LoadLanguagePayload,
} from './types';
import type { HostPlatform } from '../platform/types';

const uuid = (): string => globalThis.crypto.randomUUID();

const safeCall = <T>(fn: (arg: T) => void, arg: T): void => {
  try {
    fn(arg);
  } catch (err) {
    console.warn(`tesseract2.js: user callback threw: ${(err as Error).message}`);
  }
};

interface PendingJob {
  action: WorkerAction;
  resolve: (result: JobResult<never>) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout> | null;
}

let workerCounter = 0;

/*
 * The platform-agnostic `createWorker` facade. Spawns a worker through the injected
 * HostPlatform (worker_threads in Node, a Web Worker in the browser), boots
 * load→loadLanguage→initialize, and tears the worker down on any boot failure. The
 * worker script path (Node) / URL (browser) is FIXED by the platform — there is no
 * arbitrary `workerPath` ACE knob.
 */
export async function createWorkerWith(
  host: HostPlatform,
  langs: Langs = 'eng',
  oem: OEMValue = OEM.LSTM_ONLY,
  options: WorkerOptions = {},
  config: ConfigInput = {},
): Promise<TesseractWorker> {
  assertOem(oem);
  assertConfig(config);
  const opts = resolveOptions(options, host);
  const currentLangs = normalizeLangs(langs);
  let currentOem: OEMValue = oem;
  let currentConfig: ConfigInput = config;

  workerCounter += 1;
  const id = `Worker-${workerCounter}-${uuid().slice(0, 8)}`;
  const lstmOnlyCore = ([OEM.DEFAULT, OEM.LSTM_ONLY] as number[]).includes(oem) && !opts.legacyCore;

  const pending = new Map<string, PendingJob>();
  let terminated = false;
  let dead = false;

  const handle = host.spawnWorker(opts);

  const failAll = (err: Error): void => {
    for (const job of pending.values()) {
      if (job.timer) clearTimeout(job.timer);
      job.reject(err);
    }
    pending.clear();
  };

  handle.onMessage((raw) => {
    const msg = raw as ResponseMessage;
    if (!isPlainObject(msg)) return;
    const { id: jobId, status, data } = msg;
    if (status === 'progress') {
      if (opts.logger) safeCall(opts.logger, { ...(data as LoggerMessage), userJobId: jobId });
      return;
    }
    const job = pending.get(jobId);
    if (!job) return;
    pending.delete(jobId);
    if (job.timer) clearTimeout(job.timer);
    if (status === 'resolve') {
      job.resolve({ jobId, data } as JobResult<never>);
    } else {
      const serialized = data as SerializedError | undefined;
      const err = new WorkerError(`${job.action} failed: ${serialized?.message ?? String(data)}`);
      if (opts.errorHandler) safeCall(opts.errorHandler, err);
      job.reject(err);
    }
  });

  handle.onError((err) => {
    dead = true;
    failAll(new WorkerError(`Worker thread crashed: ${err.message}`));
  });

  handle.onExit((code) => {
    dead = true;
    if (!terminated) failAll(new WorkerError(`Worker thread exited unexpectedly (code ${code}).`));
  });

  const startJob = <T>(
    action: WorkerAction,
    payload: unknown,
    transferList: ArrayBuffer[] = [],
    { timeout = opts.jobTimeout }: { timeout?: number } = {},
  ): Promise<JobResult<T>> => (
    new Promise<JobResult<T>>((resolve, reject) => {
      if (terminated || dead) {
        reject(new WorkerError(`Cannot run "${action}": worker ${terminated ? 'has been terminated' : 'is no longer alive'}.`));
        return;
      }
      const jobId = uuid();
      const job: PendingJob = {
        action,
        resolve: resolve as PendingJob['resolve'],
        reject,
        timer: null,
      };
      if (timeout > 0) {
        job.timer = setTimeout(() => {
          pending.delete(jobId);
          reject(new TimeoutError(`"${action}" timed out after ${timeout}ms. The worker may still be busy; consider terminating it.`));
        }, timeout);
        (job.timer as { unref?: () => void }).unref?.();
      }
      pending.set(jobId, job);
      handle.postMessage({ id: jobId, action, payload }, transferList);
    })
  );

  const loadLanguageJob = (langList: NormalizedLang[]): Promise<JobResult> => {
    const transfer = langList
      .filter((l) => l.data)
      .map((l) => (l.data as Uint8Array).buffer as ArrayBuffer);
    const payload: LoadLanguagePayload = {
      langs: langList,
      langPath: opts.langPath,
      dataPath: opts.dataPath,
      cachePath: opts.cachePath,
      cacheMethod: opts.cacheMethod,
      gzip: opts.gzip,
      lstmOnly: ([OEM.DEFAULT, OEM.LSTM_ONLY] as number[]).includes(currentOem) && !opts.legacyLang,
      fetchTimeout: opts.fetchTimeout,
      maxLangDataBytes: opts.maxLangDataBytes,
      ...(opts.integrity ? { integrity: opts.integrity } : {}),
    };
    return startJob('loadLanguage', payload, transfer, { timeout: 0 });
  };

  const initializeJob = (langList: NormalizedLang[], oemValue: OEMValue, configValue: ConfigInput): Promise<JobResult> => (
    startJob('initialize', {
      langs: langList.map((l) => l.code).join('+'),
      oem: oemValue,
      config: configValue,
    }, [], { timeout: 0 })
  );

  const terminate = async (): Promise<void> => {
    if (terminated) return;
    terminated = true;
    failAll(new WorkerError('Worker terminated.'));
    await handle.terminate();
  };

  const api: TesseractWorker = {
    id,
    worker: handle.raw,

    load: () => {
      console.warn('`load` is deprecated: workers come pre-loaded.');
    },

    writeText: (filePath, text) => startJob('FS', { method: 'writeFile', args: [filePath, text] }),
    readText: (filePath) => startJob<string>('FS', { method: 'readFile', args: [filePath, { encoding: 'utf8' }] }),
    removeFile: (filePath) => startJob('FS', { method: 'unlink', args: [filePath] }),

    FS: (method: FSMethod, args: unknown[] = []) => {
      if (!FS_METHODS.has(method)) {
        return Promise.reject(new ValidationError(`FS method not allowed: "${method}". Allowed: ${[...FS_METHODS].join(', ')}`));
      }
      if (!Array.isArray(args)) return Promise.reject(new ValidationError('FS `args` must be an array.'));
      return startJob('FS', { method, args });
    },

    setParameters: (params: TesseractParams = {}) => {
      assertParams(params);
      return startJob<TesseractParams>('setParameters', { params });
    },

    reinitialize: async (newLangs: Langs = 'eng', newOem?: OEMValue, newConfig?: ConfigInput) => {
      const oemFinal = newOem === undefined ? currentOem : newOem;
      assertOem(oemFinal);
      if (lstmOnlyCore && ([OEM.TESSERACT_ONLY, OEM.TESSERACT_LSTM_COMBINED] as number[]).includes(oemFinal)) {
        throw new ValidationError('Legacy engine requested, but the loaded core is LSTM-only (create the worker with `legacyCore: true`).');
      }
      assertConfig(newConfig);
      const langList = normalizeLangs(newLangs);
      currentOem = oemFinal;
      if (newConfig !== undefined) currentConfig = newConfig;

      const missing = langList.filter((l) => !currentLangs.some((c) => c.code === l.code));
      currentLangs.push(...missing);
      if (missing.length > 0) await loadLanguageJob(missing);
      return initializeJob(langList, currentOem, currentConfig);
    },

    recognize: async (image, ropts: RecognizeOptions = {}, output: OutputFormats = { text: true }) => {
      assertRecognizeOptions(ropts);
      assertOutput(output);
      const data = await loadImage(image, { ...opts, readFile: host.readFile });
      return startJob<RecognizeData>('recognize', { image: data, options: ropts, output }, [data.buffer as ArrayBuffer]);
    },

    detect: async (image) => {
      if (lstmOnlyCore) {
        throw new ValidationError('`worker.detect` requires the Legacy model; create the worker with `legacyCore: true` and OEM.TESSERACT_ONLY.');
      }
      const data = await loadImage(image, { ...opts, readFile: host.readFile });
      return startJob<DetectData>('detect', { image: data }, [data.buffer as ArrayBuffer]);
    },

    terminate,
  };

  // Boot sequence. Any failure tears the worker down and rejects createWorker
  // (tesseract.js could leave a live thread and a forever-pending promise).
  try {
    await startJob('load', { lstmOnly: lstmOnlyCore, logging: opts.logging, coreUrl: opts.coreUrl }, [], { timeout: 0 });
    await loadLanguageJob(currentLangs);
    await initializeJob(currentLangs, currentOem, currentConfig);
  } catch (err) {
    await terminate().catch(() => {});
    throw err;
  }

  return api;
}
