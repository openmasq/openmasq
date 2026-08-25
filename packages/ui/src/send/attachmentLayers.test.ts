import { describe, it, expect } from "vitest";
import { attachmentDetectBlock, attachmentExtraLayers } from "./attachmentLayers";
import type { ExtractedFile } from "../host/files";

const base: Pick<ExtractedFile, "name" | "text"> = { name: "438-GAZ-20220208.pdf", text: "" };

/* The SACEM-relevé shape: a text layer whose reconstruction scrambled the reading order
   (label far from its value) + an OCR layer that misread a character. The hybrid layer
   (exact characters, OCR order) is the only reading a detector can type. */
const textPage = {
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
const ocrPage = {
  text: "Passeport: 12ABE4567",
  words: [
    { text: "Passeport:", x0: 100, y0: 264, x1: 260, y1: 284 },
    { text: "12ABE4567", x0: 300, y0: 264, x1: 480, y1: 284 },
  ],
  width: 1190,
  height: 1684,
};

describe("attachmentExtraLayers", () => {
  it("text-only attachment → no extra layer (the common send pays nothing)", () => {
    expect(attachmentExtraLayers({ ...base, text: "un mémo" })).toEqual([]);
  });

  it("an OCR layer identical to the primary adds nothing", () => {
    expect(attachmentExtraLayers({ ...base, text: "même texte", ocrText: "même texte" })).toEqual([]);
  });

  it("a differing OCR layer + a divergent geometry yield BOTH extra readings", () => {
    const layers = attachmentExtraLayers({
      ...base,
      text: textPage.text,
      ocrText: ocrPage.text,
      textPages: [textPage],
      ocrPages: [ocrPage],
    });
    expect(layers).toHaveLength(2);
    expect(layers[0]).toBe(ocrPage.text); // what the pixels say
    expect(layers[1]).toContain("Passeport : 12AB34567"); // hybrid: exact chars, OCR order
  });

  it("without geometry, only the plain OCR layer remains (graceful degrade)", () => {
    const layers = attachmentExtraLayers({ ...base, text: "a", ocrText: "b" });
    expect(layers).toEqual(["b"]);
  });
});

describe("attachmentDetectBlock", () => {
  it("never leaks the real filename into the block (same rule as the fold's safeName)", () => {
    const block = attachmentDetectBlock([
      { ...base, text: "texte principal", ocrText: "couche pixels" },
    ]);
    expect(block).toContain("couche pixels");
    expect(block).not.toContain("438-GAZ");
  });

  it("returns \"\" when no attachment carries an extra layer", () => {
    expect(attachmentDetectBlock([{ ...base, text: "juste du texte" }])).toBe("");
    expect(attachmentDetectBlock(undefined)).toBe("");
  });
});
