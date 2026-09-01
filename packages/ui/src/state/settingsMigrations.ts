import type { Settings } from "../types";

/**
 * SETTINGS migrations — the one-off recalibrations a persisted blob must undergo when
 * the product changes a default value out from under it.
 *
 * They live apart from `storePersistence.ts` because they don't look alike: each one
 * is dated, carries its own "before", and only makes sense once. Mixing them with the
 * permanent normalization made both unreadable.
 */

/**
 * The category set an install SEEDED before "Chaînes type clé" (`apikey`) joined the
 * floor common to all levels.
 *
 * It's here for a precise reason: settings are persisted IN FULL from
 * `DEFAULT_SETTINGS`, so every user carries an explicit `apikey: false`. Without this
 * migration, all of them would wake up on "Sur mesure" — neither Standard, nor
 * Renforcé, nor Strict — for a setting they never touched. Exactly the silent
 * renaming that `levelOf` otherwise forbids itself.
 *
 * The match is EXACT, and that's what makes it safe: only a set identical to that
 * era's default is moved. Someone who had set a single checkbox stays on "sur
 * mesure" — we never guess that an `apikey: false` was suffered rather than chosen.
 */
const PRE_APIKEY_FLOOR_DEFAULTS: Record<string, boolean> = {
  name: true, dob: true, username: false, email: true, phone: true, address: true,
  location: true, company: true, card: true, iban: true, national_id: true,
  company_id: true, ip: true, path: true, url: false, secret: true, apikey: false,
};

/** The set above, identical — except for `apikey`, now in the floor. */
function isPreApikeyFloorDefault(cats: Record<string, boolean> | undefined): boolean {
  if (!cats) return false;
  const keys = Object.keys(PRE_APIKEY_FLOOR_DEFAULTS);
  if (Object.keys(cats).length !== keys.length) return false;
  return keys.every((k) => cats[k] === PRE_APIKEY_FLOOR_DEFAULTS[k]);
}


/** Applies the migrations to the category map. `defaults` is the current seed. */
export function migrateRedactCategories(
  saved: Settings["redactCategories"] | undefined,
  defaults: Settings["redactCategories"],
): Settings["redactCategories"] {
  if (isPreApikeyFloorDefault(saved as Record<string, boolean> | undefined)) {
    return { ...defaults };
  }
  return { ...defaults, ...(saved ?? {}) } as Settings["redactCategories"];
}
