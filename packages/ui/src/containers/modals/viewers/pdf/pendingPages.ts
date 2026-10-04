import { PAGE_BREAK, pageOffsets } from "@openmasq/redact/documents.browser";
import { layoutValueHits, type PartialMask, type PdfReplacement } from "@openmasq/redact/pdf-redact";

/** ONE empty map, not a fresh `[]` per recompute: the viewer repaints when the map's IDENTITY
 *  changes, and a new empty array on every streamed page repainted every page in view. */
const NO_REPLACEMENTS: PdfReplacement[] = [];

/** Where a page of a PDF still being read or masked stands. A `masked` page shows masked; any
 *  other shows the ORIGINAL, labelled as such (`usePdfPages.ts`). */
export type PdfPageState = "masked" | "read" | "current" | "waiting";

export interface PendingPage {
  state: PdfPageState;
  /** The page's unreadable thumbnail (≤ 40 px wide at the source), while the read streams them. */
  thumb?: string;
  /** The page's FINAL text — what the coverage proof checks the paint against. */
  text?: string;
}

/** A PDF whose masking is not over: the map so far (PROVISIONAL) and each page's state. */
export interface PendingPdf {
  replacements: PdfReplacement[];
  pages: PendingPage[];
}

/** What the chip knows while its PDF is read or masked (`Attachment`, structurally). */
export interface PendingSource {
  /** The file's final text, once read. */
  text?: string;
  extracting?: boolean;
  /** Waiting its turn in the extraction queue: no page is being read yet. */
  extractQueued?: number;
  /** What the run that continues the read's masking has done (`redactAttachment.ts`). */
  maskedSoFar?: PartialMask;
  reading?: {
    total: number;
    thumbs: readonly (string | undefined)[];
    read: readonly (boolean | undefined)[];
    mask?: PartialMask & { pageTexts: string[] };
  };
}

/**
 * Each page's state from what the masking has COVERED: a page is `masked` once it is read
 * AND every value that could touch it has been looked for — the masked prefix reaches its
 * end (`covered`: no later chunk can find a value starting before it). Before that the page
 * is `read`, `current` or `waiting` and the viewer shows its thumbnail only.
 *
 * Page offsets come from the same join as the extractor's (`pageOffsets`): the streamed
 * pages while the file is read, its final text split on `PAGE_BREAK` once it is. A page whose
 * text is unknown is never `masked`.
 */
export function pendingPdf(s: PendingSource): PendingPdf {
  const r = s.reading;
  const pageTexts = s.text ? s.text.split(PAGE_BREAK) : (r?.mask?.pageTexts ?? []);
  const { ends } = pageOffsets(pageTexts);
  const mask = s.maskedSoFar ?? r?.mask;
  const covered = mask?.covered ?? 0;
  const total = Math.max(r?.total ?? 0, s.text ? pageTexts.length : 0);
  const reading = !!s.extracting;
  const started = !(s.extractQueued && s.extractQueued > 0);
  let current = -1;
  if (reading && started) for (let i = 0; i < total && current < 0; i++) if (!r?.read[i]) current = i;
  const pages = Array.from({ length: total }, (_, i): PendingPage => {
    const read = !reading || !!r?.read[i];
    const text = pageTexts[i];
    const masked = !!mask && read && text !== undefined && ends[i] !== undefined && ends[i] <= covered;
    const thumb = r?.thumbs[i];
    return {
      state: masked ? "masked" : read ? "read" : i === current ? "current" : "waiting",
      ...(thumb ? { thumb } : {}),
      ...(text !== undefined ? { text } : {}),
    };
  });
  return { replacements: mask?.replacements ?? NO_REPLACEMENTS, pages };
}

/**
 * The paint of a pending page may be SHOWN only if it covers every value of the map that
 * occurs in the page's final text (`covered`, from the painter). A scanned page has no text
 * layer while it is read — its OCR geometry arrives with the result — so its values are not
 * painted yet: it stays a thumbnail. Fail closed: no text ⇒ not proven.
 */
export function pageProven(
  paintCovered: ReadonlySet<string>,
  pageText: string | undefined,
  replacements: PdfReplacement[],
): boolean {
  if (pageText === undefined) return false;
  const expected = layoutValueHits({ text: pageText, runs: [] }, replacements).covered;
  for (const real of expected) if (!paintCovered.has(real)) return false;
  return true;
}
