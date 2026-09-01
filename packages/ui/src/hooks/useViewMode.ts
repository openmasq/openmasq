import { useCallback, useEffect, useState } from "react";
import { BRAND } from "@openmasq/branding";

/** Card grid, or dense rows. Two values, not three: a third mode costs a decision on
 *  every screen and nobody asked for it. */
export type ViewMode = "grid" | "list";

/** Screens that list the user's OBJECTS. The scope is closed on purpose: a free-form
 *  string would let two screens share a preference by accident. */
export type ViewScope = "library" | "competences" | "workflows";

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
 * consequence if storage is missing — we fall back to grid without breaking
 * anything.
 *
 * ⚠️ An unknown value (older build, tampered storage) falls back to `"grid"`: we
 * never render a mode the screen doesn't know how to draw.
 */
export function useViewMode(scope: ViewScope): [ViewMode, (m: ViewMode) => void] {
  const [mode, setMode] = useState<ViewMode>(() => read(scope));

  // The scope can change if a screen is reused for two datasets: re-read, otherwise
  // the second would silently inherit the first's preference.
  useEffect(() => {
    setMode(read(scope));
  }, [scope]);

  const set = useCallback(
    (m: ViewMode) => {
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

function read(scope: ViewScope): ViewMode {
  try {
    return localStorage.getItem(KEY(scope)) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}
