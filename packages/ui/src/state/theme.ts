import type { Settings } from "../types";
import { load, SETTINGS_KEY, DEFAULT_SETTINGS } from "./storePersistence";
import { migrateLegacyLocalStorage } from "./legacyStorage";

/**
 * Le THÈME — une préférence d'APPAREIL, pas de compte, et un seul axe au choix.
 *
 * Sorti de `storePersistence.ts` le jour où l'accent est devenu imposé (règle 1 : ce
 * fichier ne pouvait plus grossir). Tout ce qui décide « de quelle couleur démarre
 * l'app » vit donc ici, y compris la traduction des thèmes verts déjà enregistrés.
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
 * L'ACCENT est l'indigo, point — le vert n'est plus une option du produit.
 *
 * Le thème garde ses deux axes, mais un seul reste au choix : le FOND (clair/sombre).
 * Cette fonction est l'unique endroit qui traduit un thème persisté vers l'accent
 * courant, parce qu'un réglage retiré de l'UI sans coercition au chargement laisserait
 * les comptes qui avaient le vert dessus pour toujours, sans aucune surface pour en
 * sortir — le même piège que `redactEngine` dans `storePersistence.ts`.
 *
 * Le TYPE, lui, garde `light`/`dark` : un blob écrit par une version antérieure doit
 * encore se lire. Ils ne sont simplement plus atteignables.
 */
export function blueAccent(theme: ThemeName | undefined): ThemeName {
  return theme === "dark" || theme === "blue-dark" ? "blue-dark" : "blue";
}

/** The theme last applied on THIS device, or undefined when never recorded. */
export function loadDeviceTheme(): ThemeName | undefined {
  migrateLegacyLocalStorage(); // premier lecteur au boot — les clés d'avant le renommage
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
