import { describe, expect, it } from "vitest";
import { pseudonymize, unredact } from "../../index";
import { buildFakeName } from "./name";

/**
 * THE RULE: a token of a real name NEVER goes out verbatim inside its own fake.
 *
 * `buildFakeName` used to copy through unchanged any token that `isNamePart` refused — a
 * predicate that actually answers "can I ALIAS this word?", not "can I send it?".
 * Two families of tokens fell into that hole, and the vault reported the value as
 * faked in both cases (measured 05/08):
 *
 *  · non-Latin-1 — the old `[A-Za-zÀ-ÿ]` class missed a DECOMPOSED accent (NFD, what
 *    a macOS paste and most PDF extractions produce), a Cyrillic/Greek homoglyph,
 *    a fullwidth letter;
 *  · SEMANTIC exclusions — `Petit`, `Sala`, `France` are real surnames that
 *    also appear in the stopword, vocabulary and country lists.
 *
 * The assertion is always the same and it's the only one that matters: the real value is
 * ABSENT from the text that goes out. What the vault contains does not prove that.
 *
 * ⚠️ It is verified HERE, case by case, because it is verified NOWHERE ELSE in general:
 * `pseudonymize/index.ts`'s post-condition only proves that a reported match is
 * REVERSIBLE (`vault[placeholder] === value`), never that the value actually
 * left the text. That is what let the leak present itself to the user as a
 * completed redaction. Generalizing this at that choke point — for every match,
 * refuse to send if its value still appears in `text` — would close the whole
 * family; that is the open follow-up.
 */

const forceName = (value: string) => ({ forced: [{ value, category: "name" }] });

/** Redacts `texte` and returns what actually goes out + the vault. */
async function envoyer(texte: string, opts: object = {}) {
  const vault: Record<string, string> = {};
  const res = await pseudonymize(texte, { vault, ...opts });
  return { sortie: res.text, vault };
}

describe("buildFakeName — aucun jeton réel n'est recopié dans le faux", () => {
  const cas: [string, string, string][] = [
    // label, real name, the token that used to go out in clear
    ["accent DÉCOMPOSÉ (NFD)", "Élodie Morvan".normalize("NFD"), "Élodie".normalize("NFD")],
    ["homoglyphe cyrillique", "Еlodie Morvan", "Еlodie"],
    ["homoglyphe grec", "Elodie Morvαn", "Morvαn"],
    ["lettres pleine chasse", "Ｅｌｏｄｉｅ Ｍａｒｔｉｎ", "Ｅｌｏｄｉｅ"],
    ["patronyme qui est un stopword", "Jean Petit", "Petit"],
    ["patronyme qui est un pays", "Marie France", "France"],
    ["patronyme du vocabulaire", "Theo Sala", "Sala"],
  ];

  for (const [libelle, reel, jeton] of cas) {
    it(`${libelle} : « ${jeton} » ne part pas en clair`, async () => {
      const texte = `Le dossier de ${reel} est prêt.`;
      const { sortie, vault } = await envoyer(texte, forceName(reel));

      expect(sortie, `« ${jeton} » est encore sur le fil : ${sortie}`).not.toContain(jeton);
      // …and the value stays reversible: the vault returns the REAL name, whole.
      expect(unredact(sortie, vault)).toContain(reel);
    });
  }
});

describe("ce qui doit RESTER verbatim (la raison d'être du prédicat étroit)", () => {
  const jamaisDeFaux = (fake: string, real: string) =>
    buildFakeName(real, 0, () => undefined, () => false, 0) === fake;

  it("une particule n'est ni faussée ni aliasée", () => {
    const fake = buildFakeName("Julien de la Croix", 0, () => undefined, () => false, 0);
    expect(fake).toContain(" de la ");
    expect(fake).not.toContain("Julien");
    expect(fake).not.toContain("Croix");
  });

  it("une initiale et une civilité traînante restent telles quelles", () => {
    expect(buildFakeName("L. Morvan", 0, () => undefined, () => false, 0)).toMatch(/^L\. /);
    expect(buildFakeName("MARTINEZ CAROLINE MME", 0, () => undefined, () => false, 0)).toContain("MME");
  });

  it("aucun alias par mot n'est créé pour un patronyme-stopword — « petit » ordinaire survit", async () => {
    const vault: Record<string, string> = {};
    await pseudonymize("Le dossier de Jean Petit est prêt.", {
      vault,
      ...forceName("Jean Petit"),
    });
    // The ordinary word in a following sentence must not be rewritten by `applyVault`:
    // that's the invariant the semantic exclusion protects, and it still holds.
    const suite = await pseudonymize("Un petit dossier, un grand résultat.", { vault });
    expect(suite.text).toContain("petit");
  });

  it("un mot non-nom (chiffres) reste verbatim", () => {
    expect(jamaisDeFaux("2024", "2024")).toBe(true);
  });
});
