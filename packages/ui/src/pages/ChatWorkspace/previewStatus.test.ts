import { getMessages } from "@openmasq/i18n";
import { describe, it, expect } from "vitest";
import { previewStatus } from "./composerDetection";

/* L'aperçu du composeur a deux couches : les règles déterministes, synchrones, puis le
   NER ~1 s plus tard.

   Un bench manuel de 100 prompts a été conduit exactement dans cette fenêtre : neuf
   entités bel et bien protégées à l'envoi (Acme, Kelm, Rebour & Associés, TechnipFMC…)
   y ont été consignées comme des fuites, et le testeur a conclu que le redaction ne
   fonctionnait pas. Aucune donnée n'était en danger ; c'est la CONFIANCE qui l'était.

   Ce que ça impose ici : pendant l'analyse, cette pastille ne dit RIEN — ni un compte
   partiel qui se lirait comme un total, ni un zéro. L'état « ça travaille » est porté par
   le bouton d'envoi, sur exactement la même fenêtre (`busy = redacting || detecting`). */

const fr = getMessages("fr");

describe("previewStatus — l'aperçu ne promet que ce qu'il a calculé", () => {
  it("se tait tant qu'une couche travaille, même avec des valeurs déjà repérées", () => {
    // Un compte partiel affiché ici se lirait comme le résultat final.
    expect(previewStatus(true, 2, true, fr)).toEqual({ kind: "none" });
    expect(previewStatus(true, 0, true, fr)).toEqual({ kind: "none" });
  });

  it("n'affiche le total qu'une fois les deux couches revenues", () => {
    expect(previewStatus(false, 3, true, fr)).toEqual({ kind: "count", label: "3 à redact" });
  });

  it("le zéro acquis est muet", () => {
    expect(previewStatus(false, 0, true, fr)).toEqual({ kind: "none" });
  });

  it("ne dit rien sur un composeur vide", () => {
    expect(previewStatus(true, 0, false, fr)).toEqual({ kind: "none" });
    expect(previewStatus(false, 5, false, fr)).toEqual({ kind: "none" });
  });
});
