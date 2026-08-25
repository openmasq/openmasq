import { describe, it, expect } from "vitest";
import { CHAR_BUDGET, THRESHOLD, initialWindowSize, overBudget, rendersWhole } from "./sizing";

/** A thread of `n` messages of `chars` each. */
const thread = (n: number, chars: number) => Array.from({ length: n }, () => "x".repeat(chars));
const sizeOf = (s: string) => s.length;
const whole = (items: string[]) => rendersWhole(items, sizeOf, THRESHOLD, CHAR_BUDGET);

describe("rendersWhole — the gate is size AND count, never count alone", () => {
  it("renders a short, light thread whole (the common case, unchanged)", () => {
    expect(whole(thread(25, 200))).toBe(true);
  });

  it("WINDOWS a thread that is short on count but huge in chars", () => {
    // The reported bug: 25 pasted documents. Under the 40-message cap, so the old
    // count-only gate mounted all 25 — every one parsing markdown and re-scanning
    // its text against the vault, synchronously, in the click's commit.
    expect(whole(thread(25, 40_000))).toBe(false);
  });

  it("still windows a long thread of trivial messages", () => {
    expect(whole(thread(300, 10))).toBe(false);
  });

  it("without sizeOf, falls back to count-only gating (unchanged callers)", () => {
    expect(rendersWhole(thread(25, 40_000), undefined, THRESHOLD, CHAR_BUDGET)).toBe(true);
    expect(rendersWhole(thread(300, 10), undefined, THRESHOLD, CHAR_BUDGET)).toBe(false);
  });

  it("overBudget short-circuits — it must not walk a whole huge thread", () => {
    let seen = 0;
    const counted = (s: string) => {
      seen++;
      return s.length;
    };
    expect(overBudget(thread(5_000, 40_000), counted, CHAR_BUDGET)).toBe(true);
    expect(seen).toBeLessThan(5); // blown within a couple of items, not 5000
  });
});

describe("initialWindowSize — the first commit must respect the budget too", () => {
  it("caps the first mount by chars, not by the count threshold", () => {
    // Without this, a heavy-but-short thread takes the Windowed branch and STILL
    // mounts every row on the first render (count < threshold), so the expensive
    // commit we're avoiding happens anyway and only narrows on recompute.
    const n = initialWindowSize(thread(25, 40_000), sizeOf, THRESHOLD, CHAR_BUDGET, "bottom");
    expect(n).toBeLessThan(25);
    expect(n).toBeGreaterThanOrEqual(2);
  });

  it("never mounts fewer than 2 rows, so a measure pass can start", () => {
    expect(initialWindowSize(thread(9, 10_000_000), sizeOf, THRESHOLD, CHAR_BUDGET, "bottom")).toBe(2);
  });

  it("measures from the anchored END (a bottom-anchored thread mounts its last rows)", () => {
    // Light tail, heavy head. Anchored at the BOTTOM the 20 light rows all fit, and
    // the heavy head is the row that crosses the budget — counted, then stop (the
    // crossing row is included: the window must cover the viewport, and stopping
    // short of it would leave a gap). Anchored at the TOP that same head is row 1,
    // so the budget is blown immediately and only the 2-row floor mounts.
    const items = ["x".repeat(100_000), ...thread(20, 10)];
    expect(initialWindowSize(items, sizeOf, THRESHOLD, CHAR_BUDGET, "bottom")).toBe(21);
    expect(initialWindowSize(items, sizeOf, THRESHOLD, CHAR_BUDGET, "top")).toBe(2);
  });

  it("without sizeOf, keeps the plain count window (unchanged callers)", () => {
    expect(initialWindowSize(thread(99, 10), undefined, THRESHOLD, CHAR_BUDGET, "top")).toBe(THRESHOLD);
  });
});
