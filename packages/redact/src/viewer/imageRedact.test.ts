import { describe, it, expect } from "vitest";
import { matchValueToBoxes } from "./imageRedact";
import type { PdfReplacement } from "./pdfRedact";
import type { LayoutRun } from "../documents/pdfLayout";

// A scan whose OCR produced two words: "35136" then "Saint-Jacques-de-la-Lande".
const text = "35136 Saint-Jacques-de-la-Lande Reste";
const runs: LayoutRun[] = [
  { str: "35136", textStart: 0, itemIndex: 0 },
  { str: "Saint-Jacques-de-la-Lande", textStart: 6, itemIndex: 1 },
  { str: "Reste", textStart: 32, itemIndex: 2 },
];
const boxes = [
  { x0: 10, y0: 20, x1: 60, y1: 35 },
  { x0: 65, y0: 20, x1: 200, y1: 35 },
  { x0: 205, y0: 20, x1: 250, y1: 35 },
];

describe("matchValueToBoxes (OCR box mapping for scan redaction)", () => {
  it("unions the boxes of a MULTI-word value into one rectangle", () => {
    const reps: PdfReplacement[] = [
      { real: "35136 Saint-Jacques-de-la-Lande", fake: "75001 Paris", tone: "blue" },
    ];
    const out = matchValueToBoxes(reps, text, runs, boxes);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ left: 10, top: 20, w: 190, h: 15, tone: "blue", revealed: false });
    expect(out[0].fake).toBe("75001 Paris");
  });

  it("maps a single-word value to just its word box", () => {
    const out = matchValueToBoxes([{ real: "35136", fake: "12345", tone: "amber" }], text, runs, boxes);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ left: 10, top: 20, w: 50, h: 15 });
  });

  it("a revealed value is emitted revealed:true (painter skips it)", () => {
    const reps: PdfReplacement[] = [{ real: "Reste", fake: "Xxxxx", tone: "coral" }];
    const out = matchValueToBoxes(reps, text, runs, boxes, new Set(["Reste"]));
    expect(out).toHaveLength(1);
    expect(out[0].revealed).toBe(true);
  });

  it("an absent value produces no box", () => {
    expect(matchValueToBoxes([{ real: "Zzz", fake: "Yyy", tone: "amber" }], text, runs, boxes)).toEqual([]);
  });
});
