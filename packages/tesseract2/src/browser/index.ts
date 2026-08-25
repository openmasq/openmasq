/**
 * tesseract2.js — browser entry (Web Worker + a SAME-ORIGIN bundled tesseract.js-core
 * WASM). Same public API as the Node entry, but `createWorker` REQUIRES same-origin
 * `workerUrl` + `coreUrl` (validated fail-closed) and typically a same-origin `langPath`:
 *
 *   createWorker(langs, oem, { workerUrl, coreUrl, langPath, gzip:false, integrity })
 *
 * Intended for a signed extension bundle (MV3 offscreen document): the worker, core WASM
 * and traineddata are web-accessible resources served from `chrome-extension://<id>/…`.
 */
import { OEM, PSM, LANGUAGES } from '../core/constants';
import { buildApi } from '../core';
import { browserHost } from './host';

const api = buildApi(browserHost);

export const createWorker = api.createWorker;
export const createScheduler = api.createScheduler;
export const recognize = api.recognize;
export const detect = api.detect;

export { OEM, PSM, LANGUAGES, LANGUAGES as languages } from '../core/constants';
export type { OEMValue, PSMValue } from '../core/constants';
export {
  TesseractError, ValidationError, NetworkError, WorkerError, TimeoutError,
} from '../core/errors';
export type {
  ImageLike, CustomLang, Langs, LoggerMessage, CacheMethod, TesseractParams,
  ConfigInput, WorkerOptions, Rectangle, RecognizeOptions, OutputFormats,
  Block, RecognizeData, DetectData, JobResult, FSMethod, TesseractWorker,
  Scheduler, SchedulableAction,
} from '../core/types';

export default {
  createWorker, createScheduler, recognize, detect, OEM, PSM, languages: LANGUAGES,
};
