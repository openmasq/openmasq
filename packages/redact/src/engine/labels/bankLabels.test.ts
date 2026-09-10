import { describe, expect, it } from "vitest";
import { pseudonymize } from "../../index";

/**
 * A pasted payment table — the shape that held BIC at 74 %, the lowest of every category
 * the product claims. The `bic` RULE is keyword-gated on purpose (eight upper-case
 * alphanumerics is also the shape of a shouted word), and the gate looks a few words back.
 * In a CSV the keyword is written ONCE, in the header, and the codes sit in rows below it.
 */
const TABLE = [
  "beneficiaire;bic;montant",
  "Tristan Maroneau;AGRIFRPP812;1 250,00",
  "Éric Gaspard-Garalent;CEPAFRPP751;480,00",
  "Coline Gisele;SOGEFRPPXXX;2 900,00",
].join("\n");

const vaultOf = async (text: string) => {
  const vault: Record<string, string> = {};
  await pseudonymize(text, { vault });
  return Object.values(vault);
};

describe("a bank code named by its COLUMN, not by the word beside it", () => {
  it("masks every BIC in a pasted payment table", async () => {
    const found = await vaultOf(TABLE);
    for (const bic of ["AGRIFRPP812", "CEPAFRPP751", "SOGEFRPPXXX"]) {
      expect(found).toContain(bic);
    }
  });

  it("still masks the one the keyword announces — the gate is not replaced, it is joined", async () => {
    expect(await vaultOf("BIC : BNPAFRPPXXX")).toContain("BNPAFRPPXXX");
    expect(await vaultOf("SWIFT-BIC: COBADEFFXXX")).toContain("COBADEFFXXX");
  });

  it("reads an IBAN column too — the label group it never had", async () => {
    const found = await vaultOf(
      ["nom;iban", "Fanny Leandre;FR76 3000 4000 0312 3456 7890 143"].join("\n"),
    );
    expect(found.some((v) => v.replace(/\s/g, "").includes("FR7630004000"))).toBe(true);
  });

  it("does not turn a shouted word next to money into a bank code", async () => {
    // The reason the rule is gated in the first place: this must stay in clear.
    const found = await vaultOf("MONSIEUR, le virement de 1 250,00 € est parti.");
    expect(found).not.toContain("MONSIEUR");
  });
});
