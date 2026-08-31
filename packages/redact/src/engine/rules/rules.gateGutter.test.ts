import { describe, it, expect } from "vitest";
import { pseudonymize } from "../../index";

/**
 * THE COLUMN GUTTER — the label and its value aligned in columns, the idiom of every
 * printed administrative document. Measured on 15/08/2026 on a REAL Kbis extract: the SIREN
 * of the REGISTERED AGENT was leaving in clear (18 spaces between « RCS, numéro » and it, so
 * beyond the separator window), while the company's own SIREN was only saved by the
 * « R.C.S. » that FOLLOWS it — a separate rule. A SIREN converts into a company name via
 * a public-registry lookup: masking the registered agent's name and leaving its number
 * masks nothing.
 *
 * What these cases pin is the BOUNDARY: a gutter of pure spaces crosses the
 * gate, any other content does not.
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
    // What makes the widening safe: between the keyword and the number there is ONLY
    // spaces. As soon as another column intervenes, the gate must no longer apply.
    const found = await vals("RCS Paris        Capital 100 EUROS        123456789");
    expect(found).not.toContain("123456789");
  });

  it("ne franchit pas un SAUT DE LIGNE (le cas vertical appartient à labelBlocks)", async () => {
    const found = await vals("Immatriculation au RCS, numéro\n\n\n        849 409 313");
    // The gate itself must not bet on a detached block; if it's detected, it will be
    // through a DIFFERENT gate (labelBlocks), never through a gutter crossing lines.
    expect(found.filter((v) => v === "849 409 313").length).toBeLessThanOrEqual(1);
  });
});
