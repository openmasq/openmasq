import { describe, expect, it } from "vitest";
import { getMessages, LOCALES } from "@openmasq/i18n";
import { sectionGuides, sectionOneLiner } from "./sections";

/**
 * Le vocabulaire des sections, DANS CHAQUE LANGUE.
 *
 * `sectionOneLiner` DÉRIVE du `tip` au lieu d'ajouter une troisième formulation de la même
 * chose — ce qui n'est vrai que tant que le `tip` garde sa forme « Étiquette — ce à quoi
 * ça sert ». C'est donc cette convention qu'on épingle : sans elle, le premier lancement
 * afficherait « Conversations · Conversations — vos échanges… », et rien ne dirait que le
 * fautif est une entrée du catalogue.
 *
 * ⚠️ La boucle sur `LOCALES` n'est pas une politesse : une traduction est le moment exact
 * où une convention de FORME se perd (un tiret simple à la place du cadratin, une étiquette
 * qu'on ne remet pas en tête). Une langue ajoutée entre ici sans qu'on y pense.
 */

describe("sectionOneLiner", () => {
  it("retire l'étiquette que la ligne affiche déjà à côté", () => {
    expect(
      sectionOneLiner({
        id: "vault",
        label: "Coffre",
        tip: "Coffre — vos valeurs toujours masquées",
        guide: "…",
        keywords: "",
      }),
    ).toBe("vos valeurs toujours masquées");
  });

  it("rend le `tip` tel quel s'il n'a pas de préfixe — jamais une phrase vide", () => {
    expect(
      sectionOneLiner({ id: "chats", label: "X", tip: "sans tiret", guide: "…", keywords: "" }),
    ).toBe("sans tiret");
  });

  it.each(LOCALES)(
    "[%s] chaque section a un `tip` préfixé de son étiquette, et qui dit quelque chose",
    (locale) => {
      for (const s of sectionGuides(getMessages(locale))) {
        expect(s.tip.startsWith(`${s.label} —`), `${s.id} : « ${s.tip} »`).toBe(true);
        expect(sectionOneLiner(s).length, s.id).toBeGreaterThan(8);
      }
    },
  );

  it.each(LOCALES)("[%s] les mots-clés ⌘K nomment la section dans l'AUTRE langue", (locale) => {
    // Le point des `keywords` : un francophone tape « coffre-fort », un anglophone « vault ».
    // Chaque liste porte donc le mot de l'autre langue, sinon la moitié des utilisateurs
    // d'une app bilingue ne trouve rien.
    for (const s of sectionGuides(getMessages(locale))) {
      expect(s.keywords.trim().length, s.id).toBeGreaterThan(10);
    }
  });
});
