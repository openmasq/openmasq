import { useCallback, useEffect, useState } from "react";
import { BRAND } from "@openmasq/branding";

/**
 * Each screen's modes, FIRST = the default. Two values per screen, not three: a third
 * mode costs a decision on every screen and nobody asked for it. The Mémoire's pair is
 * different in kind — the list FINDS, the graph EXPLAINS — and opens on the list because
 * at 50+ cards the daily gesture is a scan, not a glance.
 *
 * The scope is closed on purpose: a free-form string would let two screens share a
 * preference by accident.
 */
export const VIEW_MODES = {
  library: ["grid", "list"],
  competences: ["grid", "list"],
  workflows: ["grid", "list"],
  memory: ["list", "graph"],
} as const;

export type ViewScope = keyof typeof VIEW_MODES;
/** The modes ONE screen knows how to draw. */
export type ViewModeOf<S extends ViewScope> = (typeof VIEW_MODES)[S][number];
/** Card grid, or dense rows — the pair `ViewModeToggle` draws. */
export type ViewMode = ViewModeOf<"library">;
/** What the hook hands back: the mode, and its setter. */
type ViewModePair<S extends ViewScope> = [
  ViewModeOf<S>,
  (m: ViewModeOf<S>) => void,
];

const KEY = (scope: ViewScope): string => `${BRAND.slug}.view.${scope}`;

/**
 * A screen's display mode, remembered across sessions.
 *
 * PER SCREEN, never globally: an image library is looked at as thumbnails, a
 * skills list is read as rows, and forcing the same choice on both forces
 * re-doing it on every back-and-forth.
 *
 * It lives in `localStorage` and not in Réglages because it's a VIEW preference,
 * not data: it doesn't sync, doesn't get encrypted, and its absence isn't a loss.
 * Same shelf as the current section and the layout (`state/reduxBoot.ts`), same
 * consequence if storage is missing — we fall back to the default without breaking
 * anything.
 *
 * ⚠️ An unknown value (older build, tampered storage) falls back to the screen's
 * DEFAULT: we never render a mode the screen doesn't know how to draw.
 */
export function useViewMode<S extends ViewScope>(
  scope: S,
): ViewModePair<S> {
  const [mode, setMode] = useState<ViewModeOf<S>>(() => read(scope));

  // The scope can change if a screen is reused for two datasets: re-read, otherwise
  // the second would silently inherit the first's preference.
  useEffect(() => {
    setMode(read(scope));
  }, [scope]);

  const set = useCallback(
    (m: ViewModeOf<S>) => {
      setMode(m);
      try {
        localStorage.setItem(KEY(scope), m);
      } catch {
        /* storage unavailable (restricted web preview) — the view works, it just isn't remembered */
      }
    },
    [scope],
  );

  return [mode, set];
}

function read<S extends ViewScope>(
  scope: S,
): ViewModeOf<S> {
  const modes: readonly string[] = VIEW_MODES[scope];
  try {
    const stored = localStorage.getItem(KEY(scope));
    return (stored && modes.includes(stored) ? stored : modes[0]) as ViewModeOf<S>;
  } catch {
    return modes[0] as ViewModeOf<S>;
  }
}
