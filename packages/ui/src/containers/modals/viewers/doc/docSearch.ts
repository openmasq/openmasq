/**
 * Case-insensitive substring search over the document-preview text. Pure +
 * unit-tested. A query shorter than {@link SEARCH_MIN_LEN} matches nothing — a
 * 1-char query on a 25k-char document would paint thousands of marks, which isn't
 * a useful "find in document".
 */
export const SEARCH_MIN_LEN = 2;

export interface SearchSeg {
  text: string;
  /** Global 0-based match index when this segment IS a hit; absent for plain text. */
  hit?: number;
}

/** One ordered display chunk of a text tab — plain text, or a redacted value shown
 *  as a clickable reveal `mark`. Search counts + highlights derive from `text`.
 *  `fake` is present only on the « Texte » tab's real-showing marks (`reveleChunks`),
 *  so the hover popover can reveal what the MODEL saw; the legacy static marks omit it. */
export interface DocChunk {
  text: string;
  mark?: { real: string; fake?: string; tone: string; kind: string; revealed: boolean };
}

/** The effective needle (trimmed, lowercased) — "" when below the min length. */
function needleOf(query: string): string {
  const q = query.trim().toLowerCase();
  return q.length >= SEARCH_MIN_LEN ? q : "";
}

/** Number of matches of `query` in `text`. */
export function countMatches(text: string, query: string): number {
  const q = needleOf(query);
  if (!q) return 0;
  const hay = text.toLowerCase();
  let n = 0;
  for (let i = hay.indexOf(q); i !== -1; i = hay.indexOf(q, i + q.length)) n++;
  return n;
}

/**
 * Split `text` into plain + matched segments, numbering matches from `start` so a
 * caller can thread a running global index across many chunks. Returns the segments
 * and the next global match index.
 */
export function splitMatches(
  text: string,
  query: string,
  start = 0,
): { segs: SearchSeg[]; next: number } {
  const q = needleOf(query);
  if (!q) return { segs: [{ text }], next: start };
  const hay = text.toLowerCase();
  const segs: SearchSeg[] = [];
  let from = 0;
  let n = start;
  for (let i = hay.indexOf(q); i !== -1; i = hay.indexOf(q, from)) {
    if (i > from) segs.push({ text: text.slice(from, i) });
    segs.push({ text: text.slice(i, i + q.length), hit: n++ });
    from = i + q.length;
  }
  if (from < text.length) segs.push({ text: text.slice(from) });
  return { segs, next: n };
}
