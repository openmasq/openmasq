// Which PDF pages may skip OCR — the ONE rule that lets a digital PDF attach without
// rasterising every page, and the reason no page that could hide content is ever skipped.
//
// A page skips OCR only when EVERYTHING it shows is known to be in its text layer. That is
// an ALLOW-list, decided per page, and anything unknown answers « OCR it » (fail closed):
//  · its text layer is DENSE (≥ `PDF_MIN_CHARS_PER_PAGE` non-space chars) — a sparse page is a
//    scan suspect;
//  · its text layer is CLEAN: no debris at all (C0 controls, U+FFFD, private-use glyphs). The
//    document-wide `isUnreadableLayer` tolerates 15 % before calling a layer absent; skipping a
//    page needs more trust than that, so ANY debris sends the page to OCR;
//  · its operator list was READ and paints NO image (a stamp, a signature, a scanned insert
//    are images: invisible to the text layer, visible to OCR);
//  · its annotations were READ and are all `Link`s. A filled form field, a stamp, a free-text
//    note are annotations whose values the text layer does NOT carry — the raster does.
// When the image is the ONLY unproved content, `pageOcrRegions` narrows the read to the image
// rectangles (`imageRegions.ts`): every other fact is proved, so the pixels outside them say
// nothing the text layer does not. Any other reason, or an image it could not bound ⇒ the page.
// Residual (stated, not closed): text drawn as vector OUTLINES on a page that also has a dense,
// clean text layer, and a font whose glyph codes map to plausible-looking wrong letters. Both
// skip OCR here; both are rare, and both were already outside OCR past the old 10-page cap.
import { PDF_MIN_CHARS_PER_PAGE } from "../core";
import { junkRatio } from "./readable";
import type { PageFractionRect } from "./imageRegions";

/** The only annotation kind whose content cannot be missing from the text layer. */
const HARMLESS_ANNOTATIONS: ReadonlySet<string> = new Set(["Link"]);

export interface PageFacts {
  /** The page's text-layer text. */
  text: string;
  /** Did the operator list paint an image? `null` = unknown (list unreadable, or the image
   *  operators could not be resolved) — treated as « yes ». */
  paintsImage: boolean | null;
  /** The page's annotation subtypes; `null` = unknown — treated as « may hide content ». */
  annotations: readonly string[] | null;
}

/** Every fact but the images: the text layer holds all the page's TEXT. */
function layerProved(p: PageFacts): boolean {
  if (p.text.replace(/\s/g, "").length < PDF_MIN_CHARS_PER_PAGE) return false;
  if (junkRatio(p.text) > 0) return false;
  if (p.annotations === null) return false;
  return p.annotations.every((s) => HARMLESS_ANNOTATIONS.has(s));
}

/** Must this page be OCR'd? `true` unless every fact proves the text layer holds it all. */
export function pageNeedsOcr(p: PageFacts): boolean {
  return !layerProved(p) || p.paintsImage !== false;
}

/** Above this share of the page, the regions are read as ONE page: same pixels, one pass. */
export const REGIONS_MAX_AREA = 0.6;

/**
 * The rectangles OCR may limit itself to on a page that `pageNeedsOcr`, or `null` = read the
 * whole page. Non-null ONLY when the text layer is proved on every other fact and the page's
 * images were all bounded (`regions` non-null, non-empty) and cover under `REGIONS_MAX_AREA`.
 */
export function pageOcrRegions(p: PageFacts & { regions: readonly PageFractionRect[] | null }): PageFractionRect[] | null {
  if (p.paintsImage !== true || !p.regions?.length || !layerProved(p)) return null;
  const area = p.regions.reduce((a, r) => a + (r.x1 - r.x0) * (r.y1 - r.y0), 0);
  return area < REGIONS_MAX_AREA ? [...p.regions] : null;
}
