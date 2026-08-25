const DAY_MS = 86_400_000;

/** One redaction entry the timeline buckets: when it was protected + its category. */
export interface RedactionAt {
  at: number;
  kind: string;
}

/** One day's stacked bar: total values redacted, split per category. */
export interface CatDay {
  total: number;
  byCat: Record<string, number>;
}

/**
 * Per-day, per-CATEGORY counts of redacted values over the last `days` days (index 0 =
 * oldest, last = today). Each entry is bucketed by its own `at` timestamp — for the audit
 * that is the conversation's `updatedAt` (the persisted schema carries no per-value time),
 * the same honest signal the audit list already sorts on. `cats` is the set of categories
 * present, ordered by total desc — the stable order the caller uses for colour + legend.
 * Pure (unit-tested); UTC calendar days. Fed the SAME rows as the audit list, so the
 * chart's totals always agree with the "N éléments redacted" count.
 */
export function dailyRedactionsByCategory(
  entries: RedactionAt[],
  days = 14,
): { days: CatDay[]; cats: string[] } {
  const out: CatDay[] = Array.from({ length: days }, () => ({ total: 0, byCat: {} }));
  const now = Date.now();
  const startOfToday = now - (now % DAY_MS);
  const start = startOfToday - (days - 1) * DAY_MS;
  const totals = new Map<string, number>();
  for (const e of entries) {
    if (!e.at || e.at < start) continue;
    const idx = Math.floor((e.at - start) / DAY_MS);
    if (idx < 0 || idx >= days) continue;
    out[idx].total += 1;
    out[idx].byCat[e.kind] = (out[idx].byCat[e.kind] ?? 0) + 1;
    totals.set(e.kind, (totals.get(e.kind) ?? 0) + 1);
  }
  const cats = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  return { days: out, cats };
}
