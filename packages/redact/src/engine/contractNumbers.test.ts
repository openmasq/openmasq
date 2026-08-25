import { describe, it, expect } from "vitest";
import { detectContractNumbers } from "./contextFields";

/* Mesuré sur documents administratifs réels : les identifiants de RELATION (client,
   dossier, police, commande, PDL) étaient le plus gros gisement de rappel — aucune
   règle ne connaissait ces libellés. Toutes les valeurs ci-dessous sont synthétiques. */
const vals = (t: string) => detectContractNumbers(t).map((d) => d.value);

describe("identifiants de relation client (libellé + chiffres)", () => {
  it("attrape les libellés des documents réels", () => {
    expect(vals("N° client : 5019283746")).toEqual(["5019283746"]);
    expect(vals("N° de client : 5 019 283 746")).toEqual(["5 019 283 746"]);
    expect(vals("Numéro de dossier assurance : 18372910")).toEqual(["18372910"]);
    expect(vals("Référence de la commande (n° facture) : 791234509876")).toEqual(["791234509876"]);
    expect(vals("immatriculée au Registre sous le n° 08123456")).toEqual(["08123456"]);
    expect(vals("N° de certification : 21-3434")).toEqual(["21-3434"]);
  });

  it("tolère des mots de liaison entre le libellé et le numéro", () => {
    // « Numéro de police et date de validité : 86512345/801234567 » — la forme réelle
    // d'un rapport de diagnostic ; le run accepte le « / » des polices d'assurance.
    expect(vals("Numéro de police et date de validité : 86512345/801234567")).toEqual([
      "86512345/801234567",
    ]);
  });

  it("attrape un PDL même quand le numéro est à la ligne suivante", () => {
    expect(vals("• Point de livraison (PDL) :\nN° 14431234568470")).toEqual(["14431234568470"]);
  });

  it("ne gate JAMAIS sur le nom commun seul", () => {
    // « la police », « le contrat », « je me rends compte » : sans tête de libellé
    // (n°/numéro/référence) ni forme « X n° », la prose reste de la prose.
    expect(vals("la police est intervenue au 36 quai des Orfèvres en 2024")).toEqual([]);
    expect(vals("le contrat prévoit une durée de 240 mois soit 1093,90 par mois")).toEqual([]);
    expect(vals("un dossier de 350 pages remis en 2023")).toEqual([]);
  });

  it("rejette une DATE : « n° de contrat du 12/05/2024 » nomme une date, pas un id", () => {
    expect(vals("n° de contrat du 12/05/2024")).toEqual([]);
  });

  it("rejette un montant et un numéro trop court", () => {
    expect(vals("facture n° 123")).toEqual([]);
    expect(vals("référence de la facture : 1234,56")).toEqual([]);
  });
});
