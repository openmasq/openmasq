/** Uint8Array → standard base64 (chunked so a big file doesn't blow
 *  `String.fromCharCode`'s argument limit / the call stack). Shared by the store (a
 *  document's original bytes for the Gmail send tool), the library re-attach path, and
 *  the image-thumbnail data-URL builder — was cloned byte-for-byte in all three. */
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

/** Standard base64 → Uint8Array — e.g. a `run_python` figure (PNG) we store locally. */
export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
