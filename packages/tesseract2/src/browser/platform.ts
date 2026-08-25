import { ValidationError, NetworkError } from '../core/errors';
import { coreVariants } from '../core/simd';
import { assertSameOrigin } from './sameOrigin';
import type { CoreFactory } from '../core/tess';
import type { WorkerPlatform, LoadCoreOptions, Sha256Digest } from '../platform/types';

let cachedFactory: CoreFactory | null = null;

/*
 * Load the tesseract.js-core Emscripten factory by importScripts-ing a SAME-ORIGIN core
 * script — never a network fetch of the core (preserves audit H6: no CDN core exec). The
 * bundled variants define a global `TesseractCore`; we wrap it to `locateFile` the sibling
 * `.wasm` at the same same-origin directory. Tries fastest-supported variant first, falling
 * back to any the bundle actually ships (a 404 makes importScripts throw → try the next).
 */
const loadCore = async ({ lstmOnly, coreUrl }: LoadCoreOptions): Promise<CoreFactory> => {
  if (cachedFactory) return cachedFactory;
  if (!coreUrl) throw new ValidationError('`coreUrl` (a same-origin core-WASM directory URL) is required in the browser build.');
  const dir = assertSameOrigin(coreUrl, '`coreUrl`').replace(/\/+$/, '');

  const names = coreVariants(lstmOnly);
  let loaded: string | null = null;
  for (const name of names) {
    try {
      importScripts(`${dir}/${name}.wasm.js`);
      loaded = name;
      break;
    } catch {
      // not shipped in this bundle (404) or failed to eval — try the next variant
    }
  }
  if (loaded === null) {
    throw new Error(`tesseract.js-core: no usable core build found under ${dir} (tried: ${names.join(', ')}).`);
  }
  const globalFactory = (globalThis as { TesseractCore?: CoreFactory }).TesseractCore;
  if (typeof globalFactory !== 'function') {
    throw new Error('tesseract.js-core loaded but did not define the expected `TesseractCore` global factory.');
  }
  const factory: CoreFactory = (mod) => globalFactory(
    { ...mod, locateFile: (p: string) => `${dir}/${p}` } as unknown as Parameters<CoreFactory>[0],
  );
  cachedFactory = factory;
  return factory;
};

/** Gunzip via the platform `DecompressionStream`, capped incrementally (gzip-bomb guard). */
const gunzip = async (data: Uint8Array, maxBytes: number): Promise<Uint8Array> => {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new ValidationError(`Decompressed language data exceeds the byte cap (> ${maxBytes} bytes) — aborted mid-stream.`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock?.();
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.byteLength; }
  return out;
};

const sha256 = async (data: Uint8Array): Promise<Sha256Digest> => {
  const buf = await crypto.subtle.digest('SHA-256', data as BufferSource);
  const bytes = new Uint8Array(buf);
  let hex = '';
  let bin = '';
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, '0');
    bin += String.fromCharCode(b);
  }
  return { hex, b64: btoa(bin) };
};

/*
 * Read `<base>/<fileName>` from the SAME-ORIGIN bundled language directory. Re-validates
 * same-origin in the worker too (defense in depth — the extension CSP `connect-src 'self'`
 * also blocks cross-origin), and caps the read incrementally.
 */
const readLocalLangData = async (base: string, fileName: string, maxBytes: number): Promise<Uint8Array> => {
  const url = assertSameOrigin(`${base.replace(/\/+$/, '')}/${fileName}`, 'language data URL');
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new NetworkError(`Failed to fetch ${url}: ${(err as Error).message}`);
  }
  if (!res.ok) throw new NetworkError(`Failed to fetch ${url}: HTTP ${res.status}`);
  const body = res.body;
  if (!body) {
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > maxBytes) throw new ValidationError(`${url} exceeds the byte cap (${buf.byteLength} > ${maxBytes}).`);
    return buf;
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new ValidationError(`${url} exceeds the byte cap (> ${maxBytes} bytes) — aborted mid-stream.`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock?.();
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.byteLength; }
  return out;
};

export const browserWorkerPlatform: WorkerPlatform = {
  loadCore,
  gunzip,
  sha256,
  cache: null, // no on-disk cache in the browser — language data comes from the bundle
  readLocalLangData,
  localLangOnly: true, // traineddata is ALWAYS the same-origin bundle, never the jsdelivr CDN
};
