/**
 * tesseract2.js — Node entry (worker_threads + the bundled tesseract.js-core WASM).
 *
 * Public API is compatible with tesseract.js for Node usage:
 *   createWorker, createScheduler, recognize, detect, OEM, PSM, languages.
 */
import { OEM, PSM, LANGUAGES } from '../core/constants';
import { buildApi } from '../core';
import { nodeHost } from './host';

const api = buildApi(nodeHost);

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
