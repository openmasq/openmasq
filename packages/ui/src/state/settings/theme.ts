import type { Settings } from "../../types";
import { load, SETTINGS_KEY, DEFAULT_SETTINGS } from "../storePersistence";

/**
 * The THEME — a DEVICE preference, not an account one, with a single choosable axis.
 *
 * Pulled out of `storePersistence.ts` the day the accent became imposed (rule 1: this
 * file could no longer grow). Everything that decides « what color the app starts
 * in » lives here, including translating already-persisted green themes.
 */

// The colour theme is a DEVICE preference, so it gets its own UNSCOPED key, written on
// every change. Two things need it and neither has an account: the pre-paint pass (auth
// hasn't resolved) and the SIGNED-OUT scope — signing out doesn't hand the machine to
// someone else, so it must not restyle the app under the user. Falling back to the
// unscoped settings blob there was the bug: that blob stops being written the moment an
// account signs in, so sign-out snapped the app back to whatever theme predated it.
export const THEME_KEY = "openmasq.theme";
export type ThemeName = NonNullable<Settings["theme"]>;
const THEMES: readonly ThemeName[] = ["light", "dark", "blue", "blue-dark"];
const isTheme = (v: unknown): v is ThemeName => THEMES.includes(v as ThemeName);

/**
 * The ACCENT is indigo, period — green is no longer a product option.
 *
 * The theme keeps its two axes, but only one stays choosable: the BACKGROUND (light/dark).
 * This function is the single place that translates a persisted theme into the
 * current accent, because a setting removed from the UI without coercion on load would
 * leave accounts that had green on it stuck there forever, with no surface at all to
 * get out — the same trap as `redactEngine` in `storePersistence.ts`.
 *
 * The TYPE itself keeps `light`/`dark`: a blob written by an earlier version must
 * still be readable. They're simply no longer reachable.
 */
export function blueAccent(theme: ThemeName | undefined): ThemeName {
  return theme === "dark" || theme === "blue-dark" ? "blue-dark" : "blue";
}

/** The theme last applied on THIS device, or undefined when never recorded. */
export function loadDeviceTheme(): ThemeName | undefined {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return isTheme(t) ? blueAccent(t) : undefined;
  } catch {
    return undefined; // localStorage unavailable — the caller falls back
  }
}

export function saveDeviceTheme(theme: ThemeName): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* localStorage unavailable — the in-memory settings still drive the class */
  }
}

/**
 * Set `data-theme` on <html> from the persisted device settings, to be called by the app
 * entry BEFORE the first React render. The store also applies the theme in an effect, but
 * that runs AFTER the first paint — so without this pre-paint pass the splash renders once
 * in the default (green) theme and then snaps to the persisted one (the blue-mode flash).
 * Reads the SAME source as the store's initial `settings` (the DEVICE theme, since auth
 * hasn't resolved yet) so the two never disagree; the unscoped settings blob is only the
 * migration fallback for an install that predates `THEME_KEY`. Idempotent + failure-safe.
 */
export function applyPersistedTheme(): void {
  try {
    const theme = blueAccent(
      loadDeviceTheme() ?? load<Partial<Settings>>(SETTINGS_KEY, {}).theme ?? DEFAULT_SETTINGS.theme,
    );
    const root = document.documentElement;
    if (theme === "dark" || theme === "blue" || theme === "blue-dark") root.setAttribute("data-theme", theme);
    else root.removeAttribute("data-theme");
  } catch {
    /* pre-paint best-effort — the store effect still applies the theme after mount */
  }
}
