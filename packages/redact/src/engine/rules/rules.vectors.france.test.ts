import { describe, expect, it } from "vitest";
import { redact } from "../../index";

// Extra CHECKSUM-VALID vectors for the FR rule families, in the phrasings real
// documents use (labels, NBSP grouping, wraps, serialized pairs) — the engine in
// marker mode, so rule ordering/overlap is exercised, same harness as
// rules.france.test.ts. Negative vectors pin the precision bar: a wrong checksum
// or a missing gate keyword must leave the value in CLEAR.
function out(text: string): string {
  return redact(text, {}).text;
}
function redacted(text: string, value: string): boolean {
  const o = out(text);
  return !o.includes(value) && /\[REDACTED_[A-Z_]+_\d+\]/.test(o);
}

describe("NIR — labelled, dotted, wrapped, feminine forms", () => {
  const cases: Array<[string, string]> = [
    ["labelled sécu", "N° de sécurité sociale : 1 84 03 75 120 005 49"],
    ["feminine, spaced with key", "assurée 2 84 07 75 099 123 90 régime général"],
    ["dotted grouping", "NIR 1.84.03.75.120.005.49 vérifié"],
    ["mixed NBSP grouping", "sécu 1 84 03 75 120 005 49 :"],
    ["13 digits, no key, spaced", "immatriculé 1 84 03 75 120 005 à ce jour"],
  ];
  for (const [name, text] of cases) {
    it(`redacts a NIR — ${name}`, () => {
      const o = out(text);
      expect(o).toMatch(/REDACTED_NATIONAL_ID/);
      expect(o).not.toMatch(/\d{2} ?\d{2} ?\d{3} ?\d{3}/);
    });
  }

  it("redacts a NIR wrapped mid-value (one line break)", () => {
    expect(redacted("NIR : 1 84 03 75\n120 005 49 (copie)", "120 005 49")).toBe(true);
  });

  it("leaves a date-time and an epoch in clear (the classic NIR look-alikes)", () => {
    expect(out("réunion le 30/06/2026 à 14:32:05")).toContain("30/06/2026");
    expect(out('{"created": 1650318742596}')).toContain("1650318742596");
  });
});

describe("cartes bancaires — separator variants (all Luhn-valid)", () => {
  const cases: Array<[string, string]> = [
    ["Visa dashed", "4556-7375-8689-9855"],
    ["Visa NBSP-grouped (PDF)", "4539 5787 6362 1486"],
    ["Amex 4-6-5", "3714 496353 98431"],
    ["16 glued", "4556737586899855"],
  ];
  for (const [name, value] of cases) {
    it(`redacts a PAN — ${name}`, () => {
      expect(redacted(`Carte : ${value} exp 09/27`, value)).toBe(true);
    });
  }

  it("a 16-digit run FAILING Luhn stays in clear (an order number, not a PAN)", () => {
    expect(out("commande 4556737586899856 expédiée")).toContain("4556737586899856");
  });

  it("real-document separators: double space, typographic dashes, hyphenated wrap", () => {
    expect(redacted("carte 4539  5787  6362  1486 refusée", "1486")).toBe(true); // PDF column gap
    expect(redacted("carte 4539–5787–6362–1486 (relevé Word)", "1486")).toBe(true); // en-dash
    expect(redacted("carte 4539—5787—6362—1486", "1486")).toBe(true); // em-dash
    expect(redacted("paiement carte 4539 5787 6362 14-\n86 refusé", "4539 5787")).toBe(true); // césure
  });
});

describe("IBAN — case, grouping, dotted, wrapped (all mod-97-valid)", () => {
  const cases: Array<[string, string]> = [
    ["FR with RIB letters", "FR33 3000 2005 5000 0015 7841 Z25"],
    ["DE glued", "DE89370400440532013000"],
    ["GB with bank code", "GB29 NWBK 6016 1331 9268 19"],
    ["IT with CIN letter", "IT60X0542811101000000123456"],
    ["dot-grouped", "FR33.3000.2005.5000.0015.7841.Z25"],
    ["hand-typed LOWERCASE", "fr33 3000 2005 5000 0015 7841 z25"],
    ["auto-capitalised MIXED case", "Fr33 3000 2005 5000 0015 7841 z25"],
  ];
  for (const [name, value] of cases) {
    it(`redacts an IBAN — ${name}`, () => {
      expect(redacted(`virement vers ${value} merci`, value)).toBe(true);
    });
  }

  it("redacts an IBAN wrapped mid-value; a 2-newline COLUMN is refused", () => {
    expect(redacted("IBAN FR33 3000 2005\n5000 0015 7841 Z25", "7841 Z25")).toBe(true);
    const col = "FR33 3000 2005\n5000 0015\n7841 Z25";
    expect(out(col)).toContain("7841 Z25");
  });

  it("an IBAN-shaped run failing mod-97 stays in clear", () => {
    expect(out("réf FR76 3000 6000 0112 3456 7890 180 interne")).toContain("7890 180");
  });
});

