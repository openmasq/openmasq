// Embedded media (docx `<w:drawing>`, pptx `<p:pic>`) → a `data:` URI for an `<img>`.
// Bytes only ever become an inline data URI — never a remote URL (the app CSP blocks
// remote loads anyway, so an external `src` is a silently broken image, not a feature).

/**
 * The image types a viewer may render, keyed by their MAGIC BYTES.
 *
 * Sniffed from the CONTENT, never from the part's extension: the filename lives
 * inside the untrusted zip, so `evil.png` proves nothing about what the bytes are.
 * The extension picks the label; the content picks the type — that inversion is the
 * point.
 *
 * An ALLOW-list (rule 7): an unrecognised header yields no image at all, rather than
 * a guessed mime. In particular there is NO `image/svg+xml` entry — matching the docx
 * HTML sanitiser, which refuses `data:image/svg+xml` even on `src` (audit L14). SVG is
 * a document format with its own script/fetch surface, not a raster; `<img>` neuters
 * most of it, but "most" is not the bar for a file we did not write. (The previous
 * regex-level pptx parser mapped `.svg` → `image/svg+xml` from the extension —
 * stricter now, and the same policy on both formats.)
 */
const MAGIC: { mime: string; sig: readonly (number | null)[] }[] = [
  { mime: "image/png", sig: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: "image/jpeg", sig: [0xff, 0xd8, 0xff] },
  { mime: "image/gif", sig: [0x47, 0x49, 0x46, 0x38] },
  // RIFF....WEBP — bytes 4-7 are the chunk length, so they are wildcards.
  { mime: "image/webp", sig: [0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x45, 0x42, 0x50] },
  { mime: "image/bmp", sig: [0x42, 0x4d] },
];

/** The image mime of `bytes` by magic number, or undefined when it is not one of the
 *  raster types we render. */
export function sniffImageMime(bytes: Uint8Array): string | undefined {
  for (const { mime, sig } of MAGIC) {
    if (bytes.length < sig.length) continue;
    let ok = true;
    for (let i = 0; i < sig.length; i++) {
      if (sig[i] !== null && bytes[i] !== sig[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return mime;
  }
  return undefined;
}

/** Base64 in fixed chunks: `String.fromCharCode(...bytes)` on a whole image blows the
 *  argument limit and throws on anything above ~100kB. */
function base64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}

/**
 * `bytes` → a `data:` URI, or undefined when the content is not an allow-listed
 * raster (or will not encode). A caller drops the image on undefined rather than
 * emitting a broken/unknown `src`.
 */
export function imageDataUri(bytes: Uint8Array | undefined): string | undefined {
  if (!bytes?.length) return undefined;
  const mime = sniffImageMime(bytes);
  if (!mime) return undefined;
  try {
    return `data:${mime};base64,${base64(bytes)}`;
  } catch {
    return undefined;
  }
}
