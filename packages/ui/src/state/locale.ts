import { DEFAULT_LOCALE, resolveLocale, type Locale } from "@openmasq/i18n";

/**
 * The LANGUAGE — a DEVICE preference, exactly like the THEME (`theme.ts`), and for
 * the same reason: it must be known BEFORE the first paint (otherwise a language
 * flash) and BEFORE auth has resolved (the login screen is already in a language).
 *
 * Two stores, mirroring the theme: an UNSCOPED localStorage key (read at boot,
 * account-independent) and a `Settings.language` field (for the UI and cross-device
 * sync). `applyPersistedLocale` copies the setting back to the device key, so
 * that the next startup reads the right language before the settings blob is
 * loaded.
 *
 * ⚠️ The fallback is NEVER a blank screen: device key → host language
 * (`navigator.language`) → `DEFAULT_LOCALE` (French, the source language).
 */
export const LOCALE_KEY = "openmasq.language";

/** The language recorded on THIS device, or `null` if never set. */
export function loadDeviceLocale(): Locale | null {
  try {
    return resolveLocale(localStorage.getItem(LOCALE_KEY));
  } catch {
    return null; // localStorage unavailable — the caller falls back on its own
  }
}

export function saveDeviceLocale(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    /* localStorage unavailable — the in-memory language still drives the app */
  }
}

/** The HOST's language (browser / OS), resolved to a shipped locale, or `null`. */
export function hostLocale(): Locale | null {
  try {
    const nav = (globalThis as { navigator?: { language?: string } }).navigator;
    return resolveLocale(nav?.language);
  } catch {
    return null;
  }
}

/**
 * The language to use AT BOOT, in order: what the device remembered, else the
 * host language, else the default. This is the provider's initial state
 * (`I18nProvider`) — a single decision, reused if pre-paint ever comes back (rule 9).
 * `<html lang>` is set BY the provider (effect), not here: the boot splash is static
 * HTML with no translatable text, so there's nothing to do before the first paint.
 */
export function initialLocale(): Locale {
  return loadDeviceLocale() ?? hostLocale() ?? DEFAULT_LOCALE;
}
