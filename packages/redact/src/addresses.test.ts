import { describe, it, expect } from "vitest";
import { detectAddresses } from "./engine/addresses";

/** The single ADDRESS value detected for `text` (there should be exactly one). */
function addr(text: string): string | undefined {
  return detectAddresses(text).find((d) => d.category === "ADDRESS")?.value;
}

describe("detectAddresses — trailing-tail normalisation", () => {
  // The SAME street address written with different trailing text (legal-form
  // boilerplate glued to the city) must collapse to ONE identical span — else each
  // variant is a distinct vault key → a different fake (the reported bug).
  const canonical = "61 RUE DE LYON 75012 PARIS";
  const variants: Array<[string, string]> = [
    ["glued lowercase suffix", "61 RUE DE LYON 75012 PARISsiège"],
    ["period + SIREN", "61 RUE DE LYON 75012 PARIS. SIREN"],
    ["period + SIRET + number", "61 RUE DE LYON 75012 PARIS. SIRET. 863 471 587"],
    ["period-glued Capital clause", "61 RUE DE LYON 75012 PARIS.Capital: 100€."],
    ["trailing Activité clause", "61 RUE DE LYON 75012 PARIS. Activité. Édition d"],
  ];

  for (const [label, input] of variants) {
    it(`stops at the city — ${label}`, () => {
      expect(addr(input)).toBe(canonical);
    });
  }

  it("all trailing variants yield ONE identical span (case-folded)", () => {
    const spans = new Set(
      [canonical, ...variants.map(([, v]) => v)].map((v) => addr(v)?.toLowerCase()),
    );
    expect(spans.size).toBe(1);
  });

  it("keeps multi-word and hyphenated cities intact", () => {
    expect(addr("42 chemin du Moulin, 74000 Annecy")).toBe("42 chemin du Moulin, 74000 Annecy");
    expect(addr("76 chemin du Moulin, 72000 Le Mans")).toBe("76 chemin du Moulin, 72000 Le Mans");
    expect(addr("5 rue Centrale, 13100 Aix-en-Provence")).toBe(
      "5 rue Centrale, 13100 Aix-en-Provence",
    );
  });

  it("does not cut a plain address that has no trailing junk", () => {
    expect(addr("4 RUE LOUIS BRAILLE, 06400 CANNES")).toBe("4 RUE LOUIS BRAILLE, 06400 CANNES");
  });

  it("leaves a street number that looks like a year alone", () => {
    expect(addr("rue du 8 Mai 1945, 75012 Paris")).toBe("rue du 8 Mai 1945, 75012 Paris");
  });
});

describe("detectAddresses — letterhead 'street - CP VILLE' (two-column statement)", () => {
  it("consumes the dash-joined postal+city as ONE span, never cut mid-word", () => {
    // The street NAME used to swallow "- 93360 NEUILLY-PLAI…" up to its 40-char cap and
    // cut MID-WORD — a span applyVault refuses to substitute, so the address leaked.
    expect(addr("148 avenue de la Grande Armée - 93360 NEUILLY-PLAISANCE CEDEX")).toBe(
      "148 avenue de la Grande Armée - 93360 NEUILLY-PLAISANCE CEDEX",
    );
  });

  it("a street name carrying digits still matches whole ('rue du 8 Mai 1945')", () => {
    expect(addr("36 rue du 8 Mai 1945, 35000 Rennes")).toBe("36 rue du 8 Mai 1945, 35000 Rennes");
  });
});

describe("detectAddresses — notarial 'VILLE (CP)' order (city BEFORE its postal)", () => {
  const places = (text: string) =>
    detectAddresses(text).filter((d) => d.category === "PLACE").map((d) => d.value);

  it("captures city + parenthesised CP as ONE PLACE span, à-gated", () => {
    expect(places("demeurant à CLICHY (92110) 2 rue des Lilas")).toEqual(["CLICHY (92110)"]);
    // An OCR-garbled caps city still matches (shape, not a city table).
    expect(places("demeurant à CLIFHY-SOUS-BQIS (93390) 2 mail X")).toEqual([
      "CLIFHY-SOUS-BQIS (93390)",
    ]);
  });

  it("digit-led tokens and a wrapped run ('PARIS 17ÈME\\nARRONDISSEMENT (75017)')", () => {
    expect(places("demeurant à PARIS 17ÈME\nARRONDISSEMENT (75017) 84 rue X")).toEqual([
      "PARIS 17ÈME\nARRONDISSEMENT (75017)",
    ]);
  });

  it("a department inside the parens and a dropped close paren are tolerated", () => {
    expect(places("situé à SAINT-QUEN (SFINF-SAINT-DENIS 93400\n17 Rue des Roses")).toEqual([
      "SAINT-QUEN (SFINF-SAINT-DENIS 93400",
    ]);
  });

  it("no 'à' gate → no match (a bare 'NAME (12345)' is not a place)", () => {
    expect(places("référence MORVAN (12345) au dossier")).toEqual([]);
  });
});

