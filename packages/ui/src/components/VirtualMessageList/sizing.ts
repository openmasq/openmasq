/**
 * The pure sizing decisions behind the windowing — kept out of the components so
 * they can be tested without a DOM (rule: logic in `.ts`, presentation in `.tsx`).
 *
 * All of this exists because **message count is not a proxy for render cost**. A
 * thread of 25 pasted documents costs far more to mount than 300 one-liners: each
 * bubble parses markdown, re-scans its text against every vault value, and
 * highlights its code — all synchronous, all in the one commit that renders a
 * conversation. Gating on count alone sent exactly the heavy-but-short thread down
 * the render-everything path. `sizeOf` (chars) is the second axis.
 */

/** At/under this MANY items — and under {@link CHAR_BUDGET} — render every row. */
export const THRESHOLD = 40;
/** Total `sizeOf` above which we window regardless of item count. */
export const CHAR_BUDGET = 20_000;
/** px assumed for a not-yet-measured row of unknown size. */
export const ESTIMATE = 220;
/** ≈ a 90-char line at ~22px. Only ever a pre-measurement guess, replaced the
 *  moment the row is measured — so it needs to be the right ORDER, not exact. */
export const PX_PER_CHAR = 0.25;
/** Rows kept mounted beyond each edge of the viewport. */
export const OVERSCAN = 6;

/**
 * Is the list too heavy to render whole? Short-circuited: we only ever compare
 * against the budget, so stop as soon as it's blown rather than walking a huge
 * thread. No `sizeOf` ⇒ unknown cost ⇒ count-only gating (unchanged behaviour).
 */
export function overBudget<T>(
  items: T[],
  sizeOf: ((item: T) => number) | undefined,
  budget: number,
): boolean {
  if (!sizeOf) return false;
  let total = 0;
  for (const it of items) {
    total += sizeOf(it);
    if (total > budget) return true;
  }
  return false;
}

/** Render every row directly, or window? Small on BOTH axes = render whole. */
export function rendersWhole<T>(
  items: T[],
  sizeOf: ((item: T) => number) | undefined,
  threshold: number,
  budget: number,
): boolean {
  return items.length <= threshold && !overBudget(items, sizeOf, budget);
}

/**
 * How many rows the FIRST render mounts, before any height is known.
 *
 * Capping this by the char budget is what makes windowing actually pay off for a
 * heavy thread: with a plain count cap, a 25×40k-char conversation still mounts all
 * 25 up front (its count is under the cap) and only narrows on the first recompute —
 * i.e. the expensive commit we're trying to avoid has already happened.
 *
 * Counts from the ANCHORED end, since those are the rows that actually mount.
 */
export function initialWindowSize<T>(
  items: T[],
  sizeOf: ((item: T) => number) | undefined,
  threshold: number,
  budget: number,
  anchor: "top" | "bottom",
): number {
  if (!sizeOf) return threshold;
  const count = items.length;
  let used = 0;
  let n = 0;
  for (let k = 0; k < count && n < threshold; k++) {
    used += sizeOf(items[anchor === "bottom" ? count - 1 - k : k]);
    n++;
    if (used >= budget) break;
  }
  return Math.max(2, n); // always a couple of rows, so a measure pass can start
}
