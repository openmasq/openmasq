import { describe, it, expect } from "vitest";
import { detectIdentityDocFields } from "./identityDocs";

/* Measured on a real scanned French ID card: 2 out of 5 values caught, because a card
   doesn't write « Nom : X » but « Nom X », and OCR damages the labels themselves.
   The relaxation is GATED on the document's header — that's what makes it safe. */
const vals = (t: string) => detectIdentityDocFields(t).map((d) => [d.category, d.value]);

const CARD = `REPUBLIQUE FRANCAISE
CARTENATIONALE D'IDENTITÉ No: 090476102853  Nationalité Française
   GT Nom CHANDREL
   Prénomis): CLAIRE ÉLISE
   SexeE F   Néle)le : 14.02.1988
   a: NANTES`;

describe("champs de pièce d'identité (heuristique gated sur l'en-tête)", () => {
  it("lit la carte OCR-abîmée : nom, prénoms, date, ville", () => {
    const v = vals(CARD);
    expect(v).toContainEqual(["NAME", "CHANDREL"]);
    expect(v).toContainEqual(["NAME", "CLAIRE ÉLISE"]);
    expect(v).toContainEqual(["DOB", "14.02.1988"]);
    expect(v).toContainEqual(["CITY", "NANTES"]);
  });

  it("lit aussi la forme PROPRE (non-régression du cas nominal)", () => {
    const v = vals("CARTE NATIONALE D'IDENTITÉ\nNom : BRIVET\nPrénom(s) : MARIE\nNé(e) le : 01.03.1990\nà : LYON");
    expect(v).toContainEqual(["NAME", "BRIVET"]);
    expect(v).toContainEqual(["NAME", "MARIE"]);
    expect(v).toContainEqual(["DOB", "01.03.1990"]);
    expect(v).toContainEqual(["CITY", "LYON"]);
  });

  it("SANS l'en-tête, ne détecte RIEN — c'est le gate qui porte toute la précision", () => {
    expect(vals("Nom CHANDREL\nPrénom: CLAIRE\nNé le : 14.02.1988\nà: NANTES")).toEqual([]);
  });

  it("dans une prose qui MENTIONNE la CNI, l'exigence ALL-CAPS retient les libellés usuels", () => {
    // « nom commun », « le nom de la rue » : prose casing → no match.
    const t = "J'ai perdu ma carte nationale d'identité hier. Le nom commun désigne une chose, et le nom de la rue a changé.";
    expect(vals(t)).toEqual([]);
  });

  it("nettoie les résidus OCR collés au run de capitales (RF, lettres isolées)", () => {
    const v = vals("CARTE NATIONALE D'IDENTITÉ\nNom BERGER RF");
    expect(v).toContainEqual(["NAME", "BERGER"]);
  });
});
