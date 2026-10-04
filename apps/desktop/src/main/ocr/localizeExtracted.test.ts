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

  it("a PDF past the page cap says its size, the cap and what to do, in both languages", () => {
    const f = file({ error: "x", errorCode: "pdf_too_many_pages", errorParams: { pages: 2400, max: 2000 } });
    expect(localizeExtracted(f, fr).error).toBe("PDF trop long (2400 pages, 2000 maximum). Découpez-le en plusieurs parties.");
    expect(localizeExtracted(f, en).error).toBe("PDF too long (2400 pages, 2000 max). Split it into smaller parts.");
    expect(localizeExtracted({ ...f, errorParams: {} }, en).error).toBe("x");
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

  it("a PDF too long to mask in full is refused in both languages, still blocked", () => {
    const f = file({ kind: "pdf", error: "x", errorCode: "too_long_to_mask", errorParams: { pages: 400 }, blocked: true });
    expect(localizeExtracted(f, fr).error).toBe("Document trop long pour être masqué en entier (≈ 400 pages). Découpez-le en plusieurs parties.");
    expect(localizeExtracted(f, en)).toMatchObject({ error: en.refused.tooLongToMask(400), blocked: true });
  });

  it("a digital PDF whose image pages failed OCR says it is not attached, not « no text layer »", () => {
    const f = file({ kind: "pdf", error: "x", errorCode: "ocr_failed", errorParams: { unread: 3 } });
    expect(localizeExtracted(f, en).error).toBe(en.pdfPagesUnread(3, en.ocr.failed));
    expect(localizeExtracted(f, fr).error).toMatch(/^Ce PDF n'est pas joint : ses 3 pages en image/);
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
  it("French keeps its wording", () => {
    expect(fr.markers.pageTooLarge(4)).toBe("[… page 4 non océrisée : dimensions excessives]");
  });

  it("English", () => {
    expect(en.markers.pageTooLarge(4)).toBe("[… page 4 not OCR'd: dimensions too large]");
  });
});
