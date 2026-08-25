/*
 * Shared core barrel. `node/index.ts` and `browser/index.ts` each build a HostPlatform
 * and call `buildApi(host)` to get the SAME public API surface, then re-export it.
 */
import { OEM, PSM, LANGUAGES, type OEMValue } from './constants';
import { createWorkerWith } from './facade';
import { createScheduler } from './createScheduler';
import type {
  ImageLike, Langs, WorkerOptions, ConfigInput, JobResult, RecognizeData, DetectData,
  TesseractWorker,
} from './types';
import type { HostPlatform } from '../platform/types';

export interface Tesseract2Api {
  createWorker(langs?: Langs, oem?: OEMValue, options?: WorkerOptions, config?: ConfigInput): Promise<TesseractWorker>;
  createScheduler: typeof createScheduler;
  recognize(image: ImageLike, langs?: Langs, options?: WorkerOptions): Promise<JobResult<RecognizeData>>;
  detect(image: ImageLike, options?: WorkerOptions): Promise<JobResult<DetectData>>;
  OEM: typeof OEM;
  PSM: typeof PSM;
  LANGUAGES: typeof LANGUAGES;
  languages: typeof LANGUAGES;
}

/** Bind the public tesseract2.js API to a platform (Node or browser). */
export function buildApi(host: HostPlatform): Tesseract2Api {
  const createWorker = (
    langs: Langs = 'eng',
    oem: OEMValue = OEM.LSTM_ONLY,
    options: WorkerOptions = {},
    config: ConfigInput = {},
  ): Promise<TesseractWorker> => createWorkerWith(host, langs, oem, options, config);

  const recognize = async (
    image: ImageLike,
    langs: Langs = 'eng',
    options: WorkerOptions = {},
  ): Promise<JobResult<RecognizeData>> => {
    const worker = await createWorker(langs, OEM.LSTM_ONLY, options);
    try {
      return await worker.recognize(image);
    } finally {
      await worker.terminate();
    }
  };

  const detect = async (
    image: ImageLike,
    options: WorkerOptions = {},
  ): Promise<JobResult<DetectData>> => {
    const worker = await createWorker('osd', OEM.TESSERACT_ONLY, options);
    try {
      return await worker.detect(image);
    } finally {
      await worker.terminate();
    }
  };

  return { createWorker, createScheduler, recognize, detect, OEM, PSM, LANGUAGES, languages: LANGUAGES };
}
