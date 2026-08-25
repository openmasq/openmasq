import { describe, it, expect } from "vitest";
import { imageSourcedWords, mergeImageZones, pageImageSource } from "./imageZones";
import type { PageWord } from "./pageWords";

const w = (str: string, left: number, top: number, width = 40, h = 10): PageWord => ({
  str,
  left,
  top,
  w: width,
  h,
});

describe("imageSourcedWords — what the text layer does not account for", () => {
  const LAYER_TEXT = "Contrat de prestation\nEntre Jean Rebour et la société Acme";
  const textLayer = [w("Contrat", 60, 100), w("de", 105, 100), w("prestation", 130, 100)];

  it("keeps a run the layer text never spells and that sits over no text word", () => {
    const zones = imageSourcedWords([w("FRANCE", 60, 30), w("TRAVAIL", 105, 30)], textLayer, LAYER_TEXT);
    expect(zones.map((z) => z.str)).toEqual(["FRANCE", "TRAVAIL"]);
  });

  it("drops a word the layer text DOES spell, wherever OCR placed it", () => {
    expect(imageSourcedWords([w("prestation", 900, 900)], textLayer, LAYER_TEXT)).toEqual([]);
  });

  it("drops an OCR MISREADING of body text — it overlaps the text-layer word", () => {
    // The reliability test: "Contrai" is nowhere in the layer text, so the string check
    // alone would outline an ordinary paragraph. The box overlap says it is a re-read.
    const zones = imageSourcedWords([w("Contrai", 62, 101)], textLayer, LAYER_TEXT);
    expect(zones).toEqual([]);
  });

  it("drops single-character speckle", () => {
    expect(imageSourcedWords([w("|", 300, 400, 3, 9)], textLayer, LAYER_TEXT)).toEqual([]);
  });
});

describe("pageImageSource — the halo may only claim what actually leaves", () => {
  const LAYER_TEXT = "Contrat de prestation";
  const textLayer = [w("Contrat", 60, 100), w("de", 105, 100), w("prestation", 130, 100)];

  it("returns the image-sourced words by IDENTITY, so the halo can subtract them", () => {
    // A logo word is read (OCR) and framed as a zone, but its text is not in the wire:
    // haloing it would say « envoyé, redacted » right where the frame says the opposite.
    const logo = w("FRANCE", 60, 30);
    const src = pageImageSource({
      layerText: LAYER_TEXT,
      ocrWords: [logo, w("prestation", 130, 100)],
      textWords: textLayer,
      wantZones: true,
    });
    expect(src.imageWords).toHaveLength(1);
    expect(src.imageWords[0]).toBe(logo);
    expect(src.zones).toHaveLength(1);
  });

  it("keeps the words even past the zone cap — no outlines, but the halo must not lie", () => {
    const many = Array.from({ length: 201 }, (_, i) => w(`mot${i}`, (i % 10) * 50, 300 + Math.floor(i / 10) * 14));
    const src = pageImageSource({ layerText: LAYER_TEXT, ocrWords: many, textWords: textLayer, wantZones: true });
    expect(src.zones).toEqual([]);
    expect(src.imageWords).toHaveLength(201);
  });

  it("an image-only page excludes nothing: OCR IS the primary text there", () => {
    const src = pageImageSource({ layerText: "  ", ocrWords: [w("FRANCE", 60, 30)], textWords: [], wantZones: true });
    expect(src.imageOnly).toBe(true);
    expect(src.imageWords).toEqual([]);
  });
});

describe("mergeImageZones — one rectangle per visual zone", () => {
  it("merges the words of one logo into a single box, and keeps a distant stamp apart", () => {
    const zones = mergeImageZones([
      w("FRANCE", 60, 30),
      w("TRAVAIL", 104, 30),
      w("TAMPON", 400, 500),
    ]);
    expect(zones).toHaveLength(2);
    const logo = zones.find((z) => z.words === 2)!;
    expect(logo).toMatchObject({ left: 60, top: 30, w: 84, h: 10 });
    expect(zones.find((z) => z.words === 1)).toMatchObject({ left: 400, top: 500 });
  });

  it("merges across a line break inside the same block", () => {
    // Second line one line-height below, left-aligned — the vertical pad must bridge it.
    expect(mergeImageZones([w("SERVICE", 60, 30), w("CLIENT", 60, 41)])).toHaveLength(1);
  });

  it("returns nothing when the page is substantially a picture", () => {
    const many = Array.from({ length: 201 }, (_, i) => w(`mot${i}`, (i % 10) * 50, Math.floor(i / 10) * 14));
    expect(mergeImageZones(many)).toEqual([]);
  });
});
