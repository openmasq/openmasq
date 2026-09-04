/**
 * Magic-byte sniffing and header-level image dimensions — split out of `guard.ts` for the
 * 300-LOC cap (rule 1). `guard.ts` re-exports everything public, so callers keep importing
 * from the guard (and the barrel keeps its surface). Pure: no I/O, no dependency.
 *
 * WHY dimensions live here: the pixel-flood cap in `guardUpload` can only bite when the
 * sniffer RETURNS a size. PNG/JPEG/GIF/BMP always did; TIFF and WebP did not, and both route
 * to OCR — a 50 KB lossless WebP at 16383×16383 decoded to ~1 GB (audit 04/09). So the
 * sniffer parses `VP8X`/`VP8L`/`VP8 ` and the TIFF IFD in both endiannesses, and the guard
 * fails CLOSED for those two families when no size can be read.
 */
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
  /** Pixel dimensions when the header carries them — every image family we accept
   *  (png/gif/bmp/jpeg/webp/tiff). Absent for a header too short or too odd to read. */
  width?: number;
  height?: number;
}

export const IMAGE_FAMILIES: ReadonlySet<SniffFamily> = new Set([
  "png",
  "jpeg",
  "gif",
  "bmp",
  "tiff",
  "webp",
]);

const eq = (b: Uint8Array, off: number, sig: readonly number[]): boolean => {
  if (off + sig.length > b.length) return false;
  for (let i = 0; i < sig.length; i++) if (b[off + i] !== sig[i]) return false;
  return true;
};
const u16be = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];
export const u16le = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32be = (b: Uint8Array, o: number) =>
  b[o] * 0x1000000 + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
export const u32le = (b: Uint8Array, o: number) =>
  b[o] + (b[o + 1] << 8) + (b[o + 2] << 16) + b[o + 3] * 0x1000000;

/** JPEG width/height: walk the marker segments to the first Start-Of-Frame. */
function jpegDims(b: Uint8Array): { width: number; height: number } | undefined {
  let o = 2; // past SOI (FF D8)
  while (o + 9 < b.length) {
    if (b[o] !== 0xff) {
      o++;
      continue;
    } // resync on padding
    const marker = b[o + 1];
    // SOF0/1/2/3, 5-7, 9-11, 13-15 carry the frame dimensions.
    const isSOF =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSOF) return { height: u16be(b, o + 5), width: u16be(b, o + 7) };
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      o += 2;
      continue;
    }
    const len = u16be(b, o + 2); // segment length includes the 2 length bytes
    if (len < 2) return undefined;
    o += 2 + len;
  }
  return undefined;
}

/**
 * WebP dimensions. The container is RIFF: `RIFF` · size · `WEBP` · then ONE chunk whose
 * fourCC at byte 12 says which of the three encodings this is, each carrying the size
 * somewhere different. All three are read here because all three reach OCR, and a format
 * whose size we cannot read is a format whose pixel-flood cannot be refused.
 *
 *  - `VP8X` (extended): canvas width-1 / height-1 as 24-bit little-endian, at payload+4.
 *  - `VP8L` (lossless): a `0x2f` signature, then 14 bits of width-1 and 14 of height-1,
 *    packed little-endian across the next four bytes.
 *  - `VP8 ` (lossy): a 3-byte frame tag, the `9d 01 2a` start code, then width and
 *    height as 16-bit little-endian of which the low 14 bits are the size.
 */
function webpDims(b: Uint8Array): { width: number; height: number } | undefined {
  if (b.length < 21) return undefined; // RIFF header + fourCC + chunk size + a first byte
  const fourcc = String.fromCharCode(b[12], b[13], b[14], b[15]);
  if (fourcc === "VP8X") {
    if (b.length < 30) return undefined;
    return {
      width: b[24] + b[25] * 0x100 + b[26] * 0x10000 + 1,
      height: b[27] + b[28] * 0x100 + b[29] * 0x10000 + 1,
    };
  }
  if (fourcc === "VP8L") {
    if (b.length < 25 || b[20] !== 0x2f) return undefined;
    // 28 bits of payload read as an unsigned number — `<< 24` would go negative.
    const bits = b[21] + b[22] * 0x100 + b[23] * 0x10000 + b[24] * 0x1000000;
    return { width: (bits % 0x4000) + 1, height: (Math.floor(bits / 0x4000) % 0x4000) + 1 };
  }
  if (fourcc === "VP8 ") {
    if (b.length < 30 || !(b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a)) return undefined;
    return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
  }
  return undefined;
}

