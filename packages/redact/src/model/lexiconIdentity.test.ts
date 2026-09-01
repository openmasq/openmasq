import { describe, expect, it } from "vitest";
import { COMMON_SURNAMES } from "./surnamesGuard.data";
import { FIRST_NAMES } from "../engine/names/firstNames.data";

/**
 * The two lexicons hold REAL, ordinary names on purpose, and that is the one property
 * nothing else was checking.
 *
 * Every other test asks what the lexicons DO — that no vocabulary word is reachable as a
 * surname (`vocabGuards.test.ts`), that the gazetteer fires on a first-name + surname pair
 * (`nameGazetteer.test.ts`). All of those keep passing if the entries are swapped for
 * invented names of the same shape: the guard still guards, it just guards nobody, and a
 * green suite says nothing about it. So this asserts what the files ARE, not what they do —
 * the one property that a same-shape substitution silently destroys.
 *
 * These names are therefore NOT test personas and must never be rotated — they are the
 * lexicon itself, like a dictionary. `scripts/checks/check-pii.mjs` states the same rule from the
 * other side: a bare first name is a dictionary word, never an identity.
 */

/** Folded the way both lexicons store their entries: lowercase, diacritics dropped. */
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase();

describe("les lexiques portent de VRAIS noms — pas des personas", () => {
  /** The most common in France: if these are missing, the lexicon is no longer a lexicon. */
  const SURNAMES = ["martin", "bernard", "dubois", "durand", "moreau", "leroy", "roux", "morel", "dupont", "rousseau"];

  it("COMMON_SURNAMES contient les patronymes français les plus courants", () => {
    const have = new Set(COMMON_SURNAMES.map(fold));
    for (const n of SURNAMES) expect(have, `« ${n} » a disparu du lexique`).toContain(n);
  });

  it("COMMON_SURNAMES reste un lexique de masse, pas une poignée d'exemples", () => {
    expect(COMMON_SURNAMES.length).toBeGreaterThan(300);
  });

  const GIVENS = ["jean", "marie", "pierre", "claire", "julien", "camille", "nathan", "lea", "thomas", "sophie"];

  it("FIRST_NAMES contient les prénoms courants (le pair du gazetteer en dépend)", () => {
    for (const n of GIVENS) expect(FIRST_NAMES.has(n), `« ${n} » a disparu du lexique`).toBe(true);
  });

  it("FIRST_NAMES reste un lexique multilingue de masse", () => {
    expect(FIRST_NAMES.size).toBeGreaterThan(1000);
  });

  /** A fake from the pool inside a lexicon of real names: either a rotation hit here,
   *  or the pool was seeded from the lexicon — both are bugs. */
  it("aucun patronyme INVENTÉ du pool de faux n'a atterri dans le lexique", async () => {
    const { FAKE_LAST } = await import("./fakes/pools");
    const have = new Set(COMMON_SURNAMES.map(fold));
    for (const fake of FAKE_LAST) {
      expect(have, `« ${fake} » est un faux du pool, il n'a rien à faire dans le lexique`).not.toContain(fold(fake));
    }
  });
});
