import { describe, expect, it } from "vitest";
import { ocrShortfall } from "./ocrShortfall";

/** The chip for a truncated attachment must say so — and only when it is TRUE. */
describe("ocrShortfall", () => {
  it("dit la troncature quand l'OCR s'est arrêté au plafond", () => {
    expect(ocrShortfall({ ocr: { engine: "doctr", ms: 1, pages: 10, pagesTotal: 32 } }))
      .toEqual({ read: 10, total: 32 });
  });

  it("rien quand tout a été lu — un avertissement permanent cesse d'être lu", () => {
    expect(ocrShortfall({ ocr: { engine: "doctr", ms: 1, pages: 8, pagesTotal: 8 } })).toBeNull();
    // `pdf-text` (text layer, no OCR) has no pages: never a warning.
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
