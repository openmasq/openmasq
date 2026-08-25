import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { pseudonymize } from "./index";

/* Regression suite for the France-Travail-style enrollment letter. Two eras of bug:

   1. (URL validity) The org's name lives BOTH in prose ("France Travail") and GLUED
      inside URL hosts ("candidat.francetravail.fr") — when the org WAS being faked, the
      glued variant received the SPACED fake, shipping broken URLs the model couldn't
      navigate. Every URL must stay syntactically valid whatever gets substituted.

   2. (Over-redaction) "France Travail" is a PUBLIC institution — the letter's sender,
      world knowledge, never the member's identity. Faking it made the model read a
      letter from nobody ("Lina Vernay" in the report), and the per-word NAME aliases
      then corrupted "code du travail" → "code du vernay". It is spared by
      `notorious.ts` under BOTH readings: the ORG one, and the NAME one the first-name
      gazetteer produces by pairing "France" + "Travail" (multi-word org exact match).

   The member's own data (numéro, address, name) keeps full protection — that contrast
   is the point of this fixture. The ORG detection is the NER's job — simulated via
   detectLocal, exactly how the desktop feeds the engine. */

const text = readFileSync(
  fileURLToPath(new URL("./__fixtures__/courrier-inscription.txt", import.meta.url)),
  "utf8",
);

const detectLocal = async () => [
  { value: "France Travail", category: "ORG" },
  { value: "BRUNO VERNAUX", category: "PER" },
];

async function run() {
  const vault: Record<string, string> = {};
  // `url` éteinte = le défaut produit : le sujet est l'hôte collé « candidat.francetravail.fr »
  // laissé LISIBLE par le filtre de notoriété, pas le masquage des adresses.
  const out = await pseudonymize(text, { vault, detectLocal, disabledKinds: ["url"] });
  return { vault, text: out.text };
}

describe("courrier d'inscription — the public sender ships in clear, the member is protected", () => {
  it("France Travail stays VERBATIM — prose, glued host and ALL-CAPS alike", async () => {
    const { vault, text: out } = await run();
    expect(out).toContain("France Travail");
    expect(out).toContain("candidat.francetravail.fr");
    // No vault entry maps to it under any spelling: nothing to restore, nothing faked.
    for (const real of Object.values(vault)) {
      expect(real.toLowerCase().replace(/[\s._-]/g, "")).not.toBe("francetravail");
    }
  });

  it("every URL stays syntactically valid (no whitespace inside a host/path token)", async () => {
    const out = (await run()).text;
    for (const url of out.match(/(?:https?:\/\/|www\.)\S*/g) ?? []) {
      expect(url).toMatch(/^(?:https?:\/\/|www\.)[\w.-]+(?:\/\S*)?$/);
    }
  });

  it("redacted the 11-digit numéro France Travail and the member's own identity", async () => {
    const out = (await run()).text;
    for (const v of ["20283965881", "44 AV DES PEUPLIERS", "59120 LOOS", "VERNAUX", "6813942K"]) {
      expect(out).not.toContain(v);
    }
  });

  it("legal-article references and schedule prose are NOT read as addresses", async () => {
    const out = (await run()).text;
    expect(out).toContain("articles R. 5312-38 à R. 5312-46 du code du travail");
    expect(out).toContain("entre le 28\n du mois en cours et le 15 du mois suivant");
  });
});
