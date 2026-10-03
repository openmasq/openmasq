/**
 * Every occurrence of a candidate value in the text, with the adjacent word on each side —
 * the evidence the context gates of `textContext.ts` judge on.
 *
 * The DEFINITION is one regex, `(WORD)?[ \t]*value[ \t]*(WORD)?`, flags `giu`, consumed
 * with `matchAll` ({@link occurrencesNaive}): matches never overlap, and the greedy left
 * word can reach a LATER occurrence inside one word run. Run as such it tries every
 * position of the text, backtracking through every word, once PER CANDIDATE, and compiling
 * the Unicode classes costs ~1 ms per value: a 200k-character paste with thousands of
 * candidates froze the send for seconds. So the same answer is computed differently:
 *
 * - the value alone (same flags) finds the next occurrence `i`, through a case-folded copy
 *   of the text searched with `indexOf` and confirmed by the sticky value regex;
 * - no match can start before the `WORD*[ \t]*` run that ends at `i` (its prefix would
 *   have to cross a character that is neither), so the attempts start there, each replayed
 *   in the regex's own backtracking order (`attemptAt`);
 * - the result is memoised per (text, value): candidates repeat values.
 *
 * `textOccurrences.test.ts` diffs it against the reference on adversarial text.
 */
import { positionsOf } from "../../positions";

const WORD = "[\\p{L}\\p{M}\\p{N}''’-]+";

export const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export type Occurrence = { before: string; after: string };

/** The reference definition: the whole regex over the whole text. Exported for the
 *  parity test only — the gates call {@link occurrences}. */
export function occurrencesNaive(value: string, input: string): Occurrence[] {
  const re = new RegExp(`(${WORD})?[ \\t]*${escapeRe(value)}[ \\t]*(${WORD})?`, "giu");
  const out: Occurrence[] = [];
  for (const m of input.matchAll(re)) out.push({ before: m[1] ?? "", after: m[2] ?? "" });
  return out;
}

/** Code units of the `WORD` code point at `k`, 0 when there is none. Membership is the
 *  regex's own (same class, same `iu` flags), cached per BMP code unit. */
const WORD_CP = /^[\p{L}\p{M}\p{N}''’-]$/iu;
const wordCache = new Uint8Array(0x10000); // 0 unknown · 1 no · 2 yes
function wordLen(s: string, k: number): number {
  if (k >= s.length) return 0;
  const cp = s.codePointAt(k) as number;
  if (cp > 0xffff) return WORD_CP.test(String.fromCodePoint(cp)) ? 2 : 0;
  let w = wordCache[cp];
  if (!w) {
    w = WORD_CP.test(String.fromCharCode(cp)) ? 2 : 1;
    wordCache[cp] = w;
  }
  return w === 2 ? 1 : 0;
}
const isBlank = (s: string, k: number) => s[k] === " " || s[k] === "\t";

/** Leftmost position ≥ `floor` from which a match whose value sits at `i` can start: the
 *  start of the `WORD*[ \t]*` run ending at `i`. Walking code units, a surrogate counts as
 *  a word unit — that can only move the start LEFT, which is safe. */
function leftEdge(input: string, i: number, floor: number): number {
  let k = i;
  while (k > floor && isBlank(input, k - 1)) k--;
  while (k > floor) {
    const c = input.charCodeAt(k - 1);
    if (!(c >= 0xd800 && c <= 0xdfff) && !wordLen(input, k - 1)) break;
    k--;
  }
  return k;
}

/**
 * The regex's attempt at start `p`, replayed in its own backtracking order: the optional
 * left word longest-first, then the blanks longest-first, then the value; then the same
 * without the word. Returns the left word and where the value matched, or null.
 */
function attemptAt(input: string, p: number, valueAt: (q: number) => number) {
  const ends: number[] = [];
  for (let k = p, n = wordLen(input, k); n; k += n, n = wordLen(input, k)) ends.push(k + n);
  for (let x = ends.length; x >= 0; x--) {
    const e = x === 0 ? p : (ends[x - 1] as number);
    let s = e;
    while (isBlank(input, s)) s++;
    for (let q = s; q >= e; q--) {
      const len = valueAt(q);
      if (len) return { before: input.slice(p, e), end: q + len };
    }
  }
  return null;
}

