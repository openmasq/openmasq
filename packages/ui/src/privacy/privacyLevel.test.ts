import { getMessages } from "@openmasq/i18n";
import { describe, it, expect } from "vitest";
import { CATEGORY_DEFAULTS, REDACT_CATEGORIES } from "./redactCategories";
import {
  activeCount,
  ALWAYS_ON,
  categoriesForLevel,
  levelOf,
  NOTORIOUS_COMMERCIAL_ORGS,
  NOTORIOUS_PEOPLE,
  notorietyForLevel,
  privacyLevelMeta,
  TOTAL_CATEGORIES,
} from "./privacyLevel";
import type { RedactCategoryKey, Settings } from "../types";

const KEYS = REDACT_CATEGORIES.map((c) => c.key as RedactCategoryKey);
const cats = (over: Record<string, boolean> = {}): Settings["redactCategories"] =>
  ({ ...CATEGORY_DEFAULTS, ...over }) as Settings["redactCategories"];

/* The scale as a screen sees it. This file tests what the levels DO — which
   categories they turn on — so the language of their labels is irrelevant to it; the
   English catalogue is verified where it matters, by `locale.test.ts` (completeness) and by
   the screen tests. */
const LEVELS = privacyLevelMeta(getMessages("fr"));

describe("privacyLevel — one choice instead of seventeen", () => {
  it("round-trips: the map a level produces reads back as that level", () => {
    expect(levelOf(categoriesForLevel("standard"))).toBe("standard");
    expect(levelOf(categoriesForLevel("renforce"))).toBe("renforce");
    expect(levelOf(categoriesForLevel("strict"))).toBe("strict");
  });

  it("strict turns every category on", () => {
    const strict = categoriesForLevel("strict");
    expect(KEYS.every((k) => strict[k] === true)).toBe(true);
    expect(activeCount(strict)).toBe(TOTAL_CATEGORIES);
  });

  it("an EMPTY map is Renforcé, not « sur mesure » (a missing key means default)", () => {
    // A settings blob written before a category existed must not be renamed on upgrade.
    // « Renforcé » is what the DEFAULTS amount to — the level a fresh install lands on.
    expect(levelOf(undefined)).toBe("renforce");
    expect(levelOf({} as Settings["redactCategories"])).toBe("renforce");
  });

  it("one hand-tuned category ⇒ « sur mesure », and the choices are NOT rewritten", () => {
    const off = KEYS.find((k) => CATEGORY_DEFAULTS[k] !== false)!;
    const tuned = cats({ [off]: false });
    expect(levelOf(tuned)).toBe("custom");
    expect(tuned[off]).toBe(false); // reading the level never mutates the map
  });

  it("an org-forced category does not push the member into « sur mesure »", () => {
    // It is ON whatever they picked, so comparing it would blame them for the policy.
    const offByDefault = KEYS.find((k) => CATEGORY_DEFAULTS[k] === false);
    if (!offByDefault) return; // catalogue with no off-by-default category
    expect(levelOf(cats(), [offByDefault])).toBe("renforce");
    expect(activeCount(cats(), [offByDefault])).toBe(activeCount(cats()) + 1);
  });

  // ⚠️ This test used to say "NO reduced level is offered". "Standard" is one
  // now — a deliberate product decision. What stays non-negotiable are the three
  // conditions that come with it (see the ⚠️ block in `privacyLevel.ts`): only one
  // reduced level, MARKED, and never the install default. This is what this test verifies
  // now — a second reduced level, or a forgotten `reduced`, breaks it.
  it("un seul niveau protège MOINS que les défauts, et il est MARQUÉ", () => {
    expect(LEVELS.map((m) => m.id)).toEqual(["standard", "renforce", "strict"]);
    for (const m of LEVELS) {
      const map = categoriesForLevel(m.id);
      const lowers = KEYS.some((k) => map[k] === false && CATEGORY_DEFAULTS[k] !== false);
      expect(lowers, `${m.id} : protège-t-il moins que les défauts ?`).toBe(!!m.reduced);
    }
    expect(LEVELS.filter((m) => m.reduced).map((m) => m.id)).toEqual(["standard"]);
  });

  it("le défaut d'installation n'est PAS le niveau réduit", () => {
    // `CATEGORY_DEFAULTS` is the seed for `DEFAULT_SETTINGS.redactCategories`: nobody
    // lands on reduced protection without having chosen it.
    expect(levelOf(cats())).toBe("renforce");
  });

  it("« Standard » laisse passer EXACTEMENT les catégories BETA, et rien d'autre", () => {
    const standard = categoriesForLevel("standard");
    const renforce = categoriesForLevel("renforce");
    const differ = KEYS.filter((k) => standard[k] !== renforce[k]);
    expect(differ.sort()).toEqual(REDACT_CATEGORIES.filter((c) => c.ai).map((c) => c.key).sort());
  });

  it("le PLANCHER tient dans les trois niveaux, y compris le réduit", () => {
    // A string shaped like a key that is let through IS a key in clear — no preset
    // turns it off. The user keeps control down to the checkbox (it becomes « Sur mesure »).
    for (const m of LEVELS) {
      const map = categoriesForLevel(m.id);
      for (const k of ALWAYS_ON) {
        expect(map[k], `${m.id} éteint le plancher ${k}`).toBe(true);
      }
    }
  });

  it("un ancien réglage « Navigation » persisté lit « Standard » — c'est le même jeu", () => {
    // Some accounts saved the ex-preset (the five BETA categories turned off). This is
    // EXACTLY what "Standard" amounts to now: it regains a name instead of
    // staying "Sur mesure". The choices are not touched — only their reading changes.
    const exNavigation = cats({
      name: false,
      dob: false,
      address: false,
      location: false,
      company: false,
    });
    expect(levelOf(exNavigation)).toBe("standard");
    expect(exNavigation.name).toBe(false); // reading never mutates
  });

  it("activeCount matches what the rules screen counts", () => {
    expect(activeCount(cats())).toBe(KEYS.filter((k) => CATEGORY_DEFAULTS[k] !== false).length);
    expect(TOTAL_CATEGORIES).toBe(KEYS.length);
  });
});

