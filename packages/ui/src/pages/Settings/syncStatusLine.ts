import type { Messages } from "@openmasq/i18n";
import type { SyncStatusSnapshot } from "../../host";

export type SyncTone = "ok" | "err" | "muted";

export function syncStatusLine(
  s: SyncStatusSnapshot,
  t: Messages,
  now = Date.now(),
): { text: string; tone: SyncTone } {
  const rel = (ts: number): string => {
    const sec = Math.max(0, Math.round((now - ts) / 1000));
    if (sec < 60) return t.syncTab.justNow;
    const min = Math.round(sec / 60);
    if (min < 60) return t.syncTab.minutesAgo(min);
    const h = Math.round(min / 60);
    if (h < 24) return t.syncTab.hoursAgo(h);
    return t.syncTab.daysAgo(Math.round(h / 24));
  };

  const failing = s.lastErrorAt !== null && (s.lastOkAt === null || s.lastErrorAt > s.lastOkAt);
  if (failing) {
    const reason = s.lastError ?? t.syncTab.failure;
    const tail = s.lastErrorFatal ? t.syncTab.failureMismatch : t.syncTab.failureRetry;
    return { text: t.syncTab.failedAt(rel(s.lastErrorAt!), reason, tail), tone: "err" };
  }
  if (s.lastOkAt !== null) return { text: t.syncTab.lastOk(rel(s.lastOkAt)), tone: "ok" };
  return { text: t.syncTab.noExchange, tone: "muted" };
}
