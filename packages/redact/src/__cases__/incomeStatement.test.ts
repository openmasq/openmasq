import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { pseudonymize } from "../index";

/* Regression suite for the financial-statement header (compte de résultat / bilan):
   the denomination sits directly ABOVE its bare SIREN/SIRET with no label at all,
   and the digits are OCR'd (Luhn-INVALID on purpose here) — so neither the labeled
   rules nor the checksummed bare-SIRET rule can fire. The header PAIR is the signal
   (engine/orgContext.ts family 4); everything else on the statement is generic
   accounting vocabulary + amounts and must ship VERBATIM. */

const text = readFileSync(
  fileURLToPath(new URL("../__fixtures__/income-statement.txt", import.meta.url)),
  "utf8",
);

describe("compte de résultat — the header pair is redacted, the statement is not", () => {
  it("redacted the denomination AND its bare SIREN/SIRET", async () => {
    const vault: Record<string, string> = {};
    const out = await pseudonymize(text, { vault });
    expect(out.text).not.toContain("KARL STUDIO");
    expect(out.text).not.toContain("KARL");
    expect(out.text).not.toContain("91186429738250");
    // The id's fake keeps the 14-digit shape (no size hint leaks).
    const idFake = Object.entries(vault).find(([, v]) => v === "91186429738250")?.[0];
    expect(idFake).toMatch(/^\d{14}$/);
  });

  it("titles, accounting labels and amounts stay VERBATIM", async () => {
    const out = (await pseudonymize(text, { vault: {} })).text;
    for (const v of [
      "Compte de résultat 2024", "COMPTE DE RESULTAT", "Chiffre d’affaires",
      "Total des produits d’exploitation", "RESULTAT DE L’EXERCICE",
      "4820", "6135", "-1315", "PRÉVISIONNEL",
      "Exercice du : 01/01/2024 au 31/12/2024",
    ]) {
      expect(out).toContain(v);
    }
  });

  it("every vault original is fully substituted", async () => {
    const vault: Record<string, string> = {};
    const out = await pseudonymize(text, { vault });
    for (const original of Object.values(vault)) expect(out.text).not.toContain(original);
  });
});
