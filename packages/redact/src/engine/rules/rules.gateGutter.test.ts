import { describe, it, expect } from "vitest";
import { pseudonymize } from "../../index";

/**
 * LA GOUTTIÈRE DE COLONNE — le libellé et sa valeur alignés en colonnes, l'idiome de tout
 * document administratif imprimé. Mesuré le 15/08/2026 sur un extrait Kbis RÉEL : le SIREN
 * du DOMICILIATAIRE partait en clair (18 espaces entre « RCS, numéro » et lui, donc au-delà
 * de la fenêtre de séparateurs), tandis que celui de la société n'était sauvé que par le
 * « R.C.S. » qui le SUIT — une règle distincte. Un SIREN se convertit en raison sociale par
 * une recherche au registre public : masquer le nom du domiciliataire et laisser son numéro
 * ne masque rien.
 *
 * Ce que ces cas épinglent, c'est la FRONTIÈRE : une gouttière d'espaces purs franchit le
 * gate, un contenu quelconque ne le franchit pas.
 */
const vals = async (txt: string): Promise<string[]> => {
  const r = (await pseudonymize(txt, { vault: {} })) as { matches?: { value: string }[] };
  return (r.matches ?? []).map((m) => m.value);
};

describe("gate() — la gouttière de colonne", () => {
  it("franchit une gouttière large entre le libellé et la valeur (Kbis réel)", async () => {
    expect(await vals("Immatriculation au RCS, numéro                  849 409 313")).toContain(
      "849 409 313",
    );
  });

  it("attrape LES DEUX immatriculations d'un même acte, pas seulement la première", async () => {
    const kbis =
      "Immatriculation au RCS, numéro                  863 471 587 R.C.S. Paris\n" +
      "Nom ou dénomination du domiciliataire           Les tricolores\n" +
      "Immatriculation au RCS, numéro                  849 409 313";
    const found = await vals(kbis);
    expect(found).toContain("863 471 587");
    expect(found).toContain("849 409 313");
  });

  it("la VIRGULE du libellé ne coupe plus la course (« RCS, numéro »)", async () => {
    expect(await vals("SIREN, numéro : 849 409 313")).toContain("849 409 313");
  });

  it("⚠️ une gouttière ne peut pas enjamber une AUTRE valeur : tout contenu la rompt", async () => {
    // Ce qui rend l'élargissement sûr : entre le mot-clé et le nombre il n'y a QUE des
    // espaces. Dès qu'une autre colonne s'intercale, le gate ne doit plus s'appliquer.
    const found = await vals("RCS Paris        Capital 100 EUROS        123456789");
    expect(found).not.toContain("123456789");
  });

  it("ne franchit pas un SAUT DE LIGNE (le cas vertical appartient à labelBlocks)", async () => {
    const found = await vals("Immatriculation au RCS, numéro\n\n\n        849 409 313");
    // Le gate lui-même ne doit pas gager sur un bloc détaché ; s'il est détecté, ce sera
    // par une AUTRE porte (labelBlocks), jamais par une gouttière traversant les lignes.
    expect(found.filter((v) => v === "849 409 313").length).toBeLessThanOrEqual(1);
  });
});
