import { describe, expect, it } from "vitest";
import { getMessages } from "@openmasq/i18n";
import type { ExtractedFile } from "@openmasq/redact/documents";
import { localizeExtracted } from "./localizeExtracted";

const en = getMessages("en").documents;
const fr = getMessages("fr").documents;
const file = (over: Partial<ExtractedFile>): ExtractedFile => ({ name: "f", kind: "file", text: "", chars: 0, ...over });

describe("an extraction failure, worded by its code", () => {
  it("a guard refusal: the user's language, still blocked", () => {
    const f = file({
      kind: "zip",
      error: "Ratio de compression anormal — fichier refusé (protection anti-bombe).",
      errorCode: "zip_ratio",
      blocked: true,
    });
    const out = localizeExtracted(f, en);
    expect(out.error).toBe(en.refused.zipRatio);
    expect(out.blocked).toBe(true);
    expect(out.error).not.toMatch(/anti-bombe|bomb/i);
  });

  it("numbers fill the sentence", () => {
    const f = file({ error: "x", errorCode: "image_too_large", errorParams: { width: 9000, height: 9000 } });
    expect(localizeExtracted(f, fr).error).toBe("Image refusée : dimensions trop grandes (9000×9000).");
    expect(localizeExtracted(f, en).error).toBe("Image refused: dimensions too large (9000×9000).");
  });

  it("missing numbers keep the engine's text rather than a sentence with a hole", () => {
    const f = file({ error: "fallback", errorCode: "file_too_large" });
    expect(localizeExtracted(f, en).error).toBe("fallback");
  });

  it("a scanned PDF names the context, then the cause, with no module name", () => {
    const f = file({ kind: "pdf", error: "PDF sans couche texte — moteur OCR indisponible (tesseract2.js …)", errorCode: "ocr_engine_missing" });
    const out = localizeExtracted(f, en).error ?? "";
    expect(out).toBe(en.scanPdf(en.ocr.engineMissing));
    expect(out).not.toMatch(/tesseract|\.js/);
  });

  it("an image whose OCR failed for an unknown cause", () => {
    const f = file({ kind: "image", error: "x", errorCode: "ocr_failed", rawCause: "stack" });
    const out = localizeExtracted(f, fr);
    expect(out.error).toBe(fr.imageOcrFailed);
    expect(out.rawCause).toBe("stack");
  });

  it("no code, or no error: untouched", () => {
    const a = file({ error: "Cannot read" });
    expect(localizeExtracted(a, en)).toBe(a);
    const b = file({ text: "ok", chars: 2 });
    expect(localizeExtracted(b, en)).toBe(b);
  });
});

describe("the OCR markers, per language", () => {
  it("French keeps its wording, with a real plural", () => {
    expect(fr.markers.pageTooLarge(4)).toBe("[… page 4 non océrisée : dimensions excessives]");
    expect(fr.markers.morePages(1)).toBe("[… 1 page supplémentaire non océrisée]");
    expect(fr.markers.morePages(3)).toBe("[… 3 pages supplémentaires non océrisées]");
  });

  it("English", () => {
    expect(en.markers.pageTooLarge(4)).toBe("[… page 4 not OCR'd: dimensions too large]");
    expect(en.markers.morePages(1)).toBe("[… 1 more page not OCR'd]");
    expect(en.markers.morePages(3)).toBe("[… 3 more pages not OCR'd]");
  });
});