describe("notoriété par niveau — la liste des personnes/entreprises jamais redacted", () => {
  it("Strict redacted tout (marques ET personnalités) ; chaque autre niveau dispense les deux", () => {
    expect(notorietyForLevel("strict")).toEqual({ commercial: false, people: false });
    for (const level of ["standard", "renforce", "custom"] as const) {
      expect(notorietyForLevel(level), level).toEqual({ commercial: true, people: true });
    }
  });

  it("dérivée du round-trip levelOf : le jeu de cases d'un niveau porte sa dispense", () => {
    // The store computes it via levelOf(effective categories) — the same path.
    expect(notorietyForLevel(levelOf(categoriesForLevel("standard"))).commercial).toBe(true);
    expect(notorietyForLevel(levelOf(categoriesForLevel("renforce"))).people).toBe(true);
    expect(notorietyForLevel(levelOf(categoriesForLevel("strict")))).toEqual({
      commercial: false,
      people: false,
    });
    // A hand-tuned set ("Sur mesure") is not Strict: exempted too —
    // "except in Strict mode" is the only exception (request from 30/07/2026).
    expect(notorietyForLevel(levelOf(cats({ phone: false }))).commercial).toBe(true);
  });

  it("la liste re-exportée est celle du moteur, non vide, avec les têtes d'affiche", () => {
    // One single home (`@openmasq/redact` model/notoriousData.ts) — here we just
    // verify that the re-export does expose the list the engine actually applies.
    expect(NOTORIOUS_PEOPLE.length).toBeGreaterThan(50);
    expect(NOTORIOUS_COMMERCIAL_ORGS.length).toBeGreaterThan(50);
    expect(NOTORIOUS_PEOPLE).toContain("Albert Einstein");
    expect(NOTORIOUS_COMMERCIAL_ORGS).toContain("Google");
    expect(NOTORIOUS_COMMERCIAL_ORGS).toContain("Canva"); // an MCP integration
  });
});
