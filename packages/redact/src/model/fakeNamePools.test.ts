import { describe, expect, it } from "vitest";
import { FAKE_FIRST, FAKE_FIRST_M, FAKE_FIRST_F, FAKE_LAST, fakeFor } from "./fakes";
import { isNonPiiTerm, isStopword } from "./genericTerms";
import { isNotoriousEntity } from "./notorious";
import { nameGender } from "./gender";

/* THE AUDIT OF THE FAKE-NAME POOLS.
 *
 * A fake name doesn't only have to be plausible: it has to be RARE. NAME and EMAIL are
 * exempt from `collidesAvoid` (`pseudonymize/allocate.ts` `skipAvoid`), so nothing
 * protects a fake against what the user will type later in the conversation — the
 * pool IS the defence. These rules are deliberately mechanical: "we chose rare names"
 * is an intention, `expect` is a guarantee.
 *
 * Each rule corresponds to an observed or obvious collision, not a preference. */

const ALL = [...FAKE_FIRST, ...FAKE_LAST];
const lower = (s: string) => s.toLowerCase();

/** The French top charts — the most common first names and surnames. A fake drawn from there
 *  meets a REAL person of the same name in the conversation, and restoration
 *  then attributes one's value to the other. This is the verifiable version of "rare". */
const TOO_COMMON = new Set(
  (
    // first names (all generations combined)
    "marie jean pierre michel andré philippe rené louis alain jacques bernard marcel " +
    "daniel roger robert paul henri georges joseph raymond françois christian gérard " +
    "claude julien nicolas julien david sébastien stéphane laurent olivier patrick " +
    "jeanne monique catherine françoise nathalie isabelle sylvie martine nicole " +
    "christine véronique sandrine valérie céline stéphanie aurélie julie émilie laura " +
    "claire sophie camille manon léa emma chloé sarah alice clara louise juliette " +
    "charlotte anna rose jade inès lina lucas hugo théo léo tom noah adam jules " +
    "arthur antoine nathan ethan simon marc éric pascal frédéric vincent " +
    // surnames
    "martin bernard julien petit robert richard durand dubois moreau laurent simon " +
    "michel lefebvre leroy roux david bertrand morel fournier girard bonnet dupont " +
    "lambert fontaine rousseau vincent muller lefevre faure andre mercier blanc " +
    "guerin boyer garnier chevalier françois legrand gauthier garcia perrin robin " +
    "clement morin nicolas henry roussel mathieu duval denis marchand lemaire"
  ).split(" "),
);

/** Homonyms of public figures that two innocuous halves could compose. « Paul Simon »
 *  used to come out of the old pools; a browsing model then goes off to look up the musician. */
const FAMOUS_FULL_NAMES = new Set([
  "paul simon", "louis garcia", "marc dupont", "jean moulin", "claude françois",
  "charlotte gainsbourg", "louis vuitton", "pierre bernard", "julien pesquet",
  "emma watson", "sarah bernhardt", "alice cooper", "anna karina", "jules verne",
  "arthur rimbaud", "simone veil", "marcel proust", "odilon redon", "marcel marceau",
]);

