/*
 * Worker-thread handlers (platform-agnostic). Every handler takes the mutable
 * WorkerState (so `load` → `initialize` can share the loaded module / retry data)
 * plus the injected WorkerPlatform (core WASM loader, gunzip, sha256, cache).
 *
 * Differences from the tesseract.js worker script are preserved: handler failures
 * are serialized back as rejections (never thrown out of the loop), the FS method
 * set is allowlisted a second time worker-side, and null-proto param objects.
 */
import * as langData from './langData';
import { INIT_ONLY_PARAMS } from './constants';
import { FS_METHODS } from './validate';
import type { TessModule, TessBaseAPI } from './tess';
import type {
  LoadPayload, LoadLanguagePayload, InitializePayload, FSPayload,
  TesseractParams,
} from './types';
import type { WorkerPlatform } from '../platform/types';

export interface Res {
  resolve(data?: unknown): void;
  reject(err: unknown): void;
  progress(data: unknown): void;
}

export interface WorkerState {
  platform: WorkerPlatform;
  TessModuleRef: TessModule | null;
  api: TessBaseAPI | null;
  params: TesseractParams;
  logging: boolean;
  currentProgress: Res | null; // res of the in-flight recognize, for TesseractProgress
  // Remembered so `initialize` can retry with fresh data when a cached
  // .traineddata turns out not to support the requested engine.
  lastLangPayload: LoadLanguagePayload | null;
  dataFromCache: boolean;
}

export const createState = (platform: WorkerPlatform): WorkerState => ({
  platform,
  TessModuleRef: null,
  api: null,
  params: {},
  logging: false,
  currentProgress: null,
  lastLangPayload: null,
  dataFromCache: false,
});

export const log = (state: WorkerState, ...args: unknown[]): void => {
  if (state.logging) console.log(...args);
};

export const assertLoaded = (state: WorkerState): TessModule => {
  if (!state.TessModuleRef) throw Error('Worker not loaded: `load` must run first.');
  return state.TessModuleRef;
};

export const assertInitialized = (state: WorkerState): { mod: TessModule; api: TessBaseAPI } => {
  const mod = assertLoaded(state);
  if (!state.api) throw Error('Worker not initialized: `initialize` must run first.');
  return { mod, api: state.api };
};

export const load = async (state: WorkerState, payload: LoadPayload, res: Res): Promise<void> => {
  state.logging = !!payload.logging;
  if (state.TessModuleRef) {
    res.resolve({ loaded: true });
    return;
  }
  res.progress({ status: 'loading tesseract core', progress: 0 });
  const Core = await state.platform.loadCore({ lstmOnly: payload.lstmOnly, coreUrl: payload.coreUrl });
  res.progress({ status: 'loading tesseract core', progress: 1 });

  res.progress({ status: 'initializing tesseract', progress: 0 });
  state.TessModuleRef = await Core({
    TesseractProgress(percent: number) {
      state.currentProgress?.progress({
        status: 'recognizing text',
        progress: Math.max(0, (percent - 30) / 70),
      });
    },
  });
  res.progress({ status: 'initializing tesseract', progress: 1 });
  res.resolve({ loaded: true });
};

export const loadLanguage = async (state: WorkerState, payload: LoadLanguagePayload, res: Res): Promise<void> => {
  const mod = assertLoaded(state);
  state.lastLangPayload = payload;
  state.dataFromCache = await langData.loadAll(mod, payload, res, state.platform);
  res.resolve(payload.langs.map((l) => l.code).join('+'));
};

export const initialize = async (state: WorkerState, payload: InitializePayload, res: Res): Promise<void> => {
  const mod = assertLoaded(state);
  const { langs, oem, config } = payload;
  const statusText = 'initializing api';
  res.progress({ status: statusText, progress: 0 });

  if (state.api !== null) {
    state.api.End();
    state.api = null;
  }

  let configFile: string | undefined;
  if (config) {
    // Object configs become "key value" lines (tesseract.js built these via
    // JSON.stringify + regex, which corrupted values containing , : or ").
    const configStr = typeof config === 'string'
      ? config
      : Object.entries(config).map(([k, v]) => `${k} ${String(v)}`).join('\n');
    if (configStr.length > 0) {
      configFile = '/config';
      mod.FS.writeFile(configFile, configStr);
    }
  }

  const api = new mod.TessBaseAPI();
  state.api = api;
  let status = api.Init(null, langs, oem, configFile);

  const last = state.lastLangPayload;
  if (status === -1 && last && ['write', 'refresh'].includes(last.cacheMethod)) {
    // Bad cached data is the most likely culprit: drop it.
    const langCodes = langs.split('+');
    await langData.clearCache(langCodes, last.cachePath, state.platform);

    // If the data came from cache and lacks the requested engine's model,
    // re-download and retry once.
    let debugStr = '';
    try {
      debugStr = mod.FS.readFile('/debugDev.txt', { encoding: 'utf8', flags: 'a+' });
    } catch {
      debugStr = '';
    }
    if (state.dataFromCache && /components are not present/.test(debugStr)) {
      log(state, 'Cached data is missing the requested OEM model; refreshing language data.');
      await langData.loadAll(mod, last, null, state.platform);
      status = api.Init(null, langs, oem, configFile);
      if (status === -1) {
        await langData.clearCache(langCodes, last.cachePath, state.platform);
      }
    }
  }

  if (status === -1) {
    api.End();
    state.api = null;
    throw Error('Tesseract initialization failed (bad or incompatible traineddata?).');
  }

  res.progress({ status: statusText, progress: 1 });
  res.resolve();
};

export const setParameters = async (state: WorkerState, payload: { params: TesseractParams }, res: Res): Promise<void> => {
  const { api } = assertInitialized(state);
  const newParams = payload.params;
  const initOnly = Object.keys(newParams).filter((k) => (INIT_ONLY_PARAMS as readonly string[]).includes(k));
  if (initOnly.length > 0) {
    console.warn(`tesseract2.js: these parameters can only be set at initialization and were ignored: ${initOnly.join(', ')}`);
  }
  for (const [key, value] of Object.entries(newParams)) {
    if (!key.startsWith('tessjs_') && !initOnly.includes(key)) {
      api.SetVariable(key, String(value));
    }
  }
  state.params = { ...state.params, ...newParams };
  res.resolve(state.params);
};

export const FS = async (state: WorkerState, payload: FSPayload, res: Res): Promise<void> => {
  const mod = assertLoaded(state);
  const { method, args } = payload;
  if (!FS_METHODS.has(method) || !Array.isArray(args)) {
    throw Error(`FS method not allowed: "${method}"`);
  }
  log(state, `FS.${method}`);
  const fs = mod.FS as unknown as Record<string, (...a: unknown[]) => unknown>;
  res.resolve(fs[method](...args));
};

export const terminate = async (state: WorkerState, _payload: unknown, res: Res): Promise<void> => {
  if (state.api !== null) {
    state.api.End();
    state.api = null;
  }
  res.resolve({ terminated: true });
};
