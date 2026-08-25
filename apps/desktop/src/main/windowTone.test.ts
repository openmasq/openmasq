import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// A per-test userData dir, so the module's real read/write path is exercised rather
// than mocked away — the persistence IS half of what this module does.
const dir = mkdtempSync(join(tmpdir(), "openmasq-tone-"));
vi.mock("electron", () => ({ app: { getPath: () => dir } }));

const { applyWindowTone, isWindowTone, loadWindowTone } = await import("./windowTone");

/** A stand-in for the BrowserWindow: only `setBackgroundColor` is ever called. */
const fakeWin = () => {
  const calls: string[] = [];
  return { calls, win: { setBackgroundColor: (c: string) => calls.push(c) } };
};

beforeEach(() => {
  const { win } = fakeWin();
  // Reset the file to a known state between tests.
  applyWindowTone(win as never, "#ffffff");
});

describe("isWindowTone — the renderer is untrusted (rule 7)", () => {
  it("accepts #rrggbb, either case", () => {
    expect(isWindowTone("#f1f1f6")).toBe(true);
    expect(isWindowTone("#F1F1F6")).toBe(true);
  });

  it("refuses everything else — it never REPAIRS an input", () => {
    // `setBackgroundColor` takes a CSS colour string, so anything that isn't the narrow
    // shape we actually use is refused rather than coerced. `rgb()`/named colours are
    // valid CSS but are not what any theme produces, and accepting them widens the
    // surface for no gain.
    for (const bad of [
      "#f1f1f", // 5 digits
      "#f1f1f66", // 7
      "f1f1f6", // no hash
      "#ggghhh",
      "rgb(241,241,246)",
      "white",
      "",
      " #f1f1f6 ",
      null,
      undefined,
      42,
      {},
      ["#f1f1f6"],
    ])
      expect(isWindowTone(bad), `${JSON.stringify(bad)} must be refused`).toBe(false);
  });
});

describe("applyWindowTone", () => {
  it("paints the window and reports acceptance", () => {
    const { calls, win } = fakeWin();
    expect(applyWindowTone(win as never, "#0a0b0e")).toBe(true);
    expect(calls).toEqual(["#0a0b0e"]);
  });

  it("paints NOTHING for a refused value — the window keeps the tone it had", () => {
    const { calls, win } = fakeWin();
    expect(applyWindowTone(win as never, "javascript:alert(1)")).toBe(false);
    expect(calls).toEqual([]);
  });

  it("survives a null window (called before/after the window exists)", () => {
    expect(applyWindowTone(null, "#f1f1f6")).toBe(true);
  });
});

describe("loadWindowTone", () => {
  it("returns the last ACCEPTED tone, so a cold start opens in the right colour", () => {
    const { win } = fakeWin();
    applyWindowTone(win as never, "#0b0e07");
    expect(loadWindowTone()).toBe("#0b0e07");
  });

  it("ignores a refused tone — it must not be persisted either", () => {
    const { win } = fakeWin();
    applyWindowTone(win as never, "#0b0e07");
    applyWindowTone(win as never, "not-a-colour");
    expect(loadWindowTone()).toBe("#0b0e07");
  });

  it("falls back to the default theme's tone when nothing is stored", async () => {
    // A first run, and equally a corrupt file: neither is an error, both are "no tone
    // recorded yet". The default theme is `blue`, so its shell tone is the right floor.
    vi.resetModules();
    vi.doMock("electron", () => ({
      app: { getPath: () => mkdtempSync(join(tmpdir(), "openmasq-tone-empty-")) },
    }));
    const fresh = await import("./windowTone");
    expect(fresh.loadWindowTone()).toBe("#f1f1f6");
  });
});
