import { describe, it, expect } from "vitest";
import { isUnreadableLayer, junkRatio } from "./readable";
import { extractFromBytes, PDF_TEXT_MIN } from "./core";

/**
 * The real case (15/08/2026): `read_document` on a supporting document returned 854 characters of
 * glyph codes — SUCCESSFULLY. An unreadable layer is more dangerous than an
 * absent one: absent, it triggers OCR; unreadable, it prevents it, and the page's PII
 * is therefore never examined.
 */
const CTRL = (n: number) => String.fromCharCode(n);
const DEBRIS = `uH[${CTRL(0)}${CTRL(14)}HHW${CTRL(21)}HBB${CTRL(25)}[\n\nW${CTRL(2)}S,cj;${CTRL(2)}c,#\n`.repeat(12);

describe("couche texte illisible", () => {
  it("reconnaît des codes de glyphes comme des débris", () => {
    expect(isUnreadableLayer(DEBRIS)).toBe(true);
  });

  it("⚠️ n'accuse JAMAIS du texte véritable — accents, CJK, maths, emoji, tableau", () => {
    const vrais = [
      "Facture n° 2024-0042 du 3 mars 2024 — montant TTC : 1 704,36 € (TVA 20 %).\n".repeat(4),
      "契約書の第三条に基づき、当事者は次のとおり合意する。".repeat(10),
      "∑(x²+y²) ≤ ∫ f(t) dt — voir annexe A.3, page 12.\n".repeat(6),
      "Point d'étape ✅ livré, ⚠️ à revoir, 🚀 en cours — réunion du 12/06.\n".repeat(6),
      "Poste\tBrut\tNet\nSalaires\t14 812,37\t11 240,08\nCharges\t6 118,90\t6 118,90\n".repeat(6),
    ];
    for (const t of vrais) {
      expect(junkRatio(t)).toBe(0);
      expect(isUnreadableLayer(t)).toBe(false);
    }
  });

  it("ne juge pas un échantillon trop court (fail-safe : on garde la couche)", () => {
    expect(isUnreadableLayer(`uH[${CTRL(0)}${CTRL(14)}HH`)).toBe(false);
  });

  it("une couche illisible se traite comme ABSENTE : l'OCR est tenté et PROMU", async () => {
    const deps = {
      pdfText: async () => ({ text: DEBRIS, pages: 1, imagePages: 1 }),
      docxText: async () => "",
      ocrImage: async () => "",
      ocrPdf: async () => ({
        text: "FACTURE OVH — 106,98 € TTC",
        meta: { engine: "test", ms: 1 },
        layout: [],
      }),
    };
    const f = await extractFromBytes(
      new Uint8Array([0x25, 0x50, 0x44, 0x46]),
      { name: "justif.pdf" },
      deps as never,
    );
    // It's the OCR the model will read, not the debris.
    expect(f.text).toContain("106,98");
    expect(f.text).not.toContain("HBB");
    // And LENGTH alone wouldn't have caught it: the debris cleared the threshold.
    expect(DEBRIS.length).toBeGreaterThan(PDF_TEXT_MIN);
  });
});
