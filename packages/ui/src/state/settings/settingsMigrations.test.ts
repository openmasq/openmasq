import { describe, it, expect } from "vitest";
import { CATEGORY_DEFAULTS } from "@openmasq/catalog/redaction";
import { migrateRedactCategories } from "./settingsMigrations";
import type { Settings } from "../../types";

const DEFAULTS = { ...CATEGORY_DEFAULTS } as Settings["redactCategories"];

/** The set an installation used to seed BEFORE `apikey` joined the floor. */
const PRE = {
  name: true, dob: true, username: false, email: true, phone: true, address: true,
  location: true, company: true, card: true, iban: true, national_id: true,
  company_id: true, ip: true, path: true, url: false, secret: true, apikey: false,
} as unknown as Settings["redactCategories"];

describe("migrateRedactCategories — `apikey` rejoint le plancher", () => {
  // Settings are persisted IN FULL, so everyone carries an explicit `apikey: false`.
  // Without this recalibration, every user would wake up in « Sur mesure »
  // for a box they never touched.
  it("un jeu EXACTEMENT égal à l'ancien défaut repasse au défaut courant", () => {
    expect(migrateRedactCategories(PRE, DEFAULTS)).toEqual(DEFAULTS);
    expect(migrateRedactCategories(PRE, DEFAULTS).apikey).toBe(true);
  });

  // ⚠️ This is what makes the migration safe: it never GUESSES that an `apikey: false`
  // was inherited passively. One box set by hand and the whole set is left intact.
  it("un jeu réglé à la main n'est PAS touché, même d'une seule case", () => {
    const tuned = { ...PRE, location: false } as Settings["redactCategories"];
    const out = migrateRedactCategories(tuned, DEFAULTS);
    expect(out.location).toBe(false);
    expect(out.apikey).toBe(false); // their choice, preserved
  });

  it("un jeu DÉJÀ au défaut courant traverse sans changer", () => {
    expect(migrateRedactCategories(DEFAULTS, DEFAULTS)).toEqual(DEFAULTS);
  });

  it("une carte absente ou partielle est complétée par les défauts (comportement d'origine)", () => {
    expect(migrateRedactCategories(undefined, DEFAULTS)).toEqual(DEFAULTS);
    const partial = { email: false } as unknown as Settings["redactCategories"];
    const out = migrateRedactCategories(partial, DEFAULTS);
    expect(out.email).toBe(false);
    expect(out.apikey).toBe(true); // the new key takes the default
  });
});
