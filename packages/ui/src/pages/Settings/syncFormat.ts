import type { Messages } from "@openmasq/i18n";

/** Le nom lisible d'une plateforme d'appareil, dans la langue de `t`. */
export function platformLabel(platform: string, t: Messages): string | undefined {
  return (t.syncTab.platforms as Record<string, string | undefined>)[platform];
}

/** « à l'instant » / « il y a 3 min » / « hier » — un instant relatif, court. */
export function relTime(ts: number, t: Messages, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return t.syncTab.justNow;
  const min = Math.round(s / 60);
  if (min < 60) return t.syncTab.minutesAgo(min);
  const h = Math.round(min / 60);
  if (h < 24) return t.syncTab.hoursAgo(h);
  const d = Math.round(h / 24);
  return d === 1 ? t.syncTab.yesterday : t.syncTab.daysAgo(d);
}
