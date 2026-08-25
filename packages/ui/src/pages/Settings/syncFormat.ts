/** Les aides PURES de la section Synchronisation — sorties de `SyncSection.tsx` (cap 300). */

export const PLATFORM_LABEL: Record<string, string> = {
  desktop: "Ordinateur",
  extension: "Navigateur",
  mobile: "Mobile",
  web: "Web",
};

/** Compact French relative time from an epoch-ms timestamp. */
export function relTime(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return "à l'instant";
  const min = Math.round(s / 60);
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "hier" : `il y a ${d} j`;
}
