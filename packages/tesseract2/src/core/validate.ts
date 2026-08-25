import { ValidationError } from './errors';
import { OEM, DEFAULT_OUTPUT, TESSJS_RECOGNIZE_OPTIONS, MAX_LANGS, type OEMValue } from './constants';
import { base64ToBytes, isBytes } from './bytes';
import type {
  Langs, NormalizedLang, Rectangle, RecognizeOptions, OutputFormats,
  TesseractParams, ConfigInput, CacheMethod, FSMethod,
} from './types';

/*
 * Language codes end up interpolated into filesystem paths and download URLs,
 * so they are strictly validated (tesseract.js interpolated them raw, which
 * allowed path traversal through the `langs` argument).
 * Covers all official codes: eng, chi_sim, aze_cyrl, srp_latn, osd, equ...
 */
export const LANG_CODE_RE = /^[a-z][a-z0-9]{1,7}(?:_[a-z0-9]{1,12}){0,2}$/;

const PARAM_KEY_RE = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/*
 * WASM-FS methods reachable through `worker.FS(...)`. tesseract.js forwarded
 * any method name to the Emscripten FS object; we allowlist.
 */
export const FS_METHODS: ReadonlySet<string> = new Set<FSMethod>([
  'readFile', 'writeFile', 'unlink', 'mkdir', 'rmdir', 'readdir', 'stat',
]);

export const CACHE_METHODS: ReadonlySet<string> = new Set<CacheMethod>(['write', 'readOnly', 'refresh', 'none']);

export const isPlainObject = (v: unknown): v is Record<string, unknown> => (
  v !== null && typeof v === 'object'
  && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null)
);

export const assertLangCode = (code: unknown): string => {
  if (typeof code !== 'string' || !LANG_CODE_RE.test(code)) {
    throw new ValidationError(`Invalid language code: ${JSON.stringify(String(code).slice(0, 60))}. Expected a short lowercase code such as "eng" or "chi_sim".`);
  }
  return code;
};

/*
 * Normalizes the `langs` argument ("eng", "eng+fra", ["eng", "fra"],
 * [{ code, data }]) into NormalizedLang[] with validated codes and data
 * coerced to Uint8Array.
 */
export const normalizeLangs = (langs: Langs): NormalizedLang[] => {
  const list = typeof langs === 'string' ? langs.split('+').filter(Boolean) : langs;
  if (!Array.isArray(list) || list.length === 0) {
    throw new ValidationError('`langs` must be a non-empty string ("eng+fra") or array.');
  }
  // DoS guard (audit M1): cap the number of languages so a caller-influenced
  // `createWorker('eng+eng+…' × 10000)` can't trigger thousands of concurrent
  // downloads/reads (each allowed up to maxLangDataBytes). Enforced BEFORE the
  // per-entry work, on the raw list length.
  if (list.length > MAX_LANGS) {
    throw new ValidationError(`Too many languages: ${list.length} (max ${MAX_LANGS}).`);
  }
  const seen = new Set<string>();
  const out: NormalizedLang[] = [];
  for (const entry of list) {
    let normalized: NormalizedLang;
    if (typeof entry === 'string') {
      normalized = { code: assertLangCode(entry) };
    } else if (isPlainObject(entry)) {
      const code = assertLangCode(entry.code);
      let data: unknown = entry.data;
      if (typeof data === 'string') data = base64ToBytes(data);
      if (isBytes(data)) {
        normalized = { code, data: new Uint8Array(data) };
      } else if (data instanceof ArrayBuffer) {
        normalized = { code, data: new Uint8Array(data.slice(0)) };
      } else {
        throw new ValidationError(`Custom language "${code}": \`data\` must be a Buffer, Uint8Array, ArrayBuffer or base64 string.`);
      }
    } else {
      throw new ValidationError('Each language must be a string code or a { code, data } object.');
    }
    // Dedupe by code — a repeated code is one language, not N downloads. A later
    // entry that carries explicit `data` upgrades an earlier bare code.
    if (seen.has(normalized.code)) {
      if (normalized.data) {
        const prev = out.find((l) => l.code === normalized.code);
        if (prev && !prev.data) prev.data = normalized.data;
      }
      continue;
    }
    seen.add(normalized.code);
    out.push(normalized);
  }
  return out;
};

