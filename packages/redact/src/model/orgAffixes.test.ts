import { describe, expect, it } from "vitest";
import { pseudonymize } from "./pseudonymize";
import { stripOrgAffixes, isOrgAffix, isGenericTerm } from "./detect";
import { unredact } from "../engine/vault";
import type { Vault } from "../types";

// Simulate the AI detector: a `complete` returning the findings as the JSON array
// `detectWithModel` expects (same helper the other AI-path tests use).
function modelReturning(findings: { value: string; category: string }[]) {
  return async () => JSON.stringify(findings);
}

describe("stripOrgAffixes — company span → distinctive core", () => {
  it("strips a leading descriptor / legal form", () => {
    expect(stripOrgAffixes("société KARL STUDIO")).toBe("KARL STUDIO");
    expect(stripOrgAffixes("SAS Rebour")).toBe("Rebour");
    expect(stripOrgAffixes("Groupe Rocher")).toBe("Rocher");
  });

  it("strips a trailing legal form / the 'Forme' field-label glue", () => {
    expect(stripOrgAffixes("KARL STUDIO Forme")).toBe("KARL STUDIO");
    expect(stripOrgAffixes("Rocher Inc")).toBe("Rocher");
    expect(stripOrgAffixes("Norwood Labs SAS")).toBe("Norwood Labs"); // "labs" is not an affix
  });

  it("preserves a legal name whose words include a role/connector", () => {
    expect(stripOrgAffixes("Rebour & Associés")).toBe("Rebour & Associés");
  });

  it("strips table/field glue around the name (the bilan 'Associés - X en société' line)", () => {
    expect(stripOrgAffixes("Associés - KARL STUDIO en société")).toBe("KARL STUDIO");
    expect(stripOrgAffixes("KARL STUDIO en société")).toBe("KARL STUDIO");
    // the left side of the spaced dash must be ALL generic — a real name keeps it
    expect(stripOrgAffixes("Rocher - Studio")).toBe("Rocher - Studio");
    // a trailing connector is only glue at the END — inside a name it survives
    expect(stripOrgAffixes("Bank of America")).toBe("Bank of America");
  });

  it("never strips to empty — an all-affix value is left for the whole-value drop", () => {
    expect(stripOrgAffixes("SAS")).toBe("SAS");
    expect(stripOrgAffixes("Société")).toBe("Société");
  });
});

describe("legal forms / roles are generic (never PII on their own)", () => {
  it("drops a bare company form / associate / officer role", () => {
    for (const v of [
      "SAS", "SASU", "SARL", "EURL", "SNC", "SCI", "SCOP",
      "Société", "société", "Entreprise", "Cabinet", "Compagnie",
      "Associé Unique", "Associé", "Dirigeant", "Actionnaire",
      "Raison sociale", "Forme juridique",
    ]) {
      expect(isGenericTerm(v)).toBe(true);
    }
    // a real company/person name stays redactable
    expect(isGenericTerm("Karl Studio")).toBe(false);
    expect(isGenericTerm("Sabourdin")).toBe(false);
  });

  it("isOrgAffix is case-insensitive and trims surrounding punctuation", () => {
    expect(isOrgAffix("SAS,")).toBe(true);
    expect(isOrgAffix("Groupe")).toBe(true);
    expect(isOrgAffix("studio")).toBe(false);
  });
});

describe("ubiquitous data/UI/status words are generic in many languages", () => {
  it("drops a bare data/table/status word a NER over-tags in tool output", () => {
    for (const v of [
      // the exact trace false positives ("Colonnes"→a city, "World"→a company)…
      "Colonnes", "World", "Erreur", "Résultat", "Valeur",
      // …and their siblings across FR/EN/ES/IT/DE/PT/NL/PL
      "column", "columna", "colonna", "spalte", "kolumna",
      "monde", "mundo", "welt", "wereld",
      "error", "errore", "fehler", "fout",
      "resultado", "risultato", "ergebnis", "wynik",
      "search", "recherche", "búsqueda", "suche", "zoeken",
      "performance", "rendement", "graphique", "chart",
    ]) {
      expect(isGenericTerm(v), v).toBe(true);
    }
  });

  it("does NOT spare a name/brand that doubles as a word (allow-list discipline)", () => {
    // These were deliberately OMITTED — sparing them would leak the value forever.
    for (const v of ["Max", "Rose", "Media", "Iva", "Dane", "Mai"]) {
      expect(isGenericTerm(v), v).toBe(false);
    }
    expect(isGenericTerm("Amundi")).toBe(false); // a real fund issuer stays redactable
  });
});

