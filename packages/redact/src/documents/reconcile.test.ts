import { describe, it, expect } from "vitest";
import { hybridLayerText, redactExtracted } from "./reconcile";
import type { ExtractedFile, TextLayerPage, OcrLayerPage } from "./core";

/* The SACEM-relevé failure, miniaturised: the SAME phone number is invisible to BOTH
   existing layers — the text layer has the exact digits but its reconstruction scrambled
   their order (no detector fires on "12 34 06 56 78"), the OCR layer has the right order
   but misread a digit ("O6…" — no detector fires either). Only the HYBRID reading (exact
   characters, OCR order) says "06 12 34 56 78". */

// Text layer: exact item strings + boxes, but a SCRAMBLED page text (broken reconstruction).
const textPage: TextLayerPage = {
  text: "Tél : 12 34 06 56 78",
  runs: [
    { str: "Tél :", textStart: 0, itemIndex: 0 },
    { str: "06 12 34 56 78", textStart: 6, itemIndex: 1 },
  ],
  boxes: [
    { x: 50, y: 700, w: 40, h: 10 },
    { x: 100, y: 700, w: 140, h: 10 },
  ],
  width: 595,
  height: 842,
};

// OCR layer (raster at scale 2): right ORDER, one misread character (O for 0).
const ocrPage: OcrLayerPage = {
  text: "Tél: O6 12 34 56 78",
  words: [
    { text: "Tél:", x0: 100, y0: 264, x1: 180, y1: 284 },
    { text: "O6", x0: 200, y0: 264, x1: 240, y1: 284 },
    { text: "12", x0: 260, y0: 264, x1: 300, y1: 284 },
    { text: "34", x0: 320, y0: 264, x1: 360, y1: 284 },
    { text: "56", x0: 380, y0: 264, x1: 420, y1: 284 },
    { text: "78", x0: 440, y0: 264, x1: 480, y1: 284 },
  ],
  width: 1190,
  height: 1684,
};

const file: ExtractedFile = {
  name: "releve.pdf",
  kind: "pdf",
  text: textPage.text,
  chars: textPage.text.length,
  ocrText: ocrPage.text,
  textPages: [textPage],
  ocrPages: [ocrPage],
};

describe("hybridLayerText", () => {
  it("re-serializes the EXACT characters in the OCR reading order on a divergent page", () => {
    const hybrid = hybridLayerText(file);
    expect(hybrid).toContain("06 12 34 56 78"); // exact digits, OCR order
    expect(hybrid).not.toContain("O6"); // the OCR misread is gone
  });

  it("returns null when the two readings AGREE (nothing to gain)", () => {
    const t: TextLayerPage = {
      text: "Nom : Rebour",
      runs: [{ str: "Nom : Rebour", textStart: 0, itemIndex: 0 }],
      boxes: [{ x: 50, y: 700, w: 120, h: 10 }],
      width: 595,
      height: 842,
    };
    const o: OcrLayerPage = {
      text: "Nom : Rebour",
      words: [{ text: "Nom", x0: 100, y0: 264, x1: 160, y1: 284 }],
      width: 1190,
      height: 1684,
    };
    expect(hybridLayerText({ ...file, textPages: [t], ocrPages: [o] })).toBeNull();
  });

  it("returns null without geometry (browser bindings, flat fallback)", () => {
    expect(hybridLayerText({ ...file, textPages: undefined })).toBeNull();
    expect(hybridLayerText({ ...file, ocrPages: undefined })).toBeNull();
  });
});

/* Cross-layer propagation, on a GATED rule (a French passport number fires only next to
   its keyword): the primary text holds the value VERBATIM but its label ended up lines
   away (broken reconstruction) — no detection, the value sat in clear in `wire`. The OCR
   layer reads "Passeport: <value>" → detected → the backstop applies the SAME fake to the
   wire by value. */
const passportText: TextLayerPage = {
  text: "12AB34567 relevé Passeport :",
  runs: [
    { str: "Passeport :", textStart: 17, itemIndex: 0 },
    { str: "12AB34567", textStart: 0, itemIndex: 1 },
  ],
  boxes: [
    { x: 50, y: 700, w: 80, h: 10 },
    { x: 150, y: 700, w: 90, h: 10 },
  ],
  width: 595,
  height: 842,
};
const passportOcr = (numText: string): OcrLayerPage => ({
  text: `Passeport: ${numText}`,
  words: [
    { text: "Passeport:", x0: 100, y0: 264, x1: 260, y1: 284 },
    { text: numText, x0: 300, y0: 264, x1: 480, y1: 284 },
  ],
  width: 1190,
  height: 1684,
});

describe("redactExtracted — cross-layer propagation (backstop + variants)", () => {
  it("BACKSTOP: a value the OCR layer discovered is masked in the wire too", () => {
    const ocr = passportOcr("12AB34567");
    const f: ExtractedFile = {
      ...file,
      text: passportText.text,
      ocrText: ocr.text,
      textPages: [passportText],
      ocrPages: [ocr],
    };
    // Control: without the OCR layer, the gated rule can't fire → the value LEAKS in wire.
    const blind = redactExtracted({ ...f, ocrText: undefined, textPages: undefined, ocrPages: undefined });
    expect(blind.wire).toContain("12AB34567");
    // With it: detected in the OCR reading, and the SAME fake applied to the wire.
    const out = redactExtracted(f);
    expect(out.wire).not.toContain("12AB34567");
    const m = out.matches.find((x) => x.value === "12AB34567")!;
    expect(out.wire).toContain(m.placeholder);
    expect(out.vault[m.placeholder]).toBe("12AB34567");
  });

  it("VARIANT alias: the noisy OCR rendition is matched on the SAME placeholder", () => {
    const ocr = passportOcr("12ABE4567"); // misread — the shape rule can't fire on it
    const f: ExtractedFile = {
      ...file,
      text: passportText.text,
      ocrText: ocr.text,
      textPages: [passportText],
      ocrPages: [ocr],
    };
    const out = redactExtracted(f);
    const exact = out.matches.find((x) => x.value === "12AB34567")!;
    const variant = out.matches.find((x) => x.value === "12ABE4567")!;
    expect(exact).toBeDefined();
    expect(variant).toBeDefined();
    expect(variant.placeholder).toBe(exact.placeholder); // ONE identity, one fake
    expect(variant.type).toBe(exact.type);
    // The vault's canonical entry keeps the EXACT value — never the OCR noise.
    expect(out.vault[exact.placeholder]).toBe("12AB34567");
  });
});

describe("redactExtracted — hybrid third layer", () => {
  const digits = (s: string) => s.replace(/[^0-9]/g, "");

  it("catches a value INVISIBLE to both existing layers (scrambled text ∧ noisy OCR)", () => {
    // Control: without geometry, NEITHER layer detects the phone.
    const blind = redactExtracted({ ...file, textPages: undefined, ocrPages: undefined });
    expect(blind.matches.some((m) => digits(m.value) === "0612345678")).toBe(false);
    // With geometry the hybrid layer reads "06 12 34 56 78" → detected + vaulted.
    const out = redactExtracted(file);
    expect(out.matches.some((m) => digits(m.value) === "0612345678")).toBe(true);
    // The vault got the EXACT value (reversible), under whatever fake was minted.
    expect(Object.values(out.vault).some((v) => digits(String(v)) === "0612345678")).toBe(true);
    // And `wire` is still built from the primary text only.
    expect(out.wire).toContain("12 34");
  });
});
