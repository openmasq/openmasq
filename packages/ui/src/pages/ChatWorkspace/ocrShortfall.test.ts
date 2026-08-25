import { describe, expect, it } from "vitest";
import { ocrShortfall } from "./ocrShortfall";

/** Le chip d'une pièce jointe tronquée doit le dire — et seulement quand c'est VRAI. */
describe("ocrShortfall", () => {
  it("dit la troncature quand l'OCR s'est arrêté au plafond", () => {
    expect(ocrShortfall({ ocr: { engine: "doctr", ms: 1, pages: 10, pagesTotal: 32 } }))
      .toEqual({ read: 10, total: 32 });
  });

  it("rien quand tout a été lu — un avertissement permanent cesse d'être lu", () => {
    expect(ocrShortfall({ ocr: { engine: "doctr", ms: 1, pages: 8, pagesTotal: 8 } })).toBeNull();
    // `pdf-text` (couche texte, pas d'OCR) n'a pas de pages : jamais d'avertissement.
    expect(ocrShortfall({ ocr: { engine: "pdf-text", ms: 1 } })).toBeNull();
    expect(ocrShortfall({})).toBeNull();
  });

  it("rien pendant l'extraction ni sur une erreur — chaque état son message", () => {
    expect(
      ocrShortfall({ extracting: true, ocr: { engine: "doctr", ms: 1, pages: 10, pagesTotal: 32 } }),
    ).toBeNull();
    expect(
      ocrShortfall({ error: "x", ocr: { engine: "doctr", ms: 1, pages: 10, pagesTotal: 32 } }),
    ).toBeNull();
  });
});
