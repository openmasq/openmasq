import { ValidationError } from './errors';
import { assertLangCode, looksLikeUrl } from './validate';
import { fetchToLimit } from './httpFetch';
import { LANG_LOAD_CONCURRENCY } from './constants';
import type { TessModule } from './tess';
import type { LoadLanguagePayload, NormalizedLang } from './types';
import type { WorkerPlatform } from '../platform/types';

export interface ProgressReporter {
  progress(data: { status: string; progress: number }): void;
}

const isGzipped = (data: Uint8Array): boolean => data.length > 2 && data[0] === 0x1f && data[1] === 0x8b;

/*
 * Official traineddata mirror (same as tesseract.js). `lang` is validated before being
 * interpolated. ⚠️ This CDN is a LAST-RESORT default, reached ONLY when a caller supplies
 * NO `langPath` at all (see the resolution ladder in `loadLanguage`): the app's real
 * consumers never hit it — the browser extension AND the desktop always pass a bundled /
 * same-origin `langPath` (and the browser build sets `localLangOnly`, so even a URL
 * langPath reads from the bundle, never here). It is only the dev/opt-in path for a bare
 * `createWorker()` with no assets configured. Even then, an `integrity[lang]` pin
 * fail-closes the fetched bytes (see `verifyIntegrity`), so a CDN swap can't run tampered
 * traineddata in the WASM parser — but a real consumer must NEVER rely on this and must
 * always ship its own pinned, first-party traineddata (CLAUDE.md hard rule 7).
 */
const defaultCdnBase = (lang: string, lstmOnly: boolean): string => (
  `https://cdn.jsdelivr.net/npm/@tesseract.js-data/${lang}/${lstmOnly ? '4.0.0_best_int' : '4.0.0'}`
);

// https-only, redirect-scheme-re-validated per hop (audit M2), streamed with an
// incremental byte cap (audit M3), fetchTimeout 0 = no timeout (audit L2). Isomorphic
// (native fetch + streams), so it stays in the shared core.
const fetchLangData = (url: string, opts: LoadLanguagePayload): Promise<Uint8Array> =>
  fetchToLimit(url, { maxBytes: opts.maxLangDataBytes, timeoutMs: opts.fetchTimeout, requireHttps: true });

/*
 * Optional integrity pin (audit L5): when the caller supplies `integrity[lang] =
 * "sha256-<base64>"` (or a bare hex digest), the resolved traineddata bytes must match
 * before they reach the Tesseract C++ parser — closing the "malicious traineddata drives
 * the WASM parser" gap for both downloads AND the shared on-disk cache. The digest is
 * computed via the platform (Node crypto / browser SubtleCrypto).
 */
export const verifyIntegrity = async (data: Uint8Array, expected: string, lang: string, platform: WorkerPlatform): Promise<void> => {
  const { hex, b64 } = await platform.sha256(data);
  const want = expected.trim();
  const ok = want.toLowerCase() === hex || want === `sha256-${b64}`;
  if (!ok) {
    throw new ValidationError(`Integrity check failed for "${lang}" traineddata (expected ${want}, got sha256-${b64}).`);
  }
};

export const clearCache = async (langCodes: string[], cachePath: string, platform: WorkerPlatform): Promise<void> => {
  if (!platform.cache) return;
  langCodes.forEach(assertLangCode);
  await platform.cache.clear(cachePath, langCodes);
};

/*
 * Loads one language into the WASM filesystem.
 * Returns true if the data came from the on-disk cache.
 */