describe("pools de faux noms — rares, jamais des mots, jamais des célébrités", () => {
  it("aucun faux n'est un mot ordinaire ni un mot-outil", () => {
    // « Rose », « Jade », « Petit », « Roux »: the fake becomes a vault entry that
    // then re-redacts an innocuous word from the conversation — or worse, the reverse pass
    // rewrites that innocuous word into a real value.
    for (const n of ALL) {
      expect(isStopword(lower(n)), `${n} est un mot-outil`).toBe(false);
      expect(isNonPiiTerm(n), `${n} est un terme générique / un mot ordinaire`).toBe(false);
    }
  });

  it("aucun faux n'est un nom TRÈS courant", () => {
    // The heart of the rule: a team conversation contains a real Martin.
    for (const n of ALL) {
      expect(TOO_COMMON.has(lower(n)), `${n} fait partie des noms les plus portés`).toBe(false);
    }
  });

  it("aucun faux n'est reconnu comme une entité notoire", () => {
    // Notoriety is never redacted: a fake that reads as a public
    // figure sends a browsing model to investigate someone else.
    for (const n of ALL) {
      expect(isNotoriousEntity(n, "NAME"), `${n} est notoire (NAME)`).toBe(false);
      expect(isNotoriousEntity(n, "ORG"), `${n} est notoire (ORG)`).toBe(false);
    }
  });

  it("aucune COMBINAISON prénom + nom ne compose une personnalité", () => {
    for (const f of FAKE_FIRST) {
      for (const l of FAKE_LAST) {
        expect(FAMOUS_FULL_NAMES.has(`${lower(f)} ${lower(l)}`), `${f} ${l}`).toBe(false);
      }
    }
  });

  it("les prénoms et les patronymes sont DISJOINTS", () => {
    // « Simon » was in both: the draw could produce « Simon Simon », and
    // the word index no longer knew which identity carried the word.
    const firsts = new Set(FAKE_FIRST.map(lower));
    for (const l of FAKE_LAST) expect(firsts.has(lower(l)), `${l} est aussi un prénom`).toBe(false);
  });

  it("les deux genres sont disjoints, et aucun n'est vide", () => {
    // A first name on both sides would break the promise "the fake keeps the real's gender".
    const m = new Set(FAKE_FIRST_M.map(lower));
    for (const f of FAKE_FIRST_F) expect(m.has(lower(f)), `${f} est dans les deux genres`).toBe(false);
    expect(FAKE_FIRST_M.length).toBeGreaterThanOrEqual(12);
    expect(FAKE_FIRST_F.length).toBeGreaterThanOrEqual(12);
    expect(FAKE_LAST.length).toBeGreaterThanOrEqual(12);
  });

  it("aucun faux ne fait moins de 5 caractères", () => {
    // ≤3 characters in one word = `isRisky` in `unredact`: restoration only at
    // exact case, so a fake the model recapitalizes doesn't come back. And a short
    // fragment glues itself inside another word.
    for (const n of ALL) expect(n.length, n).toBeGreaterThanOrEqual(5);
  });

  it("chaque faux reste ALIASABLE (sinon la personne se scinde en deux identités)", () => {
    // `identity/name.ts` `isNamePart`: letters only, and not a stopword. A
    // surname refused there (« Petit ») is never aliased, so the next short form
    // of the same person gets a NEW identity.
    for (const n of ALL) expect(/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’-]+$/.test(n), n).toBe(true);
  });

  it("le GENRE de chaque prénom est connu du lexique, et du bon côté", () => {
    // The promise "the fake keeps the real's gender" holds through the pools' construction;
    // this test makes it VERIFIABLE end to end. It also has a side effect: a
    // real person named "Mahaut" whom the lexicon doesn't know falls back to the mixed pool,
    // and their fake can then change gender — "Madame … née … elle" applied to a man, an
    // agreement that doesn't restore properly.
    for (const n of FAKE_FIRST_M) expect(nameGender(n), n).toBe("m");
    for (const n of FAKE_FIRST_F) expect(nameGender(n), n).toBe("f");
  });

  it("aucun doublon dans un pool", () => {
    for (const [name, pool] of [["M", FAKE_FIRST_M], ["F", FAKE_FIRST_F], ["LAST", FAKE_LAST]] as const)
      expect(new Set(pool.map(lower)).size, name).toBe(pool.length);
  });
});

/* The DRAW, not the pools' content. Two pools of 16 only give 256 full names
 * if their two indices are independent — and they weren't: `pick` is `n % len`,
 * so drawing the halves on `h` then `h + 1` locked the surname to the first name
 * (index i, then i+1). Sixteen full names per gender instead of 256, the surname a
 * pure function of the first name, and three conversations drawing the same fake once in 256 —
 * hence a red `evals/workflow.test.ts` that proved nothing about the salt. */
describe("tirage d'un nom complet — le patronyme n'est pas une fonction du prénom", () => {
  // One salt per draw: that's exactly the axis by which two conversations differ.
  const draws = Array.from({ length: 400 }, (_, salt) =>
    fakeFor("NAME", "Augustin Vaudel", 0, undefined, salt),
  );

  it("le vivier des noms complets dépasse la taille d'un seul pool", () => {
    // With the indices locked, this count used to equal EXACTLY FAKE_LAST.length.
    expect(new Set(draws).size).toBeGreaterThan(FAKE_LAST.length);
  });

  it("un même faux prénom se voit attribuer plusieurs patronymes", () => {
    const byFirst = new Map<string, Set<string>>();
    for (const d of draws) {
      const [first, last] = d.split(" ");
      const seen = byFirst.get(first) ?? new Set<string>();
      seen.add(last);
      byFirst.set(first, seen);
    }
    const widest = Math.max(...[...byFirst.values()].map((s) => s.size));
    expect(widest, "chaque prénom n'a qu'un seul patronyme possible").toBeGreaterThan(1);
  });
});
