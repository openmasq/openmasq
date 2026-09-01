import type { Conversation } from "../../../types";
import type { BilledFilter } from "../../../state/billing/usage";

const DAY_MS = 86_400_000;

/** One day's stacked bar: total assistant turns, split per model id. */
export interface ModelDay {
  total: number;
  byModel: Record<string, number>;
}

/**
 * Per-day, per-model MESSAGE counts over the last `days` days (index 0 = oldest,
 * last = today), filtered by billing path. Each assistant turn carrying `usage` is
 * bucketed by its own `at` timestamp, falling back to the conversation's `updatedAt`
 * for turns persisted before per-message timestamps existed (honest, never invented).
 * `models` is the set of model ids present, ordered by total count desc — the stable
 * order the caller uses for colour + legend. Pure (unit-tested); UTC calendar days.
 */
export function dailyModelMessages(
  conversations: Conversation[],
  days = 14,
  billed: BilledFilter = "all",
): { days: ModelDay[]; models: string[] } {
  const out: ModelDay[] = Array.from({ length: days }, () => ({ total: 0, byModel: {} }));
  const now = Date.now();
  const startOfToday = now - (now % DAY_MS);
  const start = startOfToday - (days - 1) * DAY_MS;
  const totals = new Map<string, number>();
  for (const c of conversations) {
    for (const m of c.messages) {
      if (!m.usage) continue;
      if (billed !== "all" && m.usage.billed !== billed) continue;
      const t = m.at ?? c.updatedAt;
      if (!t || t < start) continue;
      const idx = Math.floor((t - start) / DAY_MS);
      if (idx < 0 || idx >= days) continue;
      const model = m.usage.model;
      out[idx].total += 1;
      out[idx].byModel[model] = (out[idx].byModel[model] ?? 0) + 1;
      totals.set(model, (totals.get(model) ?? 0) + 1);
    }
  }
  const models = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([m]) => m);
  return { days: out, models };
}

/**
 * Real daily ACTIVITY counts over the last `days` days (index 0 = oldest bucket,
 * last = today), from each conversation's `updatedAt` (a conversation counts on the
 * day it was last touched — the persisted schema carries no per-message timestamp,
 * so this is the honest available signal). Pure so it can be unit-tested; `Date.now()`
 * is fine here (renderer code, not a workflow script). Buckets are UTC calendar days.
 */
export function dailyActivityCounts(conversations: Conversation[], days = 14): number[] {
  const out = new Array<number>(days).fill(0);
  const now = Date.now();
  const startOfToday = now - (now % DAY_MS); // UTC midnight of today
  const start = startOfToday - (days - 1) * DAY_MS;
  for (const c of conversations) {
    const t = c.updatedAt;
    if (!t || t < start) continue;
    const idx = Math.floor((t - start) / DAY_MS);
    if (idx >= 0 && idx < days) out[idx] += 1;
  }
  return out;
}

/**
 * Build the SVG point string for a sparkline over `values`, fit to a `w`×`h` box
 * with a small vertical padding. When every value is equal (incl. all-zero) the
 * line sits flat at mid-height instead of producing NaN.
 */
export function sparkPoints(values: number[], w: number, h: number): string {
  if (values.length === 0) return `0,${h / 2} ${w},${h / 2}`;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min;
  const n = values.length;
  return values
    .map((v, i) => {
      const x = n > 1 ? (i / (n - 1)) * w : w / 2;
      const y = span > 0 ? h - ((v - min) / span) * (h - 8) - 4 : h / 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}
