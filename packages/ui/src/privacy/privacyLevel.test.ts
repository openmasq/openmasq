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

/* L'échelle telle qu'un écran la voit. Ce fichier teste ce que les niveaux FONT — quelles
   catégories ils allument — donc la langue de leurs étiquettes lui est indifférente ; le
   catalogue anglais est vérifié là où il compte, par `locale.test.ts` (complétude) et par
   les tests d'écran. */
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

  // ⚠️ Ce test disait « AUCUN niveau réduit n'est offert ». « Standard » en est un
  // désormais — décision produit, assumée. Ce qui reste non négociable, ce sont les trois
  // conditions qui l'accompagnent (voir le bloc ⚠️ de `privacyLevel.ts`) : un seul niveau
  // réduit, MARQUÉ, et jamais le défaut d'installation. C'est ce que ce test vérifie
  // maintenant — un second niveau réduit, ou un `reduced` oublié, le casse.
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
    // `CATEGORY_DEFAULTS` est le seed de `DEFAULT_SETTINGS.redactCategories` : personne
    // n'atterrit sur une protection réduite sans l'avoir choisie.
    expect(levelOf(cats())).toBe("renforce");
  });

  it("« Standard » laisse passer EXACTEMENT les catégories BETA, et rien d'autre", () => {
    const standard = categoriesForLevel("standard");
    const renforce = categoriesForLevel("renforce");
    const differ = KEYS.filter((k) => standard[k] !== renforce[k]);
    expect(differ.sort()).toEqual(REDACT_CATEGORIES.filter((c) => c.ai).map((c) => c.key).sort());
  });

  it("le PLANCHER tient dans les trois niveaux, y compris le réduit", () => {
    // Une chaîne en forme de clé laissée passer EST une clé en clair — aucun preset ne
    // l'éteint. L'utilisateur garde la main à la case près (ça devient « Sur mesure »).
    for (const m of LEVELS) {
      const map = categoriesForLevel(m.id);
      for (const k of ALWAYS_ON) {
        expect(map[k], `${m.id} éteint le plancher ${k}`).toBe(true);
      }
    }
  });

  it("un ancien réglage « Navigation » persisté lit « Standard » — c'est le même jeu", () => {
    // Des comptes ont enregistré l'ex-preset (les cinq catégories BETA éteintes). C'est
    // EXACTEMENT ce que « Standard » vaut désormais : il retrouve donc un nom au lieu de
    // rester « Sur mesure ». Les choix ne sont pas touchés — seule leur lecture change.
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
    // Le store la calcule via levelOf(catégories effectives) — le même chemin.
    expect(notorietyForLevel(levelOf(categoriesForLevel("standard"))).commercial).toBe(true);
    expect(notorietyForLevel(levelOf(categoriesForLevel("renforce"))).people).toBe(true);
    expect(notorietyForLevel(levelOf(categoriesForLevel("strict")))).toEqual({
      commercial: false,
      people: false,
    });
    // Un jeu réglé à la main (« Sur mesure ») n'est pas Strict : dispensé aussi —
    // « excepté en mode strict » est la seule exception (demande du 30/07/2026).
    expect(notorietyForLevel(levelOf(cats({ phone: false }))).commercial).toBe(true);
  });

  it("la liste re-exportée est celle du moteur, non vide, avec les têtes d'affiche", () => {
    // Une seule maison (`@openmasq/redact` model/notoriousData.ts) — ici on vérifie
    // juste que le re-export expose bien la liste que le moteur applique.
    expect(NOTORIOUS_PEOPLE.length).toBeGreaterThan(50);
    expect(NOTORIOUS_COMMERCIAL_ORGS.length).toBeGreaterThan(50);
    expect(NOTORIOUS_PEOPLE).toContain("Albert Einstein");
    expect(NOTORIOUS_COMMERCIAL_ORGS).toContain("Google");
    expect(NOTORIOUS_COMMERCIAL_ORGS).toContain("Canva"); // une intégration MCP
  });
});
