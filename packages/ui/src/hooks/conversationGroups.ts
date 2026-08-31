import type { Messages } from "@openmasq/i18n";
import type { Conversation } from "../types";

/** One date bucket of conversations, ordered most-recent first. */
export interface ConvGroup {
  key: string;
  label: string;
  items: Conversation[];
}

const DAY_MS = 86_400_000;

/** Local start-of-day (midnight) for an epoch-ms timestamp. */
function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** "mars 2026" → "Mars 2026". */
function monthLabel(ts: number, t: Messages): string {
  const s = new Date(ts).toLocaleDateString(t.common.intlTag, {
    month: "long",
    year: "numeric",
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Compact relative time for a conversation row, e.g. "3m", "2h", "Hier", "lun.".
 *  Shared by the desktop `Sidebar` and the mobile chat list. */
export function relTime(ts: number, t: Messages): string {
  const diff = Date.now() - ts;
  const min = diff / 60000;
  if (min < 1) return t.chrome.justNow;
  if (min < 60) return `${Math.round(min)}m`;
  const h = min / 60;
  if (h < 24) return `${Math.round(h)}h`;
  const d = h / 24;
  if (d < 2) return t.chrome.groups.yesterday;
  if (d < 7)
    return new Date(ts).toLocaleDateString(t.common.intlTag, { weekday: "short" });
  return new Date(ts).toLocaleDateString(t.common.intlTag, {
    day: "numeric",
    month: "short",
  });
}

/**
 * Bucket conversations by `updatedAt` into date ranges:
 * Aujourd'hui / Hier / 7 derniers jours / 30 derniers jours / then by month.
 * Input order is preserved (the store already sorts recent→old); only non-empty
 * groups are returned, ordered most-recent first. Pure + testable.
 */
export function groupConversationsByDate(
  convs: Conversation[],
  t: Messages,
  now: number = Date.now(),
): ConvGroup[] {
  const todayStart = startOfDay(now);
  const groups: ConvGroup[] = [];
  const byKey = new Map<string, ConvGroup>();

  const bucketFor = (ts: number): { key: string; label: string } => {
    const daysAgo = Math.floor((todayStart - startOfDay(ts)) / DAY_MS);
    if (daysAgo <= 0) return { key: "today", label: t.chrome.groups.today };
    if (daysAgo === 1) return { key: "yesterday", label: t.chrome.groups.yesterday };
    if (daysAgo <= 7) return { key: "7d", label: t.chrome.groups.last7 };
    if (daysAgo <= 30) return { key: "30d", label: t.chrome.groups.last30 };
    const d = new Date(ts);
    return { key: `m-${d.getFullYear()}-${d.getMonth()}`, label: monthLabel(ts, t) };
  };

  for (const c of convs) {
    const { key, label } = bucketFor(c.updatedAt);
    let g = byKey.get(key);
    if (!g) {
      g = { key, label, items: [] };
      byKey.set(key, g);
      groups.push(g);
    }
    g.items.push(c);
  }

  return groups;
}
