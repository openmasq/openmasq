/**
 * One path SEGMENT masked like a sentence: the entities found in it are replaced by THEIR
 * vault fakes, identifier tokens by a same-shape fake, and every other word is kept — except
 * at Strict, where a word no lexicon vouches for becomes a pronounceable stand-in. Separators,
 * counters, years and the meaning words are copied verbatim.
 */
import type { NotorietyOpts } from "../notorious";
import { isPathMeaningWord } from "./lexicon";
import { tokensOf, isIdentifierToken, fakeIdentifier, pronounceable, wordSeed } from "./words";

export interface SegmentFakeCtx {
  /** Strict level: an undetected word that no lexicon vouches for is replaced too. */
  strict: boolean;
  notoriety: NotorietyOpts;
  /** Real values detected in this path (each allocated through the vault beforehand). */
  entities: readonly string[];
  /** The vault fake of a real entity; `undefined` ⇒ the segment fails CLOSED. */
  resolve: (real: string) => string | undefined;
  attempt: number;
  convKey?: Uint8Array;
}

const isWordChar = (c: string | undefined) => !!c && /[\p{L}\p{M}\p{N}]/u.test(c);

/** Every word-bounded occurrence of `value` in `text`. */
export function occurrences(text: string, value: string): number[] {
  const out: number[] = [];
  if (!value) return out;
  for (let i = text.indexOf(value); i >= 0; i = text.indexOf(value, i + 1)) {
    if (!isWordChar(text[i - 1]) && !isWordChar(text[i + value.length])) out.push(i);
  }
  return out;
}

/** The spans of `entities` in `seg`, longest first, never overlapping. */
function entitySpans(seg: string, entities: readonly string[]): [number, number, string][] {
  const spans: [number, number, string][] = [];
  for (const e of [...entities].sort((a, b) => b.length - a.length)) {
    for (const at of occurrences(seg, e)) {
      const end = at + e.length;
      if (spans.some(([s, t]) => at < t && end > s)) continue;
      spans.push([at, end, e]);
    }
  }
  return spans.sort((a, b) => a[0] - b[0]);
}

/** A fake that sits between `_` (or `-`) keeps the segment's own joiner instead of spaces. */
function joinLike(fake: string, seg: string, start: number, end: number): string {
  const j = [seg[start - 1], seg[end]].find((c) => c === "_" || c === "-");
  return j && !/\s/.test(seg) ? fake.replace(/\s+/g, j) : fake;
}

/** Mask the free text between entities, word by word. */
function maskFree(text: string, ctx: SegmentFakeCtx, force: boolean): string {
  const toks = tokensOf(text);
  let out = "";
  let at = 0;
  toks.forEach((t, i) => {
    out += text.slice(at, t.start);
    at = t.start + t.text.length;
    if (/\p{N}/u.test(t.text)) {
      if (isIdentifierToken(t.text)) out += fakeIdentifier(t.text, wordSeed("id", t.text, ctx.attempt, ctx.convKey));
      // A word glued to a few digits (« PHARE2 ») is judged on its letters.
      else out += t.text.replace(/\p{L}[\p{L}\p{M}]*/gu, (w) => maskWord(w, ctx, force, true));
      return;
    }
    const besideNumber = /\p{N}/u.test(toks[i - 1]?.text ?? "") || /\p{N}/u.test(toks[i + 1]?.text ?? "");
    out += maskWord(t.text, ctx, force, besideNumber);
  });
  return out + text.slice(at);
}

function maskWord(w: string, ctx: SegmentFakeCtx, force: boolean, besideNumber: boolean): string {
  if (!force && (!ctx.strict || isPathMeaningWord(w, ctx.notoriety, besideNumber))) return w;
  return pronounceable(w, wordSeed("w", w, ctx.attempt, ctx.convKey));
}

/**
 * The fake of one distinctive segment, or `null` when an entity has no vault fake — the
 * caller then falls back to the full-segment scramble (fail CLOSED, never verbatim).
 * `force` (a path with nothing distinctive at Strict) replaces every word.
 */
export function fakeSegmentText(seg: string, ctx: SegmentFakeCtx, force = false): string | null {
  let out = "";
  let at = 0;
  for (const [s, e, real] of entitySpans(seg, ctx.entities)) {
    const fake = ctx.resolve(real);
    if (fake === undefined) return null;
    out += maskFree(seg.slice(at, s), ctx, force) + joinLike(fake, seg, s, e);
    at = e;
  }
  return out + maskFree(seg.slice(at), ctx, force);
}
