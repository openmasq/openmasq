import { describe, it, expect } from "vitest";
import {
  DOC_BASE_FS,
  DOC_MAX_COLS,
  DOC_MIN_FS,
  DOC_PAGE_MAX_W,
  DOC_PAGE_MIN_W,
  bodyCols,
  maxLineLength,
  pageMetrics,
  splitPages,
} from "./docFit";

describe("maxLineLength", () => {
  it("returns the longest line's character count", () => {
    expect(maxLineLength("ab\nabcd\nabc")).toBe(4);
    expect(maxLineLength("")).toBe(0);
  });
});

describe("splitPages", () => {
  it("splits on the form-feed page-break marker, dropping blank pages", () => {
    expect(splitPages("page one\ftwo\f\fthree")).toEqual(["page one", "two", "three"]);
  });
  it("returns the whole text as one page when there is no marker", () => {
    expect(splitPages("just one page")).toEqual(["just one page"]);
  });
  it("trims the page-break's surrounding newlines", () => {
    expect(splitPages("a\n\f\nb")).toEqual(["a", "b"]);
  });
});

describe("bodyCols", () => {
  it("uses the true widest line for a uniform body (grid never wraps)", () => {
    const doc = ["12345678", "1234567890", "123456"].join("\n"); // widths 8,10,6
    expect(bodyCols(doc)).toBe(10);
  });
  it("ignores a lone wide OUTLIER line so the sheet tracks the body", () => {
    // 20 body lines of 40 chars + ONE 130-char header → body width, not 130.
    const body = Array.from({ length: 20 }, () => "x".repeat(40));
    const doc = ["H".repeat(130), ...body].join("\n");
    expect(bodyCols(doc)).toBe(40);
  });
  it("caps at DOC_MAX_COLS", () => {
    expect(bodyCols("y".repeat(400))).toBe(DOC_MAX_COLS);
  });
});

describe("pageMetrics", () => {
  it("keeps the base font and sizes the sheet to the body when it fits", () => {
    const { pageWidth, fontSize } = pageMetrics(70, 1140);
    expect(fontSize).toBe(DOC_BASE_FS); // comfortably fits → base size
    // Sheet width ≈ body width + margins, within the page-like bounds.
    expect(pageWidth).toBeGreaterThanOrEqual(DOC_PAGE_MIN_W);
    expect(pageWidth).toBeLessThanOrEqual(DOC_PAGE_MAX_W);
  });

  it("shrinks the font when the body is wider than the sheet cap", () => {
    const { pageWidth, fontSize } = pageMetrics(150, 1140);
    expect(pageWidth).toBe(DOC_PAGE_MAX_W); // capped
    expect(fontSize).toBeLessThan(DOC_BASE_FS);
    expect(fontSize).toBeGreaterThanOrEqual(DOC_MIN_FS);
  });

  it("floors the font on an extreme grid (sheet then scrolls)", () => {
    const { fontSize } = pageMetrics(DOC_MAX_COLS, 360);
    expect(fontSize).toBe(DOC_MIN_FS);
  });

  it("shrinks the font, never wrapping, as the viewport narrows", () => {
    // A 90-col grid: wide viewport keeps it readable, narrower shrinks the font —
    // it must never reach the wrapping regime while it still fits above the floor.
    const wide = pageMetrics(90, 900);
    const narrow = pageMetrics(90, 640);
    expect(narrow.fontSize).toBeLessThan(wide.fontSize);
    expect(narrow.fontSize).toBeGreaterThanOrEqual(DOC_MIN_FS);
    expect(narrow.overflow).toBe(false); // still fits at a readable size → no scroll, no wrap
  });

  it("scrolls (not wraps) a fitted grid too narrow even at the floor font", () => {
    const { fontSize, overflow } = pageMetrics(90, 320);
    expect(fontSize).toBe(DOC_MIN_FS);
    expect(overflow).toBe(true); // hold the floor + scroll horizontally instead of reflowing
  });

  it("does NOT scroll a cap-clamped line (long prose wraps normally)", () => {
    expect(pageMetrics(DOC_MAX_COLS, 320).overflow).toBe(false);
  });

  it("never returns a sub-min-width sliver, even with no measured width", () => {
    const { pageWidth } = pageMetrics(10, 0);
    expect(pageWidth).toBe(DOC_PAGE_MIN_W);
  });
});
