import { describe, it, expect } from "vitest";
import { realFromRedactedSelection } from "./docForce";
import type { PdfReplacement } from "../pdf/pdfReplacements";

const repl = (real: string, fake: string): PdfReplacement =>
  ({ real, fake, tone: "coral", kind: "name" }) as PdfReplacement;

describe("realFromRedactedSelection", () => {
  it("maps a selected FAKE back to its REAL value (never force-redacts the placeholder)", () => {
    const r = [repl("Jean Rebour", "Marc Norvik")];
    expect(realFromRedactedSelection("Marc Norvik", r)).toBe("Jean Rebour");
  });

  it("passes a detector MISS (real value shown in clear) through unchanged", () => {
    const r = [repl("Jean Rebour", "Marc Norvik")];
    expect(realFromRedactedSelection("06 12 34 56 78", r)).toBe("06 12 34 56 78");
  });

  it("reverses multiple fakes inside one selection", () => {
    const r = [repl("Jean Rebour", "Marc Norvik"), repl("Acme SARL", "Globex Inc")];
    expect(realFromRedactedSelection("Marc Norvik — Globex Inc", r)).toBe("Jean Rebour — Acme SARL");
  });

  it("prefers the LONGER fake so a shorter fake can't corrupt it", () => {
    const r = [repl("A", "IE"), repl("Big", "INGENIE")];
    // "INGENIE" must map to "Big", not be split by the shorter "IE"→"A".
    expect(realFromRedactedSelection("INGENIE", r)).toBe("Big");
  });

  it("returns the selection unchanged when there are no replacements", () => {
    expect(realFromRedactedSelection("anything", undefined)).toBe("anything");
    expect(realFromRedactedSelection("anything", [])).toBe("anything");
  });
});
