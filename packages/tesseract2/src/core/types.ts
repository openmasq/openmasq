import type { OEMValue } from './constants';

/* ------------------------------------------------------------------ */
/* Public API types                                                    */
/* ------------------------------------------------------------------ */

// A Node `Buffer` IS a `Uint8Array`, so it satisfies these unions without the core
// having to reference the Node-only `Buffer` type (keeps the shared core platform-free).
export type ImageLike = string | Uint8Array | ArrayBuffer;

export interface CustomLang {
  code: string;
  /** Raw (optionally gzipped) traineddata, or a base64 string. */
  data: Uint8Array | ArrayBuffer | string;
}

export type Langs = string | Array<string | CustomLang>;

/** Internal normalized form of `Langs`. */
export interface NormalizedLang {
  code: string;
  data?: Uint8Array;
}

export interface LoggerMessage {
  status: string;
  progress: number;
  userJobId?: string;
}

export type CacheMethod = 'write' | 'readOnly' | 'refresh' | 'none';

export type TesseractParams = Record<string, string | number | boolean>;
export type ConfigInput = string | TesseractParams | undefined | null;

export interface WorkerOptions {
  logger?: (msg: LoggerMessage) => void;
  errorHandler?: (err: Error) => void;
  logging?: boolean;
  /** https URL or existing local directory holding `<lang>.traineddata[.gz]` (Node); a
   *  same-origin directory URL in the browser build. */
  langPath?: string;
  /** Directory inside the in-memory WASM filesystem. */
  dataPath?: string;
  /** On-disk cache directory. Default: `$XDG_CACHE_HOME/tesseract2.js` or `~/.cache/tesseract2.js`.
   *  Ignored in the browser build (no on-disk cache). */
  cachePath?: string;
  cacheMethod?: CacheMethod;
  gzip?: boolean;
  legacyCore?: boolean;
  legacyLang?: boolean;
  /** Per-job timeout in ms (0 = none). Applies to recognize/detect/FS jobs. */
  jobTimeout?: number;
  /** Timeout in ms for each network fetch (images, traineddata). */
  fetchTimeout?: number;
  /** Reject images larger than this many bytes. Default 128 MiB. */
  maxImageBytes?: number;
  /** Reject language data larger than this many bytes (also caps gunzip output). Default 512 MiB. */
  maxLangDataBytes?: number;
  /** Skip magic-byte validation of image inputs. */
  allowUnknownFormats?: boolean;
  /** Optional per-language SHA-256 integrity pin, verified before the traineddata reaches
   *  the WASM parser. Keyed by lang code; value is `"sha256-<base64>"` or a bare hex digest. */
  integrity?: Record<string, string>;
  /** BROWSER BUILD ONLY — a **same-origin** URL to the worker script and the core-WASM
   *  directory. Validated same-origin (fail-closed); ignored by the Node build (which loads
   *  both from the installed package). */
  workerUrl?: string;
  coreUrl?: string;
  /** Passed through to worker_threads.Worker (Node build only). */
  resourceLimits?: {
    maxOldGenerationSizeMb?: number;
    maxYoungGenerationSizeMb?: number;
    codeRangeSizeMb?: number;
    stackSizeMb?: number;
  };
}

export type ResolvedWorkerOptions = Required<Omit<WorkerOptions, 'logger' | 'errorHandler' | 'langPath' | 'dataPath' | 'resourceLimits' | 'integrity' | 'workerUrl' | 'coreUrl'>> & {
  logger: ((msg: LoggerMessage) => void) | null;
  errorHandler: ((err: Error) => void) | null;
  langPath: string | null;
  dataPath: string | null;
  resourceLimits: WorkerOptions['resourceLimits'];
  integrity: Record<string, string> | null;
  workerUrl: string | null;
  coreUrl: string | null;
};

