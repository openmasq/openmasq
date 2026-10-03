// What a PDF being READ streams out before its result: which page is read, the FINAL text of a
// page once it is known, and a thumbnail of each page too small to read. PREVIEW ONLY — the
// authoritative text is still the extraction's result, read whole or not at all
// (`pdfExtract.ts`). Pure and DOM-free: the Node binding, main's boundary check and the
// renderer's assembly all import it from here.
import { PAGE_BREAK } from "./pageBreak";

/** One page of a PDF being read. `read`: its reading is over. `text`: the page's FINAL primary
 *  text, present only when it IS final (a digital PDF's text layer, a scan's OCR) — a page
 *  whose fate is decided at the end (a sparse scan: layer or OCR?) never carries one. */
export interface PageEvent {
  /** 1-based page number. */
  n: number;
  total: number;
  read: boolean;
  text?: string;
}

/** A page thumbnail, unreadable by construction (`thumbScale`): PNG bytes. */
export interface ThumbEvent {
  n: number;
  total: number;
  png: Uint8Array;
}

/** What the extraction can stream; every sink is optional and display-only. */
export interface ExtractStream {
  onPage?: (ev: PageEvent) => void;
  onThumb?: (ev: ThumbEvent) => void;
}

/** The event main relays to the renderer (`files:extract-stream`): the thumbnail as a
 *  `data:image/png` URL, already checked by `isSafeThumbnail`. */
export type ExtractStreamEvent =
  | { page: PageEvent; thumb?: undefined }
  | { thumb: { n: number; total: number; src: string }; page?: undefined };

/**
 * ⚠️ THE unreadability bound of a thumbnail, in pixels. An A4 page at 40 px wide puts body
 * text under 1 px tall and a 72-pt title under 5 px: the layout is recognisable, no word is.
 * The renderer blurs it further, but that is cosmetic — the guarantee is HERE, at the source,
 * and main refuses any PNG whose header says otherwise (`isSafeThumbnail`). Pinned by
 * `pageStream.test.ts`.
 */
export const THUMB_MAX_WIDTH_PX = 40;
/** A tall page (a receipt roll) is bounded by height instead. */
export const THUMB_MAX_HEIGHT_PX = 80;
/** A thumbnail this small is a few hundred bytes; past this, something is wrong — refused. */
export const THUMB_MAX_BYTES = 16 * 1024;
/** The longest page text relayed to the renderer; a longer page is not streamed (preview only). */
export const STREAM_PAGE_MAX_CHARS = 200_000;
/** The most pages a stream may announce (a guard refuses longer PDFs before reading anyway). */
export const STREAM_MAX_PAGES = 5_000;

/** The render scale fitting a `w`×`h` pt page inside the thumbnail bounds, or `null` for a
 *  page with no usable geometry. The canvas is then `floor(w·s)`×`floor(h·s)` — never above
 *  the bounds. */
export function thumbScale(w: number, h: number): number | null {
  if (!(w > 0) || !(h > 0) || !Number.isFinite(w) || !Number.isFinite(h)) return null;
  return Math.min(THUMB_MAX_WIDTH_PX / w, THUMB_MAX_HEIGHT_PX / h);
}

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Width × height from a PNG's IHDR chunk, or `null` when the bytes are not a PNG. */
export function pngSize(png: Uint8Array): { width: number; height: number } | null {
  if (png.length < 24 || PNG_SIG.some((b, i) => png[i] !== b)) return null;
  // IHDR is the first chunk: length(4) "IHDR"(4) width(4) height(4), big-endian.
  if (String.fromCharCode(png[12], png[13], png[14], png[15]) !== "IHDR") return null;
  const be = (o: number) => ((png[o] << 24) | (png[o + 1] << 16) | (png[o + 2] << 8) | png[o + 3]) >>> 0;
  return { width: be(16), height: be(20) };
}

/** A thumbnail main may relay: a PNG, within the byte and pixel bounds. Anything else — a
 *  larger raster, another format — is refused (fail closed: no picture rather than a legible one). */
export function isSafeThumbnail(png: Uint8Array): boolean {
  if (png.length > THUMB_MAX_BYTES) return false;
  const size = pngSize(png);
  return (
    !!size &&
    size.width >= 1 &&
    size.height >= 1 &&
    size.width <= THUMB_MAX_WIDTH_PX &&
    size.height <= THUMB_MAX_HEIGHT_PX
  );
}

/**
 * The text of the pages streamed so far, as the PREFIX of the final text: the pages known
 * contiguously from page 1, joined exactly as the extractor joins them (`PAGE_BREAK`, leading
 * whitespace trimmed as the final `.trim()` does). It only ever GROWS by appending, so offsets
 * computed on an earlier prefix stay valid. Returns the count of pages it covers.
 */
export function streamedPrefix(texts: readonly (string | undefined)[]): { text: string; pages: number } {
  const known: string[] = [];
  for (const t of texts) {
    if (t === undefined) break;
    known.push(t);
  }
  return { text: known.join(PAGE_BREAK).trimStart(), pages: known.length };
}
