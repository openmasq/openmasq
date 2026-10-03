import { getMessages } from "@openmasq/i18n";
import { describe, expect, it } from "vitest";
import { extractProgressPatch, isPreviewPending, isProgressFor, progressLabel } from "./attachmentPending";

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

describe("la file d'extraction — un fichier attend son tour, et le dit", () => {
  it("en attente : la chip dit combien de fichiers passent avant", () => {
    expect(progressLabel({ extracting: true, extractQueued: 3 }, fr)).toBe(fr.composer.attachments.stateQueued(3));
  });

  it("0 devant = c'est son tour : la lecture reprend la parole", () => {
    expect(progressLabel({ extracting: true, extractQueued: 0 }, fr)).toBe(fr.composer.attachments.stateReading);
  });

  it("un fichier en attente ouvre l'aperçu en attente, pas le document", () => {
    expect(isPreviewPending({ extracting: true, extractQueued: 2 })).toBe(true);
  });

  it("une page lue remplace l'attente (et inversement), jamais les deux à la fois", () => {
    expect(extractProgressPatch({ done: 0, total: 0, queued: 2 })).toEqual({
      extractQueued: 2,
      extractProgress: undefined,
    });
    expect(extractProgressPatch({ done: 1, total: 5 })).toEqual({
      extractQueued: undefined,
      extractProgress: { done: 1, total: 5 },
    });
  });
});

describe("isProgressFor — le canal de progression est partagé", () => {
  it("deux fichiers de même nom ne se mélangent pas : le chemin tranche", () => {
    const a = { name: "scan.pdf", path: "/a/scan.pdf" };
    const b = { name: "scan.pdf", path: "/b/scan.pdf" };
    const evt = { name: "scan.pdf", path: "/b/scan.pdf" };
    expect(isProgressFor(evt, a)).toBe(false);
    expect(isProgressFor(evt, b)).toBe(true);
  });

  it("sans chemin (route des octets, un dépôt), le nom suffit", () => {
    expect(isProgressFor({ name: "x.pdf" }, { name: "x.pdf" })).toBe(true);
    expect(isProgressFor({ name: "y.pdf" }, { name: "x.pdf" })).toBe(false);
  });
});

describe("progressLabel — un document LONG dit combien de temps il reste", () => {
  it("court : le pourcentage seul ; long : le pourcentage et les minutes restantes", () => {
    const p = { redacting: true, redactProgress: { done: 1, total: 4 } };
    expect(progressLabel({ ...p, chars: 20_000 }, fr)).toBe(fr.composer.attachments.stateMaskingPct(25));
    // 400k chars ≈ 100 s estimated; three quarters left ⇒ 2 min (rounded up).
    expect(progressLabel({ ...p, chars: 400_000 }, fr)).toBe("Masquage · 25 % · environ 2 min");
    expect(progressLabel({ redacting: true, chars: 400_000 }, fr)).toBe(
      "Document long : masquage en cours, environ 2 min",
    );
  });
});
