import type { Settings } from "../../types";
import { DEFAULT_SETTINGS, normalizeSettings } from "../storePersistence";
import type { ThemeName } from "./theme";

/**
 * The settings to adopt when the signed-in account changes — `stored` is that account's
 * persisted blob (the UNSCOPED one when signed out), merged over the defaults.
 *
 * The one field that does NOT follow the account is the **theme**: it is a device
 * preference, and signing out is not becoming another user. `deviceTheme` (the theme
 * last applied on this machine) therefore wins for the signed-OUT scope, where `stored`
 * is the pre-account blob nothing has written since the account signed in — that stale
 * value is what used to strip the user's theme the instant they logged out. Signing IN
 * still honours the account's own theme, so a synced/per-account choice is unaffected.
 */
export function adoptSettings(
  userId: string | null,
  stored: Partial<Settings>,
  deviceTheme?: ThemeName,
): Settings {
  return normalizeSettings({
    ...DEFAULT_SETTINGS,
    ...stored,
    ...(userId ? {} : { theme: deviceTheme ?? stored.theme ?? DEFAULT_SETTINGS.theme }),
  });
}

/**
 * Decide the settings value once the async per-account DB hydrate resolves.
 *
 * The local DB is the source of truth for settings ACROSS reloads, so on a clean
 * account adoption its blob wins (it restores what was last saved). But the hydrate
 * is ASYNC — it lands after `host.db.load()` — and the user can change settings in
 * that window. The clearest case is FIRST-RUN onboarding, which writes the redaction
 * categories: a blanket `{ ...current, ...db }` merge would then silently overwrite
 * those fresh choices with the older DB blob, so they never show up in "Compte".
 *
 * So the DB blob is taken ONLY when `current` is still the exact object adoption set
 * (`current === adopted`, i.e. nothing changed settings since). If the user — or any
 * effect — mutated settings in the meantime, we keep THAT value: it is newer than the
 * blob we loaded, and the persist + DB-mirror effects save it back. Identity, not deep
 * equality, is deliberate: adoption hands us one specific object, and every mutation
 * mints a new one.
 */
export function reconcileDbSettings(
  current: Settings,
  adopted: Settings,
  dbSettings: Partial<Settings> | null | undefined,
): Settings {
  if (!dbSettings) return current;
  if (current !== adopted) return current; // edited since adopt — don't clobber the edit
  return normalizeSettings({ ...current, ...dbSettings });
}
