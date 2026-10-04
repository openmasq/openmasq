import { app } from "electron";
import { getMessages, isLocale, resolveLocale, type Locale, type Messages } from "@openmasq/i18n";

/**
 * The MAIN process's language: what its native dialogs, menus and pages say.
 *
 * The user's choice lives in the renderer (`Settings.language` + a device key) and reaches
 * main over `app:set-locale` (`ipc/registerAppIpc.ts`). Until it arrives (a dialog at boot,
 * before any window), main reads the OS language, then falls back to English.
 *
 * ⚠️ A DISPLAY preference, never an input to a security decision: the renderer is
 * untrusted, so the value is ALLOW-LISTED to the catalogue's own locales — anything else
 * is refused and the current language kept.
 */
let chosen: Locale | null = null;

/** The OS language reduced to a shipped locale, or null (before `ready`, or unknown). */
function systemLocale(): Locale | null {
  try {
    return resolveLocale(app.getLocale());
  } catch {
    return null; // no `app` (tests) or not ready yet
  }
}

/** The language main speaks right now. */
export function mainLocale(): Locale {
  return chosen ?? systemLocale() ?? "en";
}

/** The catalogue in that language. Read at the moment the text is built, never cached. */
export function mainMessages(): Messages {
  return getMessages(mainLocale());
}

/** Record the user's language. `true` if accepted; anything not EXACTLY a shipped locale
 *  is refused and changes nothing. */
export function setMainLocale(tag: unknown): boolean {
  if (!isLocale(tag)) return false;
  chosen = tag;
  return true;
}

/** Test seam. */
export function _resetMainLocale(): void {
  chosen = null;
}
