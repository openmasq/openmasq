import { describe, expect, it } from "vitest";
import { SECTION_GUIDE, sectionOneLiner } from "./sections";

/**
 * Le vocabulaire des six sections.
 *
 * `sectionOneLiner` DÉRIVE du `tip` au lieu d'ajouter une troisième formulation de la même
 * chose — ce qui n'est vrai que tant que le `tip` garde sa forme « Étiquette — ce à quoi
 * ça sert ». C'est donc cette convention qu'on épingle : sans elle, le premier lancement
 * afficherait « Conversations · Conversations — vos échanges… », et rien ne dirait que le
 * fautif est une entrée de ce fichier.
 */

describe("sectionOneLiner", () => {
  it("retire l'étiquette que la ligne affiche déjà à côté", () => {
    expect(
      sectionOneLiner({
        id: "vault",
        label: "Coffre",
        tip: "Coffre — vos valeurs toujours masquées",
        guide: "…",
      }),
    ).toBe("vos valeurs toujours masquées");
  });

  it("rend le `tip` tel quel s'il n'a pas de préfixe — jamais une phrase vide", () => {
    expect(sectionOneLiner({ id: "chats", label: "X", tip: "sans tiret", guide: "…" })).toBe(
      "sans tiret",
    );
  });

  it("chaque section a bien un `tip` préfixé de son étiquette, et qui dit quelque chose", () => {
    for (const s of SECTION_GUIDE) {
      expect(s.tip.startsWith(`${s.label} —`), `${s.id} : « ${s.tip} »`).toBe(true);
      expect(sectionOneLiner(s).length, s.id).toBeGreaterThan(8);
    }
  });
});
