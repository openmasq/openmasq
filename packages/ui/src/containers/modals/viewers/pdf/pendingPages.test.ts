import { describe, expect, it } from "vitest";
import { PAGE_BREAK } from "@openmasq/redact/documents.browser";
import type { PdfReplacement } from "@openmasq/redact/pdf-redact";
import { pageProven, pendingPdf } from "./pendingPages";

const JEAN: PdfReplacement = { real: "Jean Dupont", fake: "Luc Martin", tone: "violet", kind: "name" };
const PAGES = ["Emprunteur : Jean Dupont", "Deuxième page", "Troisième page"];
const prefix = (n: number) => PAGES.slice(0, n).join(PAGE_BREAK);

describe("pendingPdf — which page may be shown", () => {
  it("a page is masked only once read AND covered to its end", () => {
    const covered = prefix(1).length; // exactly the end of page 1
    const v = pendingPdf({
      extracting: true,
      reading: { total: 3, thumbs: [], read: [true, true], mask: { covered, scanned: covered + 5, replacements: [JEAN], pageTexts: PAGES.slice(0, 2) } },
    });
    expect(v.pages.map((p) => p.state)).toEqual(["masked", "read", "current"]);
    expect(v.replacements).toEqual([JEAN]);
  });

  it("covered but not READ yet (a digital page OCR still checks): not shown", () => {
    const v = pendingPdf({
      extracting: true,
      reading: { total: 2, thumbs: [], read: [false, true], mask: { covered: 10_000, scanned: 10_000, replacements: [], pageTexts: PAGES.slice(0, 2) } },
    });
    expect(v.pages.map((p) => p.state)).toEqual(["current", "masked"]);
  });

  it("waiting its turn in the extraction queue: no page is being read", () => {
    const v = pendingPdf({ extracting: true, extractQueued: 2, reading: { total: 2, thumbs: [], read: [] } });
    expect(v.pages.map((p) => p.state)).toEqual(["waiting", "waiting"]);
  });

  it("read, masking the tail: offsets on the final text, the run's progress wins", () => {
    const text = PAGES.join(PAGE_BREAK);
    const v = pendingPdf({
      text,
      maskedSoFar: { covered: prefix(2).length, scanned: text.length, replacements: [JEAN] },
      reading: { total: 3, thumbs: [], read: [true, true, true], mask: { covered: 1, scanned: 1, replacements: [], pageTexts: PAGES } },
    });
    expect(v.pages.map((p) => p.state)).toEqual(["masked", "masked", "read"]);
  });

  it("nothing masked yet: no page is shown", () => {
    const v = pendingPdf({ text: PAGES.join(PAGE_BREAK) });
    expect(v.pages.every((p) => p.state === "read")).toBe(true);
  });
});

describe("pageProven — the paint covers the page's values", () => {
  it("every value of the page's text must be in the paint's covered set", () => {
    expect(pageProven(new Set(["Jean Dupont"]), PAGES[0], [JEAN])).toBe(true);
    expect(pageProven(new Set(), PAGES[0], [JEAN])).toBe(false); // a scan with no boxes yet
    expect(pageProven(new Set(), PAGES[1], [JEAN])).toBe(true); // no value on this page
    expect(pageProven(new Set(["Jean Dupont"]), undefined, [JEAN])).toBe(false); // text unknown
  });
});
