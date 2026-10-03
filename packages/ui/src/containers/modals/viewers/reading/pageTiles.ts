/** Where a page of a PDF being read stands. */
type ReadingPageState = "read" | "current" | "waiting";

export interface ReadingPageView {
  n: number;
  /** A `data:image/png` thumbnail too small to read (`@openmasq/redact` `THUMB_MAX_WIDTH_PX`). */
  src?: string;
  state: ReadingPageState;
}

/** Tiles drawn at most: past it, a « + N pages » line — a 400-page scan is not 400 tiles. */
export const MAX_READING_TILES = 48;

/**
 * The pages of a PDF being read, as tiles: read, being read (the FIRST page not read yet,
 * once the read has started — OCR goes in page order), or waiting. `started` is false while
 * the file still waits its turn in the extraction queue: then no page is « en cours ».
 */
export function readingPages(
  r: { total: number; thumbs: readonly (string | undefined)[]; read: readonly (boolean | undefined)[] },
  started: boolean,
): { pages: ReadingPageView[]; more: number } {
  const total = Math.max(0, r.total);
  let current = -1;
  if (started) for (let i = 0; i < total && current < 0; i++) if (!r.read[i]) current = i;
  const shown = Math.min(total, MAX_READING_TILES);
  const pages = Array.from({ length: shown }, (_, i): ReadingPageView => ({
    n: i + 1,
    ...(r.thumbs[i] ? { src: r.thumbs[i] } : {}),
    state: r.read[i] ? "read" : i === current ? "current" : "waiting",
  }));
  return { pages, more: total - shown };
}
