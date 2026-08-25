import { describe, it, expect } from "vitest";
import { redact } from "../../index";

/* Les gardes contextuelles sont ce qui transforme des chiffres banals en identifiant.
   Mesuré sur une vraie carte d'identité scannée : docTR rend « CARTENATIONALE
   D'IDENTITÉ » — un espace en moins — et le numéro de CNI partait en clair. */
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
    // C'est tout l'intérêt d'une garde — une référence de commande n'est pas une pièce
    // d'identité, et la tolérance ne doit pas transformer la règle en détecteur de chiffres.
    const { matches } = redact("Référence de la commande : 140335300272");
    expect(matches.map((m) => m.value)).not.toContain("140335300272");
  });

  it("ne fusionne pas deux mots séparés par autre chose qu'un espace", () => {
    // « carte / nationale » sur deux lignes d'un tableau n'est pas le libellé.
    const { matches } = redact("carte\n\nquelque chose nationale d'identité 140335300272");
    expect(matches.map((m) => m.value)).not.toContain("140335300272");
  });
});