export interface Rectangle {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface RecognizeOptions {
  rectangle?: Rectangle;
  pdfTitle?: string;
  pdfTextOnly?: boolean;
  rotateAuto?: boolean;
  rotateRadians?: number;
  /** Any other key is passed to Tesseract as a variable. */
  [tesseractParam: string]: unknown;
}

export interface OutputFormats {
  text?: boolean;
  blocks?: boolean;
  layoutBlocks?: boolean;
  hocr?: boolean;
  tsv?: boolean;
  box?: boolean;
  unlv?: boolean;
  osd?: boolean;
  pdf?: boolean;
  imageColor?: boolean;
  imageGrey?: boolean;
  imageBinary?: boolean;
  debug?: boolean;
}

export interface Block {
  [key: string]: unknown;
}

export interface RecognizeData {
  text: string | null;
  hocr: string | null;
  tsv: string | null;
  box: string | null;
  unlv: string | null;
  osd: string | null;
  pdf: Uint8Array | null;
  imageColor: string | null;
  imageGrey: string | null;
  imageBinary: string | null;
  confidence: number | null;
  blocks: Block[] | null;
  layoutBlocks: Block[] | null;
  psm: string;
  oem: string;
  version: string;
  debug: string | null;
  rotateRadians: number;
}

export interface DetectData {
  tesseract_script_id: number | null;
  script: string | null;
  script_confidence: number | null;
  orientation_degrees: number | null;
  orientation_confidence: number | null;
}

export interface JobResult<T = unknown> {
  jobId: string;
  data: T;
}

export type FSMethod = 'readFile' | 'writeFile' | 'unlink' | 'mkdir' | 'rmdir' | 'readdir' | 'stat';

export interface TesseractWorker {
  id: string;
  /** The underlying platform worker (a `worker_threads.Worker` in Node, a `Worker` in the
   *  browser). Typed loosely so the shared surface stays platform-agnostic. */
  worker: unknown;
  /** @deprecated workers come pre-loaded */
  load(): void;
  writeText(path: string, text: string): Promise<JobResult>;
  readText(path: string): Promise<JobResult<string>>;
  removeFile(path: string): Promise<JobResult>;
  FS(method: FSMethod, args?: unknown[]): Promise<JobResult>;
  setParameters(params: TesseractParams): Promise<JobResult<TesseractParams>>;
  reinitialize(langs?: Langs, oem?: OEMValue, config?: ConfigInput): Promise<JobResult>;
  recognize(image: ImageLike, options?: RecognizeOptions, output?: OutputFormats): Promise<JobResult<RecognizeData>>;
  detect(image: ImageLike): Promise<JobResult<DetectData>>;
  terminate(): Promise<void>;
}

export interface Scheduler {
  id: string;
  addWorker(worker: TesseractWorker): string;
  addJob(action: 'recognize', image: ImageLike, options?: RecognizeOptions, output?: OutputFormats): Promise<JobResult<RecognizeData>>;
  addJob(action: 'detect', image: ImageLike): Promise<JobResult<DetectData>>;
  addJob(action: SchedulableAction, ...args: unknown[]): Promise<unknown>;
  terminate(): Promise<void>;
  getQueueLen(): number;
  getNumWorkers(): number;
}

export type SchedulableAction =
  | 'recognize' | 'detect' | 'setParameters' | 'reinitialize'
  | 'writeText' | 'readText' | 'removeFile' | 'FS';

/* ------------------------------------------------------------------ */
/* Internal main-thread <-> worker-thread protocol                     */
/* ------------------------------------------------------------------ */

export type WorkerAction =
  | 'load' | 'loadLanguage' | 'initialize' | 'setParameters'
  | 'recognize' | 'detect' | 'FS' | 'terminate';

export interface LoadPayload {
  lstmOnly: boolean;
  logging: boolean;
  /** BROWSER: the same-origin core-WASM directory URL (Node ignores it). */
  coreUrl?: string | null;
}

export interface LoadLanguagePayload {
  langs: NormalizedLang[];
  langPath: string | null;
  dataPath: string | null;
  cachePath: string;
  cacheMethod: CacheMethod;
  gzip: boolean;
  lstmOnly: boolean;
  fetchTimeout: number;
  maxLangDataBytes: number;
  integrity?: Record<string, string>;
}

export interface InitializePayload {
  langs: string;
  oem: number;
  config: ConfigInput;
}

export interface RecognizePayload {
  image: Uint8Array;
  options: RecognizeOptions;
  output: OutputFormats;
}

export interface DetectPayload {
  image: Uint8Array;
}

export interface FSPayload {
  method: string;
  args: unknown[];
}

export interface JobPacket {
  id: string;
  action: WorkerAction;
  payload: unknown;
}

export interface SerializedError {
  message: string;
  code: string;
}

export type ResponseStatus = 'resolve' | 'reject' | 'progress';

export interface ResponseMessage {
  id: string;
  status: ResponseStatus;
  data: unknown;
}