describe("RIB / BIC — the French bank-coordinate block", () => {
  it("redacts a labelled RIB (checksummed) and its serialized JSON form", () => {
    expect(redacted("RIB : 30002 00550 0000157841Z 25", "0000157841Z")).toBe(true);
    expect(redacted('"rib":"20041 01000 5012345678943"', "5012345678943")).toBe(true);
  });

  it("redacts a BIC after its keyword, parenthesised and serialized forms included", () => {
    expect(redacted("BIC : BNPAFRPPXXX", "BNPAFRPPXXX")).toBe(true);
    expect(redacted("le BIC saisi (AGRIFRPP812) est refusé", "AGRIFRPP812")).toBe(true);
    expect(redacted('"bic":"CMCIFR2A"', "CMCIFR2A")).toBe(true);
  });

  it("an 8-letter ALLCAPS word without the keyword is never a BIC", () => {
    expect(out("le sigle ACPRAMFB est cité")).toContain("ACPRAMFB");
  });
});

describe("SIREN / SIRET / TVA — legal-boilerplate phrasings", () => {
  const cases: Array<[string, string, string]> = [
    ["SIREN behind n°", "immatriculée sous le n° SIREN 863 471 587", "863 471 587"],
    ["SIRET colon", "SIRET : 86347158700015", "86347158700015"],
    ["bare SIRET (double Luhn)", "établissement 863 471 587 00015 ouvert", "863 471 587 00015"],
    ["TVA labelled", "N° TVA intracommunautaire : FR91863471587", "FR91863471587"],
    ["TVA bare (double checksum)", "facture émise par FR 91 863 471 587 ce jour", "FR 91 863 471 587"],
    ["RCS after number", "société 863 471 587 RCS Paris", "863 471 587"],
  ];
  for (const [name, text, value] of cases) {
    it(`redacts — ${name}`, () => {
      expect(redacted(text, value)).toBe(true);
    });
  }

  it("a 14-digit run failing the double Luhn stays in clear without a keyword", () => {
    expect(out("colis 86347158700016 suivi")).toContain("86347158700016");
  });
});

describe("identifiants gated — CAF, INE, RUM, PNR, dossier", () => {
  const cases: Array<[string, string, string]> = [
    ["CAF allocataire", "n° allocataire CAF : 1234567", "1234567"],
    ["France Travail", "identifiant France Travail 12345678901", "12345678901"],
    ["INE (BEA)", "INE : 1234567890K", "1234567890K"],
    ["RUM SEPA", "référence unique du mandat : RUM-2024-00123456", "RUM-2024-00123456"],
    ["PNR", "référence de réservation : X4G7K9", "X4G7K9"],
    ["dossier tri-segment", "Dossier : 2026/BM/44127 en cours", "2026/BM/44127"],
  ];
  for (const [name, text, value] of cases) {
    it(`redacts — ${name}`, () => {
      expect(redacted(text, value)).toBe(true);
    });
  }

  it("the same shapes stay in clear WITHOUT their scheme keyword", () => {
    expect(out("lot 1234567 expédié")).toContain("1234567");
    expect(out("le code X4G7K9 du produit")).toContain("X4G7K9");
  });
});

describe("précision — ordinary business numbers never redact", () => {
  it("amounts, invoice refs, percentages, versions pass through", () => {
    for (const text of [
      "montant dû : 850 000 €",
      "facture F-2026-0456 réglée",
      "remise de 12,5 % appliquée",
      "commande n° 458912307 confirmée", // 9 digits, fails Luhn, no keyword
      "on passe en 10.2.4 lundi",
    ]) {
      const o = out(text);
      expect(o).toBe(text);
    }
  });
});