/**
 * The case-FOLD key of one UTF-16 code unit, for a SUPERSET search: two code units the
 * `iu` regex treats as equal ALWAYS get the same key (it may merge more — `ß`, `ΐ` and the
 * other multi-unit uppercases share one sentinel — never less). The candidate positions it
 * yields are then confirmed by the value regex itself, so over-merging costs a check,
 * never a result. Exhaustively pinned against the engine over the whole BMP
 * (`textOccurrences.test.ts`); surrogates are left alone and a value carrying one takes
 * the plain regex path.
 */
const FOLD_SENTINEL = "\u0000";
function foldKey(ch: string): string {
  const up = ch.toUpperCase();
  if (up.length !== 1) return FOLD_SENTINEL;
  const low = up.toLowerCase();
  if (low.length !== 1 || low.toUpperCase().length !== 1) return FOLD_SENTINEL;
  return low;
}
const foldCache = new Map<number, string>();
export function foldText(s: string): string {
  const parts: string[] = [];
  for (let k = 0; k < s.length; k++) {
    const c = s.charCodeAt(k);
    if (c >= 0xd800 && c <= 0xdfff) {
      parts.push(s[k] as string);
      continue;
    }
    let f = foldCache.get(c);
    if (f === undefined) {
      f = foldKey(String.fromCharCode(c));
      foldCache.set(c, f);
    }
    parts.push(f);
  }
  return parts.join("");
}
const HAS_SURROGATE = /[\ud800-\udfff]/;

/** Next position ≥ `pos` where the value regex matches — the same answer as `bare.exec`
 *  from `pos`. `cands` (fast path) are the folded hits, a superset, ascending; `cur.k`
 *  walks them once over the whole scan. */
function nextHit(bare: RegExp, cands: number[] | null, cur: { k: number }, input: string, pos: number): number {
  if (cands === null) {
    bare.lastIndex = pos;
    return bare.exec(input)?.index ?? -1;
  }
  for (; cur.k < cands.length; cur.k++) {
    const j = cands[cur.k] as number;
    if (j < pos) continue;
    bare.lastIndex = j;
    if (bare.test(input)) return j;
  }
  return -1;
}

function scan(value: string, input: string, folded: string): Occurrence[] {
  // The value alone, same flags as the reference regex. STICKY when it confirms a folded
  // candidate or a replayed position, GLOBAL when it is the search itself.
  const fast = !HAS_SURROGATE.test(value);
  const bare = new RegExp(escapeRe(value), fast ? "yiu" : "giu");
  const at = new RegExp(escapeRe(value), "yiu");
  const valueAt = (q: number) => {
    at.lastIndex = q;
    return at.exec(input)?.[0].length ?? 0;
  };
  const cands = fast ? positionsOf(folded, foldText(value)) : null;
  const cur = { k: 0 };
  const out: Occurrence[] = [];
  let pos = 0;
  while (pos <= input.length) {
    const i = nextHit(bare, cands, cur, input, pos);
    if (i < 0) break;
    let hit: { before: string; end: number } | null = null;
    for (let p = leftEdge(input, i, pos); p <= i && !hit; p += (input.codePointAt(p) ?? 0) > 0xffff ? 2 : 1)
      hit = attemptAt(input, p, valueAt);
    // Unreachable (the value alone matches at `i`); stop rather than loop.
    if (!hit) break;
    let e = hit.end;
    while (isBlank(input, e)) e++;
    const from = e;
    for (let n = wordLen(input, e); n; e += n, n = wordLen(input, e));
    out.push({ before: hit.before, after: input.slice(from, e) });
    pos = e;
  }
  return out;
}

let memoInput: string | null = null;
let memoFolded = "";
let memo = new Map<string, Occurrence[]>();

/** Every occurrence of `value` in `input`, with the adjacent word on each side. */
export function occurrences(value: string, input: string): readonly Occurrence[] {
  // An empty value matches empty strings: keep the reference semantics, no shortcut.
  if (!value) return occurrencesNaive(value, input);
  if (memoInput !== input) {
    memoInput = input;
    memoFolded = foldText(input);
    memo = new Map();
  }
  let hit = memo.get(value);
  if (!hit) {
    hit = scan(value, input, memoFolded);
    memo.set(value, hit);
  }
  return hit;
}