describe("one company = ONE fake across affix variants (AI path)", () => {
  it("maps 'société KARL STUDIO' and 'KARL STUDIO Forme' to the SAME fake", async () => {
    const input =
      "La société KARL STUDIO facture. KARL STUDIO Forme juridique : SASU.";
    const vault: Vault = {};
    const { text } = await pseudonymize(input, {
      complete: modelReturning([
        { value: "société KARL STUDIO", category: "ORG" },
        { value: "KARL STUDIO Forme", category: "ORG" },
        { value: "SASU", category: "ORG" }, // bare legal form → must NOT be faked
      ]),
      vault,
      numbers: false,
    });

    // "KARL STUDIO" is ONE identity → exactly one vault entry, one fake everywhere.
    const orgEntries = Object.entries(vault).filter(([, v]) => v === "KARL STUDIO");
    expect(orgEntries).toHaveLength(1);
    const fake = orgEntries[0][0];
    expect(text).toContain("société " + fake); // "société" itself stays in clear
    expect(text).toContain(fake + " Forme");

    // The bare legal form "SASU" is never faked.
    expect(vault["SASU"]).toBeUndefined();
    expect(text).toContain("SASU");

    expect(unredact(text, vault)).toBe(input); // fully reversible
  });
});

// Regression: a real bilan comptable. The detector reported the company only inside the
// glued table span "Associés - KARL STUDIO en société"; the span was faked WHOLE (core
// not extracted), so the STANDALONE "KARL STUDIO" in the document header left in CLEAR.
const BILAN = `KARL STUDIO
90887224400010
                                                                         BILAN 2023
Montants exprimés en euros
Exercice du : 01/12/2022 au 31/12/2023

                                                                Exercice 2023   Exercice 2022
                         BILAN ACTIF
                                                              Brut Amorts Net       Net
 Actionnaires - Capital souscrit non appelé                      0           0             0
 Immobilisations incorporelles                                   0       0   0             0
 Immobilisations corporelles                                     0       0   0             0
 Immobilisations financières                                   150       0 150             0
    Dépôts et cautionnements versés ou récupérés               150         150              0
 Total actif immobilisé                                        150       0 150              0
 Stocks et en-cours                                              0       0   0             0
 Fournisseurs débiteurs                                          0           0             0
 Créances                                                        0       0   0             0
 Associés - KARL STUDIO en société                               0           0             0
 Disponibilités                                                 48          48             0
    Banque 1                                                     1           1              0
    Banque 2                                                    46          46              0
 Charges constatées d'avance                                     0           0             0
 Total actif Circulant                                          48       0 48               0
 TOTAL ACTIF                                                   198       0 198             0

                                                               Exercice 2023   Exercice 2022
                         BILAN PASSIF
                                                                    Net            Net
 Capital                                                                 100               0
    Capital souscrit appelé versé                                        100                0
 Primes d'émission                                                         0               0
 Réserves                                                                  0               0
 Report à nouveau                                                          0               0
 Résultat de l'exercice                                                 -702               0
 Total Capitaux Propres                                                  -602               0
 Dettes financières                                                      800               0
    Associés - Comptes courants                                          300                0
    Virements internes                                                   500                0
 Clients créditeurs                                                        0               0
 Dettes d'exploitation                                                     0               0
                PRÉVISIONNEL
 Total Dettes                                                            800                0
 Produits constatés d'avance                                               0                0
 TOTAL PASSIF                                                            198               0`;

describe("bilan comptable — KARL STUDIO is redacted EVERYWHERE (header included)", () => {
  it("a glued table detection still redacts the standalone header occurrence", async () => {
    const vault: Vault = {};
    const { text } = await pseudonymize(BILAN, {
      complete: modelReturning([
        { value: "Associés - KARL STUDIO en société", category: "ORG" },
      ]),
      vault,
    });
    // No occurrence of the company survives, in any casing.
    expect(text).not.toMatch(/karl\s+studio/i);
    // The table boilerplate around the name stays in clear (only the CORE is faked).
    expect(text).toContain("Associés - ");
    expect(text).toContain(" en société");
    expect(text).toContain("Associés - Comptes courants");
    // ONE identity: a single vault entry maps back to the company.
    expect(Object.values(vault).filter((v) => v === "KARL STUDIO")).toHaveLength(1);
    expect(unredact(text, vault)).toBe(BILAN); // fully reversible
  });

  it("a plain detection of the name redacts it everywhere too", async () => {
    const vault: Vault = {};
    const { text } = await pseudonymize(BILAN, {
      complete: modelReturning([{ value: "KARL STUDIO", category: "ORG" }]),
      vault,
    });
    expect(text).not.toMatch(/karl\s+studio/i);
    expect(unredact(text, vault)).toBe(BILAN);
  });
});