/**
 * TIFF dimensions: read the FIRST IFD and pick tags 0x0100 (ImageWidth) and 0x0101
 * (ImageLength). Byte order comes from the file itself (`II` little / `MM` big), and
 * both are common in the wild — a scanner's output is as likely to be one as the other.
 * A tag's value is SHORT (type 3) or LONG (type 4) and sits inline in the entry's last
 * four bytes; a SHORT occupies the FIRST two of them, which is why the read follows the
 * file's endianness rather than a fixed offset.
 */
function tiffDims(b: Uint8Array): { width: number; height: number } | undefined {
  const le = b[0] === 0x49; // "II"
  const u16 = (o: number) => (le ? u16le(b, o) : u16be(b, o));
  const u32 = (o: number) => (le ? u32le(b, o) : u32be(b, o));
  if (b.length < 8) return undefined;
  const ifd = u32(4);
  if (ifd < 8 || ifd + 2 > b.length) return undefined;
  const count = u16(ifd);
  let width: number | undefined;
  let height: number | undefined;
  for (let i = 0; i < count; i++) {
    const e = ifd + 2 + i * 12;
    if (e + 12 > b.length) break; // truncated header → whatever we have (likely nothing)
    const tag = u16(e);
    if (tag !== 0x0100 && tag !== 0x0101) continue;
    const type = u16(e + 2);
    if (type !== 3 && type !== 4) continue; // anything else is not a plain dimension
    const value = type === 3 ? u16(e + 8) : u32(e + 8);
    if (tag === 0x0100) width = value;
    else height = value;
  }
  return width && height ? { width, height } : undefined;
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
  if (
    eq(b, 0, [0xca, 0xfe, 0xba, 0xbe]) ||
    eq(b, 0, [0xcf, 0xfa, 0xed, 0xfe]) ||
    eq(b, 0, [0xfe, 0xed, 0xfa, 0xce])
  )
    return { family: "exe" }; // Mach-O

  if (eq(b, 0, [0xd0, 0xcf, 0x11, 0xe0])) return { family: "ole" };
  if (
    eq(b, 0, [0x50, 0x4b, 0x03, 0x04]) ||
    eq(b, 0, [0x50, 0x4b, 0x05, 0x06]) ||
    eq(b, 0, [0x50, 0x4b, 0x07, 0x08])
  )
    return { family: "zip" };

  if (eq(b, 0, [0x89, 0x50, 0x4e, 0x47])) {
    // PNG IHDR: width @16 height @20 (big-endian), present once past the sig.
    const dims =
      b.length >= 24 && eq(b, 12, [0x49, 0x48, 0x44, 0x52])
        ? { width: u32be(b, 16), height: u32be(b, 20) }
        : {};
    return { family: "png", ...dims };
  }
  if (eq(b, 0, [0xff, 0xd8, 0xff])) return { family: "jpeg", ...(jpegDims(b) ?? {}) };
  if (eq(b, 0, [0x47, 0x49, 0x46, 0x38]))
    return {
      family: "gif",
      ...(b.length >= 10 ? { width: u16le(b, 6), height: u16le(b, 8) } : {}),
    };
  if (eq(b, 0, [0x42, 0x4d]))
    return {
      family: "bmp",
      ...(b.length >= 26
        ? { width: Math.abs(u32le(b, 18) | 0), height: Math.abs(u32le(b, 22) | 0) }
        : {}),
    };
  if (eq(b, 0, [0x49, 0x49, 0x2a, 0x00]) || eq(b, 0, [0x4d, 0x4d, 0x00, 0x2a]))
    return { family: "tiff", ...(tiffDims(b) ?? {}) };
  if (eq(b, 0, [0x52, 0x49, 0x46, 0x46]) && b.length >= 12 && eq(b, 8, [0x57, 0x45, 0x42, 0x50]))
    return { family: "webp", ...(webpDims(b) ?? {}) };

  // `%PDF` may sit a few bytes in (BOM / leading whitespace tolerated by readers).
  const head = b.subarray(0, Math.min(b.length, 1024));
  for (let i = 0; i + 4 <= head.length; i++) {
    if (head[i] === 0x25 && head[i + 1] === 0x50 && head[i + 2] === 0x44 && head[i + 3] === 0x46)
      return { family: "pdf" };
  }
  return { family: "unknown" };
}
