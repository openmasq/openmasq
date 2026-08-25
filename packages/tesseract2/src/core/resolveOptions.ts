import { DEFAULT_LIMITS } from './constants';
import { ValidationError } from './errors';
import { isPlainObject, CACHE_METHODS } from './validate';
import type { WorkerOptions, ResolvedWorkerOptions } from './types';
import type { HostPlatform } from '../platform/types';

/*
 * Resolve + validate WorkerOptions into a fully-defaulted object. Platform-agnostic
 * except for two seams: the default cache dir and the semantic validation of
 * langPath / workerUrl / coreUrl (fs-dir vs same-origin URL) are delegated to the
 * HostPlatform. Unknown options throw; the platform's `legacyIgnoredKeys` are warned
 * and dropped (e.g. the removed tesseract.js `workerPath` ACE knob).
 */
export const resolveOptions = (options: WorkerOptions, host: HostPlatform): ResolvedWorkerOptions => {
  if (!isPlainObject(options)) throw new ValidationError('`options` must be a plain object.');

  const opts: ResolvedWorkerOptions = {
    logger: null,
    errorHandler: null,
    logging: false,
    langPath: null,
    dataPath: null,
    cachePath: host.defaultCachePath(),
    cacheMethod: 'write',
    gzip: true,
    legacyCore: false,
    legacyLang: false,
    jobTimeout: 0,
    fetchTimeout: DEFAULT_LIMITS.fetchTimeout,
    maxImageBytes: DEFAULT_LIMITS.maxImageBytes,
    maxLangDataBytes: DEFAULT_LIMITS.maxLangDataBytes,
    allowUnknownFormats: false,
    resourceLimits: undefined,
    integrity: null,
    workerUrl: null,
    coreUrl: null,
  };

  for (const [key, value] of Object.entries(options)) {
    if (host.legacyIgnoredKeys.includes(key)) {
      console.warn(`tesseract2.js: option \`${key}\` is not supported in this environment and is ignored.`);
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(opts, key)) {
      throw new ValidationError(`Unknown option: \`${key}\`.`);
    }
    if (value !== undefined) (opts as Record<string, unknown>)[key] = value;
  }

  if (opts.logger !== null && typeof opts.logger !== 'function') throw new ValidationError('`logger` must be a function.');
  if (opts.errorHandler !== null && typeof opts.errorHandler !== 'function') throw new ValidationError('`errorHandler` must be a function.');
  if (!CACHE_METHODS.has(opts.cacheMethod)) throw new ValidationError(`\`cacheMethod\` must be one of: ${[...CACHE_METHODS].join(', ')}`);
  for (const key of ['jobTimeout', 'fetchTimeout', 'maxImageBytes', 'maxLangDataBytes'] as const) {
    if (!Number.isFinite(opts[key]) || opts[key] < 0) throw new ValidationError(`\`${key}\` must be a non-negative number.`);
  }
  if (typeof opts.cachePath !== 'string' || opts.cachePath.length === 0) {
    throw new ValidationError('`cachePath` must be a non-empty path.');
  }
  if (opts.dataPath !== null && !/^[/A-Za-z0-9._-]{1,128}$/.test(opts.dataPath)) {
    throw new ValidationError('`dataPath` (a path inside the in-memory WASM filesystem) contains unsupported characters.');
  }
  if (opts.integrity !== null) {
    if (!isPlainObject(opts.integrity)) throw new ValidationError('`integrity` must be a plain object mapping lang code → digest.');
    for (const [k, v] of Object.entries(opts.integrity)) {
      if (typeof v !== 'string' || v.length === 0) throw new ValidationError(`\`integrity.${k}\` must be a non-empty "sha256-<base64>" or hex string.`);
    }
  }
  if (opts.langPath !== null && typeof opts.langPath !== 'string') {
    throw new ValidationError('`langPath` must be a string.');
  }

  // Platform-specific semantics: Node checks langPath is an https URL or an existing dir;
  // browser checks langPath/workerUrl/coreUrl are present + SAME-ORIGIN (fail-closed).
  host.validateResolved(opts);
  return opts;
};
