// Pre-parse SAFETY guard for uploaded files — pure, first-party, zero deps.
//
// The extraction core dispatches a file to a heavy parser (pdf.js, mammoth,
// SheetJS, tesseract) BY EXTENSION. Before that, this module answers one
// question about the RAW BYTES: "is it safe to even hand this to a parser?".
// It is a cheap gate in front of expensive, CVE-exposed code, defending the
// three things extension-by-name can't:
//
//   1. Size   — a huge file OOMs the tab / offscreen doc before a parser runs.
//   2. Type   — magic bytes must not CONTRADICT the extension. A `.pdf` that is
//               really a ZIP (`PK…`) is either a mis-dispatch or an attempt to
//               feed the wrong parser a hostile container → reject.
//   3. Bombs  — a small file that DECOMPRESSES to gigabytes: a zip bomb (Office
//               formats are ZIPs) or an image "pixel flood" (tiny header, giant
//               canvas). We read the DECLARED sizes/dimensions from the header
//               and refuse before the decompress/decode allocates the memory.
//
// Policy is CONSERVATIVE: reject only on a POSITIVE danger signal (a clear type
// contradiction, a header that declares an absurd size). Anything merely
// unrecognised is allowed through — the parser is the one that ultimately
// validates the bytes, and false rejections would break odd-but-valid files.
// All messages are user-facing FR (the codebase's convention), path-free.

/** Hard ceiling on any single upload. Bytes past this never reach a parser. */
import { IMAGE_FAMILIES, sniff, type SniffFamily, type Sniffed, u16le, u32le } from "./sniff";

// Re-exported: the guard stays the one door to sniffing (split out for the LOC cap).
export { sniff, type SniffFamily, type Sniffed };

export const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MiB
/** A decoded image this many pixels would allocate ~4 bytes each (RGBA). */
export const MAX_IMAGE_PIXELS = 40_000_000; // ~40 MP → ~160 MB decoded
/** Same ceiling, reached from the other direction: a PDF page RASTERISED for OCR.
 *  Nothing declares the size there — it is computed from the page's own MediaBox times
 *  a fixed scale, i.e. from geometry the file chooses. A 28 800×28 800 pt page (the PDF
 *  format's own maximum) at scale 2 asks for 3.3 GP, ~13 GB of canvas, and the process
 *  dies before OCR reads a character. {@link rasterScale} is how a caller stays under it. */
export const MAX_RASTER_PIXELS = 40_000_000; // ~40 MP → ~160 MB of canvas
/** Total UNCOMPRESSED size a ZIP (docx/pptx/xlsx/ods) may declare. */
export const MAX_ZIP_TOTAL_BYTES = 300 * 1024 * 1024; // 300 MiB
/** Overall compression ratio (uncompressed / compressed) above which a ZIP is a bomb. */
export const MAX_ZIP_RATIO = 250;
/** Entry-count cap — a "flat" bomb hides size behind millions of tiny members. */
export const MAX_ZIP_ENTRIES = 10_000;
/** Page cap for PDF TEXT extraction (OCR is capped separately, lower). */
export const MAX_PDF_PAGES = 500;

/**
 * The scale to rasterise a page at: `desired`, or as much less as it takes for
 * `width × height × scale²` to stay under {@link MAX_RASTER_PIXELS}. `null` when even
 * scale 1 is over the ceiling — the page cannot be rasterised at all, and the caller
 * SKIPS it with its truncation marker rather than allocating.
 *
 * `width`/`height` are the page's size at scale 1 (`getViewport({ scale: 1 })`).
 * Degrading the scale rather than refusing the document is deliberate: a genuinely huge
 * page (a plan, a poster) is a real thing a user drops, and OCR at a lower resolution is
 * worth more than an error — while an absurd one still costs nothing.
 */
export function rasterScale(width: number, height: number, desired: number): number | null {
  const base = width * height;
  if (!Number.isFinite(base) || base <= 0) return null; // an unreadable page size
  if (base > MAX_RASTER_PIXELS) return null; // over the ceiling at 1:1 — nothing to clamp to
  return Math.min(desired, Math.sqrt(MAX_RASTER_PIXELS / base));
}

/** Which sniffed families are ACCEPTABLE for a given (lower-case, dotted) ext.
 *  `unknown` is always accepted — only a positive contradiction is a reject. */
function allowedFamilies(ext: string): ReadonlySet<SniffFamily> | null {
  switch (ext) {
    case ".pdf":
      return new Set(["pdf"]);
    case ".docx":
    case ".pptx":
    case ".xlsx":
    case ".xlsm":
    case ".ods":
      return new Set(["zip"]);
    case ".xls": // legacy OLE, but SheetJS also reads the ZIP variants
      return new Set(["ole", "zip"]);
    case ".png":
    case ".jpg":
    case ".jpeg":
    case ".webp":
    case ".bmp":
    case ".tiff":
    case ".tif":
    case ".gif":
      return IMAGE_FAMILIES; // images are widely mislabelled between each other
    default:
      return null; // text / unknown ext → no magic-byte constraint
  }
}

