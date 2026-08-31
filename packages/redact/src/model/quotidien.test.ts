import { describe, it, expect } from "vitest";
import { pseudonymize } from "./pseudonymize";
import { isGenericTerm } from "./genericTerms";

/**
 * A detector that proposes as ORG every vocabulary term present in the text —
 * deliberately harsher than what a real NER does to these documents. (Local
 * copy: the original lived in the corpus benchmarks, which have left this repo.)
 */
const proposingDetector =
  (vocabulary: readonly string[]) =>
  (text: string) =>
  async (): Promise<string> =>
    JSON.stringify(
      vocabulary
        .filter((t) => text.toLowerCase().includes(t.toLowerCase()))
        .map((value) => ({ value, category: "ORG" })),
    );

/**
 * EVERYDAY VOCABULARY stays in clear — cooking, DIY, gardening, sport, cars,
 * weather, delivery.
 *
 * ⚠️ These sentences contain NO personal data whatsoever. Measured before `vocab/quotidien.ts`
 * on 136 sentences of this kind run through the real pipeline (local NER): **16 came back
 * with something in the vault** — « moutarde », « levain », « magret », « poncer »,
 * « nichoir », « wagon », « stivaletti ». A cased NER meets an unknown common noun at
 * the start of a sentence and reads it as a proper noun; the fake replaces it, and the user gets
 * back an answer about a recipe that no longer mentions mustard. After the volume was added: 4, and those are
 * the four DELIBERATE exclusions (see below).
 *
 * The detector is stubbed to OVER-LABEL: without it, the deterministic pipeline never
 * proposes « moutarde » as an organisation and the test would prove nothing — that's the lesson
 * already written into `bench/domainBench.ts`.
 */
const PHRASES = [
  "Émincer les échalotes, faire suer au beurre, déglacer au vinaigre balsamique.",
  "Le levain doit reposer douze heures avant le pétrissage.",
  "Faire mariner le magret dans du miel, de la sauce soja et du gingembre frais.",
  "Une cuillère à soupe de moutarde, deux de crème fraîche, du poivre du moulin.",
  "Le poisson est cuit à la vapeur avec du fenouil et de l'aneth.",
  "Poncer, dégraisser, appliquer une sous-couche puis deux couches de peinture acrylique.",
  "Il faut percer le mur porteur avec une mèche à béton et une cheville adaptée.",
  "Les mésanges reviennent au nichoir, et les merles fouillent la pelouse.",
  "Correspondance quai numéro trois, le wagon-bar est en tête de rame.",
  "La courroie de distribution est à changer tous les cent vingt mille kilomètres.",
  "Le kiné m'a donné des exercices de renforcement et d'étirement.",
  "Ho comprato un cappotto di lana e un paio di stivaletti.",
  "Refogar a cebola, juntar o caldo e deixar cozinhar em lume brando.",
];

/** The words the stub proposes — the ones the probe actually saw go to the vault. */
const VOCABULAIRE = [
  "moutarde", "levain", "magret", "aneth", "basilic", "fenouil", "gingembre",
  "émincer", "déglacer", "pétrissage", "poncer", "dégraisser", "sous-couche",
  "mèche", "béton", "cheville", "mur porteur", "nichoir", "pelouse", "wagon",
  "courroie", "kiné", "stivaletti", "lume brando", "cuillère à soupe",
  "crème fraîche", "sauce soja", "peinture acrylique", "correspondance", "rame",
];

describe("vocabulaire du quotidien — une conversation ordinaire ne part pas au coffre", () => {
  it("aucun de ces mots n'atteint le coffre, même avec un détecteur qui sur-étiquette", async () => {
    const vaulted = new Set<string>();
    for (const text of PHRASES) {
      const vault: Record<string, string> = {};
      await pseudonymize(text, { vault, complete: proposingDetector(VOCABULAIRE)(text) });
      for (const v of Object.values(vault)) vaulted.add(v.toLowerCase());
    }
    expect(
      [...vaulted],
      `ces mots du quotidien sont redacted : ${[...vaulted].join(", ")}`,
    ).toEqual([]);
  });

  /**
   * The OTHER half, and it matters more than the first. These four words are
   * ordinary — « le poisson est cuit », « une cheville molly », « le gardien a arrêté »,
   * « le chaton a été vermifugé » — and they stay redactable, because they are ALSO
   * surnames carried by real people. The asymmetry decides: an ordinary word wrongly redacted
   * is a visible nuisance fixable with one click; a name wrongly spared is a
   * permanent, silent leak.
   */
  it("les homographes de patronymes restent redactable — c'est le prix assumé", () => {
    const spared = ["poisson", "chaton", "gardien", "molly"].filter(isGenericTerm);
    expect(spared, `ces mots doivent rester redactable : ${spared.join(", ")}`).toEqual([]);
  });
});
