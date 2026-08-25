import { describe, expect, it } from "vitest";
import { pseudonymize, unredact } from "../../index";
import { buildFakeName } from "./name";

/**
 * LA RÈGLE : un jeton d'un vrai nom ne part JAMAIS verbatim dans son propre faux.
 *
 * `buildFakeName` recopiait tel quel tout jeton que `isNamePart` refusait — un prédicat
 * qui répond en réalité à « puis-je ALIASER ce mot ? », pas à « puis-je l'envoyer ? ».
 * Deux familles de jetons tombaient donc dans le trou, et le coffre annonçait la valeur
 * redacted dans les deux cas (mesuré le 05/08) :
 *
 *  · hors Latin-1 — l'ancienne classe `[A-Za-zÀ-ÿ]` ratait un accent DÉCOMPOSÉ (NFD, ce
 *    que produit un collé macOS et la plupart des extractions PDF), un homoglyphe
 *    cyrillique/grec, une lettre pleine chasse ;
 *  · les exclusions SÉMANTIQUES — `Petit`, `Sala`, `France` sont de vrais patronymes que
 *    portent les listes de stopwords, de vocabulaire et de pays.
 *
 * L'assertion est toujours la même et c'est la seule qui compte : la vraie valeur est
 * ABSENTE du texte qui part. Ce que le coffre contient ne le prouve pas.
 *
 * ⚠️ Elle est vérifiée ICI, cas par cas, parce qu'elle ne l'est NULLE PART en général :
 * la post-condition de `pseudonymize/index.ts` prouve seulement qu'une correspondance
 * rapportée est RÉVERSIBLE (`vault[placeholder] === value`), jamais que la valeur a
 * réellement quitté le texte. C'est ce qui a laissé la fuite se présenter à
 * l'utilisateur comme un redaction accompli. La généraliser à ce point d'étranglement
 * — pour chaque correspondance, refuser l'envoi si sa valeur figure encore dans
 * `text` — fermerait la famille entière ; c'est le suivi ouvert.
 */

const forceName = (value: string) => ({ forced: [{ value, category: "name" }] });

/** Redacted `texte` et rend ce qui part réellement + le coffre. */
async function envoyer(texte: string, opts: object = {}) {
  const vault: Record<string, string> = {};
  const res = await pseudonymize(texte, { vault, ...opts });
  return { sortie: res.text, vault };
}

describe("buildFakeName — aucun jeton réel n'est recopié dans le faux", () => {
  const cas: [string, string, string][] = [
    // libellé, nom réel, le jeton qui partait en clair
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
      // …et la valeur reste réversible : le coffre rend le nom RÉEL, entier.
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
    // Le mot ordinaire d'une phrase suivante ne doit pas être réécrit par `applyVault` :
    // c'est l'invariant que l'exclusion sémantique protège, et il tient toujours.
    const suite = await pseudonymize("Un petit dossier, un grand résultat.", { vault });
    expect(suite.text).toContain("petit");
  });

  it("un mot non-nom (chiffres) reste verbatim", () => {
    expect(jamaisDeFaux("2024", "2024")).toBe(true);
  });
});
