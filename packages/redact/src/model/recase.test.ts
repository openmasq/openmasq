import { describe, it, expect, vi } from "vitest";
import { detectWithModel } from "./detect";
import type { CompleteFn } from "../types";

/**
 * Reproduces the reported remote-engine symptom: a small cased model MISSES an
 * ALL-CAPS entity but detects it once the text is title-cased. `detectWithModel`
 * must run the second (recased) pass and map the hit back onto the ORIGINAL
 * uppercase text, so it gets redacted.
 */
function casedMissModel(): CompleteFn {
  // "Sees" PARIS only when it's normal-cased ("Paris"); returns [] for the
  // all-caps form — exactly how mistral-small under-detects uppercase.
  return async (messages) => {
    const user = String(messages[messages.length - 1]?.content ?? "");
    if (user.includes("Paris") && !user.includes("PARIS")) {
      return JSON.stringify([{ value: "Paris", category: "CITY" }]);
    }
    return "[]";
  };
}

describe("detectWithModel — uppercase recasing pass", () => {
  it("catches a LONE uppercase city the model only detects when title-cased", async () => {
    const complete = vi.fn(casedMissModel());
    const dets = await detectWithModel("Le client habite à PARIS.", complete);
    // Detected on the recased pass, located back in the original as "PARIS".
    expect(dets).toContainEqual({ value: "PARIS", category: "CITY" });
    expect(complete).toHaveBeenCalledTimes(2); // original + title-cased variant
  });

  it("does a SINGLE pass for well-cased text (no extra remote call)", async () => {
    const complete = vi.fn(casedMissModel());
    const dets = await detectWithModel("Le client habite à Paris.", complete);
    expect(dets).toContainEqual({ value: "Paris", category: "CITY" });
    expect(complete).toHaveBeenCalledTimes(1); // no all-caps word → no second pass
  });

  it("returns [] and does NOT retry when the model is unreachable", async () => {
    const complete = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const dets = await detectWithModel("Le client habite à PARIS.", complete as unknown as CompleteFn);
    expect(dets).toEqual([]);
    expect(complete).toHaveBeenCalledTimes(1); // primary failed → fall back, no 2nd pass
  });

  it("drops ARIA/accessibility role words a detector mis-flags as names", async () => {
    // A browser-agent accessibility snapshot repeats "generic"/"group"/… which the
    // NER mistakes for person names — they must be dropped, not faked to "Manon G".
    const flagsRoles: CompleteFn = async () =>
      JSON.stringify([
        { value: "generic", category: "NAME" },
        { value: "group", category: "NAME" },
        { value: "Rebour", category: "NAME" }, // a REAL name → kept
      ]);
    const dets = await detectWithModel("- generic [ref=f1]: Rebour", vi.fn(flagsRoles));
    expect(dets).toEqual([{ value: "Rebour", category: "NAME" }]);
  });
});
