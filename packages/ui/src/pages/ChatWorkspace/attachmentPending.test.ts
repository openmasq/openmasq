import { getMessages } from "@openmasq/i18n";
import { describe, expect, it } from "vitest";
import { isPreviewPending, progressLabel } from "./attachmentPending";

const fr = getMessages("fr");

describe("isPreviewPending — l'aperçu n'a encore rien de masqué à montrer", () => {
  it("pendant la lecture (OCR), l'aperçu attend", () => {
    expect(isPreviewPending({ extracting: true })).toBe(true);
  });

  it("pendant le PREMIER masquage, l'aperçu attend — jamais le document en clair", () => {
    expect(isPreviewPending({ redacting: true })).toBe(true);
  });

  it("un REmasquage garde le vrai aperçu (il porte son propre état)", () => {
    expect(isPreviewPending({ redacting: true, replacements: [] })).toBe(false);
  });

  it("une pièce prête ou en erreur ouvre le vrai aperçu", () => {
    expect(isPreviewPending({})).toBe(false);
    expect(isPreviewPending({ replacements: [] })).toBe(false);
  });
});

describe("progressLabel — la même ligne sur la chip et dans l'aperçu en attente", () => {
  it("un OCR paginé dit la page en cours", () => {
    expect(progressLabel({ extracting: true, extractProgress: { done: 2, total: 12 } }, fr)).toBe(
      fr.composer.attachments.stateReadingPage(3, 12),
    );
  });

  it("la dernière page ne déborde pas du total", () => {
    expect(progressLabel({ extracting: true, extractProgress: { done: 12, total: 12 } }, fr)).toBe(
      fr.composer.attachments.stateReadingPage(12, 12),
    );
  });

  it("sans pagination, la lecture reste générique", () => {
    expect(progressLabel({ extracting: true }, fr)).toBe(fr.composer.attachments.stateReading);
  });

  it("le masquage par morceaux donne un pourcentage", () => {
    expect(progressLabel({ redacting: true, redactProgress: { done: 1, total: 4 } }, fr)).toBe(
      fr.composer.attachments.stateMaskingPct(25),
    );
    expect(progressLabel({ redacting: true }, fr)).toBe(fr.composer.attachments.stateMasking);
  });

  it("ni lecture ni masquage : rien", () => {
    expect(progressLabel({}, fr)).toBeNull();
  });
});
