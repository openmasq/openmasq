import { CONV_KEY, SETTINGS_KEY } from "../../state/storePersistence";

/**
 * Has an account ALREADY been signed in on this device?
 *
 * The login card's title depends on it: « Content de vous revoir » is a lie on a fresh
 * install, so a device that has never seen an account gets the neutral
 * « Connexion à … ». Nothing is written for this — the trace is what signing in already
 * leaves: conversation and settings storage are SCOPED per account
 * (`storePersistence.ts` `convKeyFor` / `settingsKeyFor`, `…:<uid>`), so an
 * account-scoped key in localStorage is proof an account was adopted here, and the
 * unscoped pre-auth blob proves nothing. Pure over an injected storage, for the test.
 */
export function hasSeenAccountOnDevice(storage: Pick<Storage, "length" | "key"> | null = safeStorage()): boolean {
  if (!storage) return false;
  const prefixes = [`${CONV_KEY}:`, `${SETTINGS_KEY}:`];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k && prefixes.some((p) => k.startsWith(p))) return true;
  }
  return false;
}

/** `localStorage` can throw (blocked storage, some previews): unknown reads as "never seen". */
function safeStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
