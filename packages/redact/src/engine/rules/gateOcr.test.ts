import { describe, it, expect } from "vitest";
import { redact } from "../../index";

/* Context gates are what turns banal digits into an identifier.
   Measured on a real scanned ID card: docTR renders « CARTENATIONALE
   D'IDENTITÉ » — one space missing — and the CNI number left in clear. */
describe("gardes contextuelles — tolérance au collage OCR", () => {
  it("attrape le numéro de CNI quand l'OCR a collé « CARTE » et « NATIONALE »", () => {
    const { matches } = redact("CARTENATIONALE D'IDENTITÉ No: 140335300272");
    expect(matches.map((m) => m.value)).toContain("140335300272");
  });

  it("le fait aussi sur le libellé correctement espacé (non-régression)", () => {
    const { matches } = redact("CARTE NATIONALE D'IDENTITÉ No: 140335300272");
    expect(matches.map((m) => m.value)).toContain("140335300272");
  });

  it("tolère un espacement SURNUMÉRAIRE, l'autre défaut d'OCR", () => {
    const { matches } = redact("CARTE  NATIONALE  D'IDENTITÉ n° 140335300272");
    expect(matches.map((m) => m.value)).toContain("140335300272");
  });

  it("n'ouvre pas la garde : sans le mot-clé, 12 chiffres restent 12 chiffres", () => {
    // That's the whole point of a gate — an order reference isn't an identity
    // document, and the tolerance must not turn the rule into a digit detector.
    const { matches } = redact("Référence de la commande : 140335300272");
    expect(matches.map((m) => m.value)).not.toContain("140335300272");
  });

  it("ne fusionne pas deux mots séparés par autre chose qu'un espace", () => {
    // « carte / nationale » across two lines of a table isn't the label.
    const { matches } = redact("carte\n\nquelque chose nationale d'identité 140335300272");
    expect(matches.map((m) => m.value)).not.toContain("140335300272");
  });
});