/**
 * Inspect a ZIP's END-OF-CENTRAL-DIRECTORY + central directory to sum the
 * DECLARED uncompressed sizes WITHOUT decompressing. A classic zip bomb (Office
 * files are ZIPs) advertises its true, absurd expanded size here. Returns a
 * reject reason, or null when the ZIP looks benign OR can't be read (a malformed
 * archive isn't necessarily a bomb — the real parser will reject it safely).
 *
 * Exported (and re-exported from the package barrel) because the upload path is not the
 * only door onto an inflater: the renderer's OOXML VIEWER opens a docx/pptx zip of its
 * own, from bytes it read back out of the store. That path never went through
 * {@link guardUpload}, so the check has to be reachable there — one implementation, both
 * doors (rule 9: import it, never re-derive it).
 */
export function checkZipBomb(b: Uint8Array): string | null {
  // Find the End Of Central Directory record (sig 0x06054b50), scanning back
  // from the tail (it sits within the last 64KiB + 22-byte fixed record).
  const min = Math.max(0, b.length - (0xffff + 22));
  let eocd = -1;
  for (let i = b.length - 22; i >= min; i--) {
    if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 0x05 && b[i + 3] === 0x06) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null; // not a well-formed ZIP → let the parser deal with it
  const entries = u16le(b, eocd + 10);
  if (entries > MAX_ZIP_ENTRIES) return `Fichier compressé suspect (${entries} entrées) — refusé.`;
  let cd = u32le(b, eocd + 16); // central-directory offset
  let totalUncompressed = 0;
  let totalCompressed = 0;
  for (let n = 0; n < entries; n++) {
    if (
      cd + 46 > b.length ||
      !(b[cd] === 0x50 && b[cd + 1] === 0x4b && b[cd + 2] === 0x01 && b[cd + 3] === 0x02)
    )
      break; // truncated/odd → stop, don't reject
    const comp = u32le(b, cd + 20);
    const uncomp = u32le(b, cd + 24);
    totalCompressed += comp;
    totalUncompressed += uncomp;
    if (totalUncompressed > MAX_ZIP_TOTAL_BYTES) {
      return `Fichier compressé trop volumineux une fois décompressé — refusé (protection anti-bombe).`;
    }
    const nameLen = u16le(b, cd + 28);
    const extraLen = u16le(b, cd + 30);
    const commentLen = u16le(b, cd + 32);
    cd += 46 + nameLen + extraLen + commentLen;
  }
  if (
    totalCompressed > 0 &&
    totalUncompressed / totalCompressed > MAX_ZIP_RATIO &&
    totalUncompressed > 10 * 1024 * 1024
  ) {
    return `Ratio de compression anormal — fichier refusé (protection anti-bombe).`;
  }
  return null;
}

/**
 * The gate. Returns a user-facing FR reason to REJECT, or null to allow.
 * `ext` is the lower-cased extension WITH its dot (as `extOf` produces), already
 * resolved from the name or MIME by the caller.
 */
export function guardUpload(bytes: Uint8Array, ext: string): string | null {
  if (bytes.length > MAX_FILE_BYTES) {
    const mb = Math.round(MAX_FILE_BYTES / (1024 * 1024));
    return `Fichier trop volumineux (max ${mb} Mo).`;
  }

  const allowed = allowedFamilies(ext);
  if (allowed === null) return null; // text/unknown ext — nothing binary to check

  const s = sniff(bytes);
  // An executable posing as a document is always hostile.
  if (s.family === "exe") return `Type de fichier non autorisé (contenu exécutable).`;
  // A positive, incompatible type contradiction (e.g. a ".pdf" that is a ZIP).
  if (s.family !== "unknown" && !allowed.has(s.family)) {
    return `Le contenu du fichier ne correspond pas à son extension — refusé.`;
  }
  // Image "pixel flood": tiny header, enormous declared canvas.
  if (
    IMAGE_FAMILIES.has(s.family) &&
    s.width &&
    s.height &&
    s.width * s.height > MAX_IMAGE_PIXELS
  ) {
    return `Image aux dimensions excessives (${s.width}×${s.height}) — refusée.`;
  }
  // FAIL CLOSED for the two families whose size is not a fixed field: a TIFF whose first
  // IFD we cannot read, or a WebP whose chunk we do not recognise, is an image whose
  // canvas we have not measured — and both route to OCR, i.e. to a full decode. The
  // conservative "unrecognised passes" policy above is about a file's TYPE; once the type
  // says image, an unreadable SIZE is a positive danger signal, not an absence of one.
  if ((s.family === "tiff" || s.family === "webp") && !(s.width && s.height)) {
    return `Image illisible (dimensions introuvables) — refusée.`;
  }
  // ZIP-container bomb (Office formats).
  if (s.family === "zip") {
    const bomb = checkZipBomb(bytes);
    if (bomb) return bomb;
  }
  return null;
}
