import type { ModelDay } from "./usageActivity";

/** How many models get a color of their own. The ramp offers seven
 *  (`--chart-1..7`); we show FIVE, because beyond that a legend stops being read
 *  and a sixth flat tone takes the room needed to distinguish the first five. */
export const NAMED_SERIES = 5;

/** The "everything else" bucket. Its label is product copy, not data. */
export const OTHER_ID = "__other__";

export interface Series {
  /** Model id, or `OTHER_ID`. */
  id: string;
  /** The CSS token to paint — `var(--chart-N)` or `var(--chart-other)`. */
  color: string;
  /** Total over the window, for the legend's order and its count. */
  total: number;
}

/**
 * **Which series the timeline draws, and in what color.**
 *
 * The five most-used models over the window each get a shade from the
 * categorical ramp; everyone else melts into "Autres". It's the rule the
 * ramp itself states (`styles.css`): seven slots assigned in a FIXED ORDER
 * and never cycled — repainting an eighth series with the first one's color would be
 * worse than admitting it's "other".
 *
 * ⚠️ **The color follows the MODEL, never its display rank.** Two models stay
 * distinct even when one overtakes the other: the slot is assigned once,
 * on the window's ranking, and `colorOf` re-reads it by id. Accepted and measurable
 * residual: changing the window (7 → 90 days) can change WHO is in the top 5, hence
 * recoloring. The alternative — freezing colors over the whole history — would make a
 * short window draw five "other" series without naming any of them, which is the
 * opposite bug, and worse.
 *
 * ⚠️ **A model ABSENT from the window has no series.** We don't paint a line at
 * zero: a legend naming five models of which three sent nothing makes you look
 * for flat tones that don't exist.
 *
 * Pure — `usageSeries.test.ts`.
 */
export function buildSeries(days: ModelDay[], models: string[]): Series[] {
  const totals = new Map<string, number>();
  for (const d of days) {
    for (const [id, n] of Object.entries(d.byModel)) {
      if (n > 0) totals.set(id, (totals.get(id) ?? 0) + n);
    }
  }
  // `models` already carries the descending-volume order; we filter it against what the
  // window ACTUALLY contains rather than redo a sort that could diverge from it.
  const present = models.filter((m) => (totals.get(m) ?? 0) > 0);
  const named = present.slice(0, NAMED_SERIES);
  const rest = present.slice(NAMED_SERIES);

  const out: Series[] = named.map((id, i) => ({
    id,
    color: `var(--chart-${i + 1})`,
    total: totals.get(id) ?? 0,
  }));
  if (rest.length) {
    out.push({
      id: OTHER_ID,
      color: "var(--chart-other)",
      total: rest.reduce((s, m) => s + (totals.get(m) ?? 0), 0),
    });
  }
  return out;
}

/** A series' count for a day — "Autres" adds up everything that isn't named. */
export function dayCount(day: ModelDay, s: Series, named: ReadonlySet<string>): number {
  if (s.id !== OTHER_ID) return day.byModel[s.id] ?? 0;
  let n = 0;
  for (const [id, c] of Object.entries(day.byModel)) if (!named.has(id)) n += c;
  return n;
}

/**
 * `model id → color token`, for any surface that must AGREE with the
 * chart — the "Usage par modèle" list below it, first of all. Two neighboring panels
 * that paint the same model in two different colors are worse than a single panel.
 * A model outside the top 5 renders as neutral, exactly like its share in the bar.
 */
export function seriesColors(series: Series[]): Map<string, string> {
  return new Map(series.map((s) => [s.id, s.color]));
}