const loadOne = async (
  TessModule: TessModule,
  lang: NormalizedLang,
  opts: LoadLanguagePayload,
  onStep: () => void,
  platform: WorkerPlatform,
): Promise<boolean> => {
  const {
    langPath, dataPath, cachePath, cacheMethod, gzip, lstmOnly, maxLangDataBytes,
  } = opts;
  assertLangCode(lang.code);

  let data: Uint8Array | null = null;
  let fromCache = false;

  if (lang.data) {
    // Explicit data always wins (tesseract.js let a stale cache shadow it).
    data = lang.data;
  } else {
    if (platform.cache && !['refresh', 'none'].includes(cacheMethod)) {
      data = await platform.cache.read(cachePath, lang.code);
      fromCache = data !== null;
    }
    if (data === null) {
      const fileName = `${lang.code}.traineddata${gzip ? '.gz' : ''}`;
      if (langPath && !looksLikeUrl(langPath)) {
        // Local directory (Node) — never a URL here.
        data = await platform.readLocalLangData(langPath, fileName, maxLangDataBytes);
      } else if (langPath && (platform.localLangOnly || !/^https?:/i.test(langPath))) {
        // A same-origin bundled dir URL — the browser build ALWAYS reads traineddata from the
        // bundle (`localLangOnly`), incl. an http(s) same-origin dev/localhost URL; and a
        // non-http(s) URL (chrome-extension://) goes here on any platform (fetchLangData only
        // handles http(s)). Never the jsdelivr CDN.
        data = await platform.readLocalLangData(langPath.replace(/\/+$/, ''), fileName, maxLangDataBytes);
      } else {
        const base = (langPath ?? defaultCdnBase(lang.code, lstmOnly)).replace(/\/+$/, '');
        data = await fetchLangData(`${base}/${fileName}`, opts);
      }
    }
  }

  onStep();

  if (isGzipped(data)) {
    // platform.gunzip caps decompression => no gzip bombs.
    data = await platform.gunzip(data, maxLangDataBytes);
  }
  if (data.byteLength === 0) throw new ValidationError(`Language data for "${lang.code}" is empty.`);
  if (data.byteLength > maxLangDataBytes) {
    throw new ValidationError(`Language data for "${lang.code}" exceeds maxLangDataBytes.`);
  }

  // Integrity pin (audit L5) — verified on the FINAL (post-gunzip) bytes, whatever their
  // source (explicit data / cache / local dir / CDN), before they reach the WASM parser.
  const expected = opts.integrity?.[lang.code];
  if (expected) await verifyIntegrity(data, expected, lang.code, platform);

  if (dataPath) {
    try {
      TessModule.FS.mkdir(dataPath);
    } catch {
      // already exists
    }
  }
  TessModule.FS.writeFile(`${dataPath ?? '.'}/${lang.code}.traineddata`, data);

  if (platform.cache && !fromCache && ['write', 'refresh'].includes(cacheMethod)) {
    try {
      await platform.cache.write(cachePath, lang.code, data);
    } catch (err) {
      // Cache is best-effort; OCR still works from memory.
      console.warn(`tesseract2.js: could not cache ${lang.code}.traineddata: ${(err as Error).message}`);
    }
  }

  onStep();
  return fromCache;
};

/*
 * Loads every requested language. Returns true if at least one came from
 * cache (used by `initialize` to decide whether a retry with fresh data
 * makes sense).
 */
export const loadAll = async (
  TessModule: TessModule,
  payload: LoadLanguagePayload,
  res: ProgressReporter | null,
  platform: WorkerPlatform,
): Promise<boolean> => {
  const { langs } = payload;
  const statusText = 'loading language traineddata';
  const totalSteps = langs.length * 2;
  let steps = 0;
  const onStep = (): void => {
    steps += 1;
    if (res) res.progress({ status: statusText, progress: steps >= totalSteps ? 1 : steps / totalSteps });
  };

  if (res) res.progress({ status: statusText, progress: 0 });
  // Bounded concurrency (audit M1): even with the language count capped, don't fire every
  // download/read at once — process a small pool at a time so N languages ≤ N concurrent
  // network/FS ops. Fail fast: the first rejection stops scheduling more.
  const results: boolean[] = new Array(langs.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= langs.length) return;
      results[i] = await loadOne(TessModule, langs[i], payload, onStep, platform);
    }
  };
  const pool = Math.min(LANG_LOAD_CONCURRENCY, langs.length);
  await Promise.all(Array.from({ length: pool }, () => worker()));
  return results.some(Boolean);
};
