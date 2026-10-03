import type { RedactionSegment } from "@openmasq/redact";

/**
 * How much of a pair the comparison mounts at first, then per « Afficher la suite ».
 * A 200k-char paste rendered whole (two columns, thousands of marks) froze the modal
 * for seconds; the start of the text is what a reader checks first, and the rest stays
 * one click away, in steps, so no single click re-creates the freeze.
 */
export const FIRST_CHARS = 8_000;
export const STEP_CHARS = 40_000;

/**
 * The segments that fit in `limit` characters, and how many characters they hold.
 * A text segment is cut at the limit; a MARK is never cut (a half pseudonym would show a
 * value that never existed), so the shown part may run past the limit by one mark.
 * The shown segments concatenated are always a PREFIX of the text segmented.
 */
export function sliceSegments(
  segments: RedactionSegment[],
  limit: number,
): { shown: RedactionSegment[]; used: number } {
  const shown: RedactionSegment[] = [];
  let used = 0;
  for (const s of segments) {
    if (used >= limit) break;
    const room = limit - used;
    if (s.kind === "text" && s.value.length > room) {
      shown.push({ ...s, value: s.value.slice(0, room) });
      used += room;
      break;
    }
    shown.push(s);
    used += s.value.length;
  }
  return { shown, used };
}

/**
 * Segment only the PREFIX that will be shown. Segmenting the whole 200k text cost
 * seconds even when a few thousand characters were mounted. Matching is left to right
 * and each match (and its word-boundary check) only reads a few characters around it, so
 * cutting `maxLen + EDGE` characters past the limit gives every match that STARTS before
 * the limit exactly as the whole text would (`sliceSegments.test.ts` pins it).
 */
/** How far past a match the boundary check reads (`isWordGlued`: one neighbour, plus a
 *  `%XX` tail), with room to spare. */
const EDGE = 8;

export function windowSegments(
  text: string,
  limit: number,
  maxLen: number,
  segment: (text: string) => RedactionSegment[],
): { shown: RedactionSegment[]; rest: number } {
  const cut = limit + maxLen + EDGE;
  const { shown, used } = sliceSegments(segment(text.length > cut ? text.slice(0, cut) : text), limit);
  return { shown, rest: text.length - used };
}
