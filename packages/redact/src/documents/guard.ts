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
export const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MiB
/** A decoded image this many pixels would allocate ~4 bytes each (RGBA). */
export const MAX_IMAGE_PIXELS = 40_000_000; // ~40 MP → ~160 MB decoded
/** Total UNCOMPRESSED size a ZIP (docx/pptx/xlsx/ods) may declare. */
export const MAX_ZIP_TOTAL_BYTES = 300 * 1024 * 1024; // 300 MiB
/** Overall compression ratio (uncompressed / compressed) above which a ZIP is a bomb. */
export const MAX_ZIP_RATIO = 250;
/** Entry-count cap — a "flat" bomb hides size behind millions of tiny members. */
export const MAX_ZIP_ENTRIES = 10_000;
/** Page cap for PDF TEXT extraction (OCR is capped separately, lower). */
export const MAX_PDF_PAGES = 500;

/** Coarse content family sniffed from the leading bytes. */
export type SniffFamily =
  | "pdf"
  | "zip" // docx / pptx / xlsx / ods (Office Open XML is a ZIP)
  | "ole" // legacy .doc / .xls (OLE compound file)
  | "png"
  | "jpeg"
  | "gif"
  | "bmp"
  | "tiff"
  | "webp"
  | "exe" // Mach-O / ELF / PE / shebang — never a document
  | "unknown";

export interface Sniffed {
  family: SniffFamily;
  /** Pixel dimensions when the header carries them (png/gif/bmp/jpeg). */
  width?: number;
  height?: number;
}

const IMAGE_FAMILIES: ReadonlySet<SniffFamily> = new Set(["png", "jpeg", "gif", "bmp", "tiff", "webp"]);

const eq = (b: Uint8Array, off: number, sig: readonly number[]): boolean => {
  if (off + sig.length > b.length) return false;
  for (let i = 0; i < sig.length; i++) if (b[off + i] !== sig[i]) return false;
  return true;
};
const u16be = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];
const u16le = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32be = (b: Uint8Array, o: number) => (b[o] * 0x1000000) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
const u32le = (b: Uint8Array, o: number) => b[o] + (b[o + 1] << 8) + (b[o + 2] << 16) + b[o + 3] * 0x1000000;

/** JPEG width/height: walk the marker segments to the first Start-Of-Frame. */
function jpegDims(b: Uint8Array): { width: number; height: number } | undefined {
  let o = 2; // past SOI (FF D8)
  while (o + 9 < b.length) {
    if (b[o] !== 0xff) { o++; continue; } // resync on padding
    const marker = b[o + 1];
    // SOF0/1/2/3, 5-7, 9-11, 13-15 carry the frame dimensions.
    const isSOF = (marker >= 0xc0 && marker <= 0xcf) && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSOF) return { height: u16be(b, o + 5), width: u16be(b, o + 7) };
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) { o += 2; continue; }
    const len = u16be(b, o + 2); // segment length includes the 2 length bytes
    if (len < 2) return undefined;
    o += 2 + len;
  }
  return undefined;
}

/**
 * Identify a file from its leading bytes. Scans a small window for `%PDF`
 * (real PDFs sometimes carry a BOM/junk prefix); everything else keys on the
 * first bytes. Returns `unknown` when nothing matches — NOT an error.
 */
