import { describe, it, expect } from "vitest";
import { pseudonymize } from "../index";
import { discoverSecrets } from "./detect";
import { isNonPiiTerm, isGenericTerm } from "./genericTerms";
import type { Detection } from "../types";

/**
 * ⚠️ REGRESSION — the word that ANNOUNCES the data was redacted instead of the data.
 *
 * Measured on the v1.0 benchmark (~7% of messages affected, 93% precision): « Mon
 * passeport est périmé » was leaving to the model as « Mon Simon est périmé ». It's the worst
 * kind of false positive because it's INVISIBLE — the user reads back their restored sentence,
 * sees nothing wrong, and concludes the model is answering poorly. A MISS is visible (nothing
 * is highlighted) and can be caught via the Vault; this one can't be seen.
 *
 * The word names the TYPE of document, never its holder.
 */

/** What a NER that tags the category word returns — the actually observed output. */
const tags = (value: string, category = "PER") =>
  async (): Promise<Detection[]> => [{ value, category }];

describe("un mot-catégorie n'est jamais redacted pour lui-même", () => {
  it.each([
    ["Mon passeport est périmé.", "passeport"],
    ["J'ai perdu ma CNI.", "CNI"],
    ["Mon numéro de sécu est le 1 84 12 75 123 456 78.", "sécu"],
    ["Mon gamertag est xX_Shadow_Xx.", "gamertag"],
  ])("%s", async (text, label) => {
    const out = await pseudonymize(text, { detectLocal: tags(label) });
    expect(out.text).toContain(label);
  });

  it("laisse en clair le LABEL mais redacted bien la VALEUR qui le suit", () => {
    // The counter-test that keeps the fix from becoming a recall loss: we
    // didn't turn off detection, we just stopped targeting the wrong word.
    return pseudonymize("Mon login est arvio92.", { detectLocal: tags("login") }).then((out) => {
      expect(out.text).toContain("login");
      expect(out.text).not.toContain("arvio92");
    });
  });
});

describe("isNonPiiTerm — UNE définition, partagée par les trois chemins", () => {
  /**
   * The three call sites had drifted into three different answers to the same question
   * (root rule 9): the same value could be spared in FAKE mode and redacted in
   * MARKER mode. This test compares both modes on the same input.
   */
  it("le mode marqueur épargne exactement ce que le mode fake épargne", async () => {
    for (const label of ["passeport", "CNI", "sécu", "gamertag", "iban", "Le login"]) {
      const text = `Voici : ${label} ici.`;
      const marked = await discoverSecrets(text, { detectLocal: tags(label) });
      const faked = await pseudonymize(text, { detectLocal: tags(label) });
      expect(marked, `mode marqueur a redacted ${label}`).toEqual([]);
      expect(faked.text, `mode fake a redacted ${label}`).toContain(label);
    }
  });

  it("réunit bien les quatre prédicats (mot, composé, article, stopword)", () => {
    expect(isNonPiiTerm("passeport")).toBe(true); // generic term
    expect(isNonPiiTerm("Le login")).toBe(true); // article + term
    expect(isNonPiiTerm("read-data-schema")).toBe(true); // compound
    expect(isNonPiiTerm("Berlioz")).toBe(false); // a real name stays redactable
  });
});

describe("la discipline d'allow-list tient (vocab/index.ts règle 2)", () => {
  it("« signe » reste redactable — c'est un prénom scandinave", () => {
    // The ASCII twin of « signé » is DELIBERATELY absent from the list: an allow-list
    // entry ships this word in clear forever, and « Signe » is a first name.
    expect(isGenericTerm("signe")).toBe(false);
    expect(isNonPiiTerm("signe")).toBe(false);
  });

  it("les entrées ajoutées gardent leur forme ACCENTUÉE et son jumeau ASCII", () => {
    // « sécu » is what people type; « secu » is what a degraded export produces.
    expect(isGenericTerm("sécu")).toBe(true);
    expect(isGenericTerm("secu")).toBe(true);
  });
});
