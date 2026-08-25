/**
 * Le vocabulaire de TON des retours à l'utilisateur — un nom sémantique, son glyphe.
 *
 * Deux surfaces le portent et doivent le porter PAREIL : `Banner` (pleine largeur, dans
 * le flux) et `StatusChip` (la pastille d'état, flottante). Un ton ajouté ici s'habille
 * des deux côtés d'un coup ; sa COULEUR, elle, vit une seule fois en CSS
 * (`.kb--<ton>` définit `--ac`/`--bg`, que la pastille réutilise telle quelle).
 */
export type BannerTone = "error" | "warning" | "success" | "info" | "redact";

export interface BannerAction {
  label: string;
  onClick: () => void;
  variant?: "solid" | "ghost";
}

/* Glyphes Lucide en ligne (aucun asset, aucune requête — cf. components/CLAUDE.md). */
const stroke = {
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 2.2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const BANNER_ICONS: Record<BannerTone, JSX.Element> = {
  error: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4M12 16h.01" />
    </svg>
  ),
  warning: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  ),
  success: (
    <svg viewBox="0 0 24 24" {...stroke} strokeWidth={2.4}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  ),
  info: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  ),
  redact: (
    <svg viewBox="0 0 24 24" {...stroke} strokeWidth={2}>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    </svg>
  ),
};
