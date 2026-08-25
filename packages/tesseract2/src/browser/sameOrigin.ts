import { ValidationError } from '../core/errors';

/*
 * The browser build's trust anchor. tesseract2 deliberately removed the tesseract.js
 * `workerPath`/`corePath` ACE knobs (arbitrary remote script exec); the browser analog
 * is: the worker, core-WASM and language assets MUST be same-origin as the executing
 * context — i.e. `chrome-extension://<our signed id>/…` for the extension. A cross-origin
 * (CDN / attacker) URL is REJECTED (fail-closed). Works on both the main thread
 * (`window.location`) and inside the worker (`self.location`) via `globalThis.location`.
 */
export const assertSameOrigin = (raw: string, kind: string): string => {
  const here = globalThis.location;
  let u: URL;
  try {
    u = new URL(raw, here.href);
  } catch {
    throw new ValidationError(`${kind} is not a valid URL: ${String(raw).slice(0, 120)}`);
  }
  if (u.origin !== here.origin) {
    throw new ValidationError(
      `${kind} must be SAME-ORIGIN (${here.origin}); refusing cross-origin "${u.origin}". `
      + 'The worker, core WASM and language data must be served from the signed extension bundle, never a CDN.',
    );
  }
  return u.href;
};
