// Which parts of a rendered page the user is looking at that its TEXT LAYER does not
// contain — a logo, a stamp, a signature block, a scanned insert. They matter to the
// user because they are NOT part of the text the model receives: redact one only
// changes the pixels, and a value that lives only there was never in the text wire.
//
// Pure geometry + string work (no DOM), so the painter can hand the consumer ready
// rectangles and the UI never re-derives the rule. Two independent tests, both of which
// a real image zone passes and an OCR misreading of ordinary body text fails:
//
//   • the word does not OCCUR in the layer text (whitespace-flexible, case-insensitive);
//   • the word does not OVERLAP any text-layer word box.
//
// The second is what keeps the marking trustworthy. OCR is noisy: it reads "Contrat" as
// "Contrai" often enough that the string test alone would outline ordinary paragraphs,
// and a marking the user learns to distrust is worse than none.
import { occursFlexibly } from "./pdfMatch";
import { cleanWord, type PageWord } from "./pageWords";

/** One image-sourced region of a page, in the same CSS px space as `PageWord`. */
export interface ImageZone {
  left: number;
  top: number;
  w: number;
  h: number;
  /** How many OCR words the zone merged — a hint for the consumer, never a promise. */
  words: number;
}

/** Above this many image-sourced words the page is not "a logo and a stamp" — it is
 *  substantially a picture, and outlining every run would frame the whole page. The
 *  consumer says so with its page badge instead (see `RenderedPage.imageOnly`). */
const MAX_ZONE_WORDS = 200;

/** What one page's OCR geometry says about where its content came from. */
export interface PageImageSource {
  zones: ImageZone[];
  /** No text layer at all: everything on the page is read from pixels. */
  imageOnly: boolean;
  /** The image-sourced words THEMSELVES (the zones before merging) — same object
   *  identities as the `ocrWords` input, so a consumer can subtract them from a word
   *  list by identity. The halo needs this, not the merged rectangles: on a page WITH
   *  a text layer these words' text is never part of the model-facing wire, so a halo
   *  over them would claim a send that does not happen — the exact contradiction of
   *  the zone outline beside it. Non-empty even past the zone cap (a page that is
   *  substantially a picture shows no outlines, but the halo must still not lie). */
  imageWords: PageWord[];
}

export const NO_IMAGE_SOURCE: PageImageSource = { zones: [], imageOnly: false, imageWords: [] };

/**
 * The painter's per-page entry point. `wantZones` is the caller's word-geometry budget:
 * without the text layer's word boxes the overlap test can't run, and the string test
 * alone is too noisy to mark a page with (see the file header).
 */
export function pageImageSource(o: {
  layerText: string;
  ocrWords: PageWord[];
  textWords: PageWord[];
  wantZones: boolean;
}): PageImageSource {
  if (!o.layerText.trim()) return { zones: [], imageOnly: true, imageWords: [] };
  if (!o.wantZones) return NO_IMAGE_SOURCE;
  const imageWords = imageSourcedWords(o.ocrWords, o.textWords, o.layerText);
  return { zones: mergeImageZones(imageWords), imageOnly: false, imageWords };
}

function overlaps(a: PageWord, b: PageWord): boolean {
  return (
    a.left < b.left + b.w && b.left < a.left + a.w && a.top < b.top + b.h && b.top < a.top + a.h
  );
}

/**
 * The OCR words that the page's text layer does not account for. `textLayer` may be
 * empty — a page with NO text layer is a scan, and every word is image-sourced; the
 * caller decides whether to show zones or a whole-page badge.
 */
export function imageSourcedWords(
  ocr: PageWord[],
  textLayer: PageWord[],
  layerText: string,
): PageWord[] {
  return ocr.filter((w) => {
    // A one-character run is OCR speckle (a rule, a bullet, a scan artefact) far more
    // often than content; outlining it is noise.
    const s = cleanWord(w.str);
    if (s.length < 2) return false;
    if (occursFlexibly(layerText, s)) return false;
    return !textLayer.some((t) => overlaps(t, w));
  });
}

/**
 * Cluster the words into ONE rectangle per visual zone: a logo is several OCR words and
 * must read as a single region, not a row of little boxes. Neighbours are merged when
 * their boxes intersect once inflated by a fraction of the word height — that scales
 * with the type size, so a heading and a footnote cluster at their own spacing.
 *
 * Returns [] past `MAX_ZONE_WORDS`: at that point the page is a picture, not a page with
 * pictures on it.
 */
export function mergeImageZones(words: PageWord[]): ImageZone[] {
  if (!words.length || words.length > MAX_ZONE_WORDS) return [];
  const zones: (ImageZone & { padX: number; padY: number })[] = words.map((w) => ({
    left: w.left,
    top: w.top,
    w: w.w,
    h: w.h,
    words: 1,
    padX: w.h * 0.8,
    padY: w.h * 0.45,
  }));
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < zones.length && !merged; i++) {
      for (let j = i + 1; j < zones.length; j++) {
        const a = zones[i]!;
        const b = zones[j]!;
        const padX = Math.max(a.padX, b.padX);
        const padY = Math.max(a.padY, b.padY);
        const near =
          a.left - padX < b.left + b.w &&
          b.left - padX < a.left + a.w &&
          a.top - padY < b.top + b.h &&
          b.top - padY < a.top + a.h;
        if (!near) continue;
        const left = Math.min(a.left, b.left);
        const top = Math.min(a.top, b.top);
        zones[i] = {
          left,
          top,
          w: Math.max(a.left + a.w, b.left + b.w) - left,
          h: Math.max(a.top + a.h, b.top + b.h) - top,
          words: a.words + b.words,
          padX,
          padY,
        };
        zones.splice(j, 1);
        merged = true;
        break;
      }
    }
  }
  return zones.map(({ left, top, w, h, words }) => ({ left, top, w, h, words }));
}
