import { describe, expect, it } from "vitest";
import { getMessages, LOCALES } from "@openmasq/i18n";
import { sectionGuides, sectionOneLiner } from "./sections";

/**
 * The vocabulary of the sections, IN EVERY LANGUAGE.
 *
 * `sectionOneLiner` DERIVES from the `tip` instead of adding a third wording of the same
 * thing — which only holds as long as the `tip` keeps its « Étiquette — ce à quoi ça sert »
 * shape. So that convention is what we pin: without it, first launch would show
 * « Conversations · Conversations — vos échanges… », and nothing would say the culprit is
 * a catalogue entry.
 *
 * ⚠️ The loop over `LOCALES` is not a politeness: a translation is the exact moment when a
 * convention of FORM is lost (a simple hyphen instead of the em dash, a label that is not
 * put back in front). A language added later comes through here without anyone thinking of it.
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
    // The point of `keywords`: a French speaker types « coffre-fort », an English speaker
    // « vault ». Each list therefore carries the other language's word, otherwise half the
    // users of a bilingual app find nothing.
    for (const s of sectionGuides(getMessages(locale))) {
      expect(s.keywords.trim().length, s.id).toBeGreaterThan(10);
    }
  });
});
