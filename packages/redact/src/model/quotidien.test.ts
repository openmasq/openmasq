import { describe, it, expect } from "vitest";
import { pseudonymize } from "./pseudonymize";
import { isGenericTerm } from "./genericTerms";

/**
 * Un détecteur qui propose comme ORG chaque terme du vocabulaire présent dans le texte —
 * le modèle volontairement plus dur de ce qu'un NER réel fait à ces documents. (Copie
 * locale : l'original vivait dans les bancs corpus, qui ont quitté ce dépôt.)
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
 * Le VOCABULAIRE DU QUOTIDIEN reste en clair — cuisine, bricolage, jardin, sport, voiture,
 * météo, livraison.
 *
 * ⚠️ Ces phrases ne contiennent AUCUNE donnée personnelle. Mesuré avant `vocab/quotidien.ts`
 * sur 136 phrases de ce type passées dans le pipeline réel (NER local) : **16 revenaient
 * avec quelque chose dans le coffre** — « moutarde », « levain », « magret », « poncer »,
 * « nichoir », « wagon », « stivaletti ». Un NER casé rencontre un nom commun inconnu en
 * tête de phrase et y lit un nom propre ; le faux le remplace, et l'utilisateur reçoit une
 * réponse sur une recette qui ne parle plus de moutarde. Après le volume : 4, et ce sont
 * les quatre exclusions VOLONTAIRES (voir plus bas).
 *
 * Le détecteur est stubé pour SUR-ÉTIQUETER : sans lui, le pipeline déterministe ne propose
 * jamais « moutarde » comme organisation et le test ne prouverait rien — c'est la leçon
 * déjà inscrite dans `bench/domainBench.ts`.
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

/** Les mots que le stub propose — ceux que la sonde a vraiment vus partir au coffre. */
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
   * L'AUTRE moitié, et elle est plus importante que la première. Ces quatre mots sont
   * ordinaires — « le poisson est cuit », « une cheville molly », « le gardien a arrêté »,
   * « le chaton a été vermifugé » — et ils restent redactable, parce que ce sont AUSSI
   * des patronymes portés par des gens réels. L'asymétrie décide : un mot courant redacted
   * à tort est une gêne visible et réparable d'un clic ; un nom épargné à tort est une
   * fuite permanente et silencieuse.
   */
  it("les homographes de patronymes restent redactable — c'est le prix assumé", () => {
    const spared = ["poisson", "chaton", "gardien", "molly"].filter(isGenericTerm);
    expect(spared, `ces mots doivent rester redactable : ${spared.join(", ")}`).toEqual([]);
  });
});
