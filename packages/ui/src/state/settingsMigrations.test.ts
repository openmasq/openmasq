import { describe, it, expect } from "vitest";
import { CATEGORY_DEFAULTS } from "@openmasq/catalog/redaction";
import { migrateRedactCategories } from "./settingsMigrations";
import type { Settings } from "../types";

const DEFAULTS = { ...CATEGORY_DEFAULTS } as Settings["redactCategories"];

/** Le jeu qu'une installation seedait AVANT que `apikey` rejoigne le plancher. */
const PRE = {
  name: true, dob: true, username: false, email: true, phone: true, address: true,
  location: true, company: true, card: true, iban: true, national_id: true,
  company_id: true, ip: true, path: true, url: false, secret: true, apikey: false,
} as unknown as Settings["redactCategories"];

describe("migrateRedactCategories — `apikey` rejoint le plancher", () => {
  // Les réglages sont persistés EN ENTIER, donc tout le monde porte un `apikey: false`
  // explicite. Sans ce recalage, chaque utilisateur se réveillerait en « Sur mesure »
  // pour une case qu'il n'a jamais touchée.
  it("un jeu EXACTEMENT égal à l'ancien défaut repasse au défaut courant", () => {
    expect(migrateRedactCategories(PRE, DEFAULTS)).toEqual(DEFAULTS);
    expect(migrateRedactCategories(PRE, DEFAULTS).apikey).toBe(true);
  });

  // ⚠️ C'est ce qui rend la migration sûre : elle ne DEVINE jamais qu'un `apikey: false`
  // était subi. Une seule case réglée à la main et le jeu est laissé intact.
  it("un jeu réglé à la main n'est PAS touché, même d'une seule case", () => {
    const tuned = { ...PRE, location: false } as Settings["redactCategories"];
    const out = migrateRedactCategories(tuned, DEFAULTS);
    expect(out.location).toBe(false);
    expect(out.apikey).toBe(false); // son choix, préservé
  });

  it("un jeu DÉJÀ au défaut courant traverse sans changer", () => {
    expect(migrateRedactCategories(DEFAULTS, DEFAULTS)).toEqual(DEFAULTS);
  });

  it("une carte absente ou partielle est complétée par les défauts (comportement d'origine)", () => {
    expect(migrateRedactCategories(undefined, DEFAULTS)).toEqual(DEFAULTS);
    const partial = { email: false } as unknown as Settings["redactCategories"];
    const out = migrateRedactCategories(partial, DEFAULTS);
    expect(out.email).toBe(false);
    expect(out.apikey).toBe(true); // la clé nouvelle prend le défaut
  });
});
