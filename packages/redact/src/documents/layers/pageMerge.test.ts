import { describe, expect, it } from "vitest";
import { PAGE_BREAK } from "../pageBreak";
import { layerMayYield, mergeThinPages, pagePrimary, yieldingPages } from "./pageMerge";

// A digital PDF's page whose layer is thin holds its content in the pixels: it takes its OCR
// reading, or it reaches the model empty. A dense, clean layer is never downgraded.
const DENSE = "Contrat de bail entre les parties soussignées, conclu pour une durée de trois ans. ".repeat(3);
const SCAN = "Attestation — Ninon Verdolini, IBAN FR76 3000 4000 0512 3456 789, signée à Lyon.";

describe("pagePrimary — which reading a page sends", () => {
  it("a thin page takes its OCR reading when OCR read more", () => {
    expect(pagePrimary("", SCAN)).toBe(SCAN);
    expect(pagePrimary("p. 3", SCAN)).toBe(SCAN);
  });

  it("a dense layer is never replaced, whatever OCR read", () => {
    expect(layerMayYield(DENSE)).toBe(false);
    expect(pagePrimary(DENSE, `${DENSE} ${SCAN}`)).toBe(DENSE);
  });

  it("a page OCR did not read, or read less, keeps its layer", () => {
    expect(pagePrimary("p. 3", undefined)).toBe("p. 3");
    expect(pagePrimary("En-tête de la société", "En-tête")).toBe("En-tête de la société");
  });
});

describe("mergeThinPages — the document, page by page", () => {
  it("replaces exactly the thin pages, in place, and says which", () => {
    const layer = [DENSE, "", DENSE, "p. 4"].join(PAGE_BREAK);
    const m = mergeThinPages(layer, ["", SCAN, "", "Tampon : Jean Rebour, notaire"]);
    expect(m.promoted).toEqual([2, 4]);
    expect(m.text.split(PAGE_BREAK)).toEqual([DENSE, SCAN, DENSE, "Tampon : Jean Rebour, notaire"].map((p, i) => (i ? p : p.trimStart())));
  });

  it("readings that cannot be matched to the pages change nothing", () => {
    const layer = [DENSE, ""].join(PAGE_BREAK);
    expect(mergeThinPages(layer, undefined).promoted).toEqual([]);
    expect(mergeThinPages(layer, [SCAN, SCAN, SCAN]).promoted).toEqual([]);
  });

  it("counts, before OCR, the pages that may take their reading — among those OCR reads", () => {
    const layer = [DENSE, "", "p. 3", DENSE].join(PAGE_BREAK);
    expect(yieldingPages(layer, undefined)).toBe(2);
    expect(yieldingPages(layer, [2])).toBe(1);
  });
});