export const assertOem: (oem: unknown) => asserts oem is OEMValue = (oem) => {
  if (!Number.isInteger(oem) || !(Object.values(OEM) as unknown[]).includes(oem)) {
    throw new ValidationError(`Invalid OEM value: ${String(oem)}. Use one of the OEM constants (0-3).`);
  }
};

export const assertParams: (params: unknown, label?: string) => asserts params is TesseractParams = (params, label = 'params') => {
  if (!isPlainObject(params)) throw new ValidationError(`\`${label}\` must be a plain object.`);
  for (const [key, value] of Object.entries(params)) {
    if (FORBIDDEN_KEYS.has(key) || !PARAM_KEY_RE.test(key)) {
      throw new ValidationError(`Invalid parameter name: ${JSON.stringify(String(key).slice(0, 80))}`);
    }
    const t = typeof value;
    if (t !== 'string' && t !== 'number' && t !== 'boolean') {
      throw new ValidationError(`Parameter "${key}" must be a string, number or boolean (got ${t}).`);
    }
  }
};

export const assertOutput: (output: unknown) => asserts output is OutputFormats = (output) => {
  if (!isPlainObject(output)) throw new ValidationError('`output` must be a plain object.');
  for (const [key, value] of Object.entries(output)) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_OUTPUT, key)) {
      throw new ValidationError(`Unknown output format: "${key}". Valid formats: ${Object.keys(DEFAULT_OUTPUT).join(', ')}`);
    }
    if (typeof value !== 'boolean') {
      throw new ValidationError(`Output flag "${key}" must be a boolean.`);
    }
  }
};

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const isValidRectangle = (rect: unknown): rect is Rectangle => (
  isPlainObject(rect)
  && (['left', 'top', 'width', 'height'] as const)
    .every((k) => isFiniteNumber(rect[k]) && (rect[k] as number) >= 0)
);

export const assertRecognizeOptions: (opts: unknown) => asserts opts is RecognizeOptions = (opts) => {
  if (!isPlainObject(opts)) throw new ValidationError('`options` must be a plain object.');

  // NULL-prototype (audit L1): a `{}` literal has `__proto__` as an ACCESSOR, so
  // `passthrough['__proto__'] = value` is a silent no-op and an own `__proto__` key from
  // JSON.parse would slip past `assertParams`. A null-proto object makes it a real own key
  // that FORBIDDEN_KEYS then rejects.
  const passthrough: Record<string, unknown> = Object.create(null);
  for (const [key, value] of Object.entries(opts)) {
    if (!(TESSJS_RECOGNIZE_OPTIONS as readonly string[]).includes(key) && !key.startsWith('tessjs_')) {
      passthrough[key] = value;
    }
  }
  assertParams(passthrough, 'options');

  if (opts.rectangle !== undefined && !isValidRectangle(opts.rectangle)) {
    throw new ValidationError('`rectangle` must be { left, top, width, height } with non-negative finite numbers.');
  }
  if (opts.rotateAuto !== undefined && typeof opts.rotateAuto !== 'boolean') {
    throw new ValidationError('`rotateAuto` must be a boolean.');
  }
  if (opts.rotateRadians !== undefined && !isFiniteNumber(opts.rotateRadians)) {
    throw new ValidationError('`rotateRadians` must be a finite number.');
  }
  if (opts.pdfTitle !== undefined && (typeof opts.pdfTitle !== 'string' || opts.pdfTitle.length > 1024)) {
    throw new ValidationError('`pdfTitle` must be a string of at most 1024 characters.');
  }
  if (opts.pdfTextOnly !== undefined && typeof opts.pdfTextOnly !== 'boolean') {
    throw new ValidationError('`pdfTextOnly` must be a boolean.');
  }
};

export const assertConfig: (config: unknown) => asserts config is ConfigInput = (config) => {
  if (config === undefined || config === null) return;
  if (typeof config === 'string') {
    if (config.length > 64 * 1024) throw new ValidationError('`config` text is too large (max 64KB).');
    return;
  }
  assertParams(config, 'config');
};

export const isHttpsUrl = (s: string): boolean => {
  try {
    return new URL(s).protocol === 'https:';
  } catch {
    return false;
  }
};

export const looksLikeUrl = (s: string): boolean => /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s);
