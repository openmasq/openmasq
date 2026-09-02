import type { Settings } from "../../types";
import { load, SETTINGS_KEY, DEFAULT_SETTINGS } from "../storePersistence";

/**
 * The THEME — a DEVICE preference, not an account one, with ONE axis: the ground.
 *
 * Pulled out of `storePersistence.ts` the day the accent became imposed (rule 1: this
 * file could no longer grow). Everything that decides « what color the app starts
 * in » lives here, including reading the theme NAMES an earlier version persisted.
 */

// The colour theme is a DEVICE preference, so it gets its own UNSCOPED key, written on
// every change. Two things need it and neither has an account: the pre-paint pass (auth
// hasn't resolved) and the SIGNED-OUT scope — signing out doesn't hand the machine to
// someone else, so it must not restyle the app under the user. Falling back to the
// unscoped settings blob there was the bug: that blob stops being written the moment an
// account signs in, so sign-out snapped the app back to whatever theme predated it.
export const THEME_KEY = "openmasq.theme";
export type ThemeName = NonNullable<Settings["theme"]>;

/**
 * Read a persisted theme value TOLERANTLY — `undefined` for anything that is not one.
 *
 * The product has two themes, `light` and `dark`, and no coercion: the stylesheet's
 * bare `:root` IS the light theme, `[data-theme="dark"]` the dark one. But an earlier
 * version persisted the accent as part of the name (`blue` = light, `blue-dark` = dark,
 * the only two it could write). Those blobs and device keys are still out there, so the
 * old names are READ as the ground they meant rather than dropped — dropping them would
 * snap every existing install back to light on its next start. `theme.test.ts` pins it.
 */
export function readTheme(v: unknown): ThemeName | undefined {
  if (v === "dark" || v === "blue-dark") return "dark";
  if (v === "light" || v === "blue") return "light";
  return undefined;
}

/** The theme last applied on THIS device, or undefined when never recorded. */
export function loadDeviceTheme(): ThemeName | undefined {
  try {
    return readTheme(localStorage.getItem(THEME_KEY));
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
 * in the light theme and then snaps to the persisted one (the dark-mode flash).
 * Reads the SAME source as the store's initial `settings` (the DEVICE theme, since auth
 * hasn't resolved yet) so the two never disagree; the unscoped settings blob is only the
 * migration fallback for an install that predates `THEME_KEY`. Idempotent + failure-safe.
 */
export function applyPersistedTheme(): void {
  try {
    const theme =
      loadDeviceTheme() ??
      readTheme(load<Partial<Settings>>(SETTINGS_KEY, {}).theme) ??
      DEFAULT_SETTINGS.theme;
    const root = document.documentElement;
    if (theme === "dark") root.setAttribute("data-theme", "dark");
    else root.removeAttribute("data-theme");
  } catch {
    /* pre-paint best-effort — the store effect still applies the theme after mount */
  }
}