export function sniff(b: Uint8Array): Sniffed {
  if (b.length < 4) return { family: "unknown" };
  // Executables — highest priority: a "document" that is really code is hostile.
  if (eq(b, 0, [0x7f, 0x45, 0x4c, 0x46])) return { family: "exe" }; // ELF
  if (eq(b, 0, [0x4d, 0x5a])) return { family: "exe" }; // PE "MZ"
  if (eq(b, 0, [0x23, 0x21])) return { family: "exe" }; // "#!" shebang
  if (eq(b, 0, [0xca, 0xfe, 0xba, 0xbe]) || eq(b, 0, [0xcf, 0xfa, 0xed, 0xfe]) || eq(b, 0, [0xfe, 0xed, 0xfa, 0xce])) return { family: "exe" }; // Mach-O

  if (eq(b, 0, [0xd0, 0xcf, 0x11, 0xe0])) return { family: "ole" };
  if (eq(b, 0, [0x50, 0x4b, 0x03, 0x04]) || eq(b, 0, [0x50, 0x4b, 0x05, 0x06]) || eq(b, 0, [0x50, 0x4b, 0x07, 0x08])) return { family: "zip" };

  if (eq(b, 0, [0x89, 0x50, 0x4e, 0x47])) {
    // PNG IHDR: width @16 height @20 (big-endian), present once past the sig.
    const dims = b.length >= 24 && eq(b, 12, [0x49, 0x48, 0x44, 0x52]) ? { width: u32be(b, 16), height: u32be(b, 20) } : {};
    return { family: "png", ...dims };
  }
  if (eq(b, 0, [0xff, 0xd8, 0xff])) return { family: "jpeg", ...(jpegDims(b) ?? {}) };
  if (eq(b, 0, [0x47, 0x49, 0x46, 0x38])) return { family: "gif", ...(b.length >= 10 ? { width: u16le(b, 6), height: u16le(b, 8) } : {}) };
  if (eq(b, 0, [0x42, 0x4d])) return { family: "bmp", ...(b.length >= 26 ? { width: Math.abs(u32le(b, 18) | 0), height: Math.abs(u32le(b, 22) | 0) } : {}) };
  if (eq(b, 0, [0x49, 0x49, 0x2a, 0x00]) || eq(b, 0, [0x4d, 0x4d, 0x00, 0x2a])) return { family: "tiff" };
  if (eq(b, 0, [0x52, 0x49, 0x46, 0x46]) && b.length >= 12 && eq(b, 8, [0x57, 0x45, 0x42, 0x50])) return { family: "webp" };

  // `%PDF` may sit a few bytes in (BOM / leading whitespace tolerated by readers).
  const head = b.subarray(0, Math.min(b.length, 1024));
  for (let i = 0; i + 4 <= head.length; i++) {
    if (head[i] === 0x25 && head[i + 1] === 0x50 && head[i + 2] === 0x44 && head[i + 3] === 0x46) return { family: "pdf" };
  }
  return { family: "unknown" };
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
    case ".png": case ".jpg": case ".jpeg": case ".webp":
    case ".bmp": case ".tiff": case ".tif": case ".gif":
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
 */
function checkZipBomb(b: Uint8Array): string | null {
  // Find the End Of Central Directory record (sig 0x06054b50), scanning back
  // from the tail (it sits within the last 64KiB + 22-byte fixed record).
  const min = Math.max(0, b.length - (0xffff + 22));
  let eocd = -1;
  for (let i = b.length - 22; i >= min; i--) {
    if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 0x05 && b[i + 3] === 0x06) { eocd = i; break; }
  }
  if (eocd < 0) return null; // not a well-formed ZIP → let the parser deal with it
  const entries = u16le(b, eocd + 10);
  if (entries > MAX_ZIP_ENTRIES) return `Fichier compressé suspect (${entries} entrées) — refusé.`;
  let cd = u32le(b, eocd + 16); // central-directory offset
  let totalUncompressed = 0;
  let totalCompressed = 0;
  for (let n = 0; n < entries; n++) {
    if (cd + 46 > b.length || !(b[cd] === 0x50 && b[cd + 1] === 0x4b && b[cd + 2] === 0x01 && b[cd + 3] === 0x02)) break; // truncated/odd → stop, don't reject
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
  if (totalCompressed > 0 && totalUncompressed / totalCompressed > MAX_ZIP_RATIO && totalUncompressed > 10 * 1024 * 1024) {
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
  if (IMAGE_FAMILIES.has(s.family) && s.width && s.height && s.width * s.height > MAX_IMAGE_PIXELS) {
    return `Image aux dimensions excessives (${s.width}×${s.height}) — refusée.`;
  }
  // ZIP-container bomb (Office formats).
  if (s.family === "zip") {
    const bomb = checkZipBomb(bytes);
    if (bomb) return bomb;
  }
  return null;
}
