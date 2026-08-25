/*
 * Cross-platform base64 <-> bytes. Node uses `Buffer` (fast, always present under
 * `@types/node`); a browser/worker without `Buffer` falls back to `atob`/`btoa`.
 * Kept in the shared core so `validate.ts` (lang data) and `dump.ts` (image/PDF
 * output) work identically on both platforms.
 */
export const base64ToBytes = (s: string): Uint8Array =>
  (typeof Buffer !== 'undefined'
    ? new Uint8Array(Buffer.from(s, 'base64'))
    : Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));

export const bytesToBase64 = (b: Uint8Array): string => {
  if (typeof Buffer !== 'undefined') return Buffer.from(b).toString('base64');
  let s = '';
  for (let i = 0; i < b.length; i += 1) s += String.fromCharCode(b[i]);
  return btoa(s);
};

/** `true` for a Node Buffer or any Uint8Array — without referencing `Buffer` at runtime
 *  where it doesn't exist. */
export const isBytes = (d: unknown): d is Uint8Array =>
  d instanceof Uint8Array || (typeof Buffer !== 'undefined' && Buffer.isBuffer(d));