describe("detectAddresses — French shape-B false positives (article refs, prose)", () => {
  it("a legal-article reference is NOT an address ('articles R. 5312-38 …')", () => {
    expect(detectAddresses("prévues par les articles R. 5312-38 à R. 5312-46 du code du travail")).toEqual([]);
  });
  it("schedule prose with a street-type word is NOT an address ('… en cours et le 15 …')", () => {
    expect(detectAddresses("rendez-vous entre le 28 du mois en cours et le 15 du mois suivant")).toEqual([]);
  });
  it("a number-less French street WITH its 'CP Ville' tail still matches", () => {
    expect(addr("bureaux situés rue de la Paix, 75002 Paris")).toBe("rue de la Paix, 75002 Paris");
  });
});

describe("detectAddresses — SPACE-separated commune continuation (ST OUEN SUR SEINE)", () => {
  const places = (text: string) =>
    detectAddresses(text).filter((d) => d.category === "PLACE").map((d) => d.value);

  it("captures the connector-led ALL-CAPS continuation as ONE place span", () => {
    expect(places("demeurant 93400 ST OUEN SUR SEINE depuis 2019")).toEqual([
      "93400 ST OUEN SUR SEINE",
    ]);
    expect(places("adresse : 51300 VITRY LE FRANCOIS")).toEqual(["51300 VITRY LE FRANCOIS"]);
  });

  it("lowercase prose after the city is NOT part of the commune", () => {
    expect(places("le salon de 44000 NANTES en Bretagne")).toEqual(["44000 NANTES"]);
    expect(places("basé à 93400 ST OUEN sur la période")).toEqual(["93400 ST OUEN"]);
  });
});

/**
 * A tradesman writes without punctuation, and his message carries an AMOUNT right after the
 * address. Without a guard, two independent mechanisms were dragging that amount into the
 * address zone: the `NAME` class (permissive: digits + spaces, for "rue du 8 Mai 1945") ran
 * up to its cap, and above all `TAIL_CORE` read "2400" as a four-digit postal code followed
 * by a "city" — the capitalisation it believes it requires being inoperative, since the
 * patterns are compiled with the `i` flag.
 *
 * Consequence measured in the app: the amount would get replaced by a fake address, so the
 * model NEVER received it and rendered a quote with no price.
 */
describe("detectAddresses — un MONTANT n'est ni une rue ni un code postal", () => {
  it("s'arrête avant le montant, sur une phrase sans ponctuation", () => {
    expect(addr("devis chez mr savary 12 rue des lilas a vitry 2400 euros ht pose comprise")).toBe(
      "12 rue des lilas a vitry",
    );
  });

  it("refuse les quatre chiffres d'un prix comme code postal", () => {
    expect(addr("facture 12 rue des lilas 2400 EUR")).toBe("12 rue des lilas");
    expect(addr("12 rue des lilas a vitry 1 234,56 € TTC")).toBe("12 rue des lilas a vitry");
  });

  // The guard is narrow ON PURPOSE: these three must stay intact.
  it("ne touche pas aux chiffres LÉGITIMES d'une adresse", () => {
    expect(addr("adresse 5 rue du 8 Mai 1945 a Vitry")).toBe("5 rue du 8 Mai 1945 a Vitry");
    expect(addr("domicilié 4 avenue de la Grande Armée 75017 Paris")).toBe(
      "4 avenue de la Grande Armée 75017 Paris",
    );
    expect(addr("2 mail Camille du Gast, 92600, Asnières")).toBe("2 mail Camille du Gast, 92600, Asnières");
  });
});
