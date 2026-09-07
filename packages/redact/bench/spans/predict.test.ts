import { describe, expect, it } from "vitest";
import { pseudonymize } from "../../src/index";
import { merge, vaultSpans } from "./predict";

/**
 * `vaultSpans` is the ONE place the span benches turn "what the engine replaced" into
 * character offsets. Nothing else in the repo needs offsets, so nothing else would catch it
 * drifting from `applyVault`/`applyVaultVariants` — and a drift here does not fail: it
 * silently moves every precision and recall figure this bench publishes.
 *
 * Two directions, and they are the whole contract:
 *   nothing invented — every span slices to a vault value or a spelling variant of one;
 *   nothing missed   — every vault value standing alone in the text lies under a span.
 */

const strip = (s: string) => s.toLowerCase().replace(/[\s._-]/g, "");

describe("vaultSpans", () => {
  it("invents no span and misses no value, on a vault built by hand", () => {
    const text = "Jean Morvan (JEAN MORVAN) — jean.morvan@example.org, +33 6 12 34 56 78.";
    const vault = { f1: "Jean Morvan", f2: "jean.morvan@example.org", f3: "+33 6 12 34 56 78" };
    const spans = vaultSpans(text, vault);
    for (const [a, b] of spans) {
      const found = strip(text.slice(a, b));
      expect(Object.values(vault).some((v) => strip(v) === found)).toBe(true);
    }
    for (const value of Object.values(vault)) {
      const at = text.indexOf(value);
      expect(spans.some(([a, b]) => a <= at && at < b)).toBe(true);
    }
    // the UPPERCASE spelling is a variant of the same person and is covered too
    const upper = text.indexOf("JEAN MORVAN");
    expect(spans.some(([a, b]) => a <= upper && upper < b)).toBe(true);
  });

  it("never marks a value glued inside a longer word", () => {
    // « us » is the vault value; « plus » must not be touched — the `isWordGlued` rule.
    expect(vaultSpans("plus tard, us only", { f1: "us" })).toEqual([[11, 13]]);
  });

  it("agrees with what the deterministic pipeline actually replaced", async () => {
    const text = "Contact Camille Estival at camille.estival@vertima.fr or IBAN FR76 3000 6000 0112 3456 7890 189.";
    const vault: Record<string, string> = {};
    const result = await pseudonymize(text, { vault });
    const spans = vaultSpans(text, vault);
    expect(spans.length).toBeGreaterThan(0);
    // Rebuilding the input from the spans and the vault must give back the engine's own
    // output — the strongest statement available without offsets from the engine itself.
    let rebuilt = "", at = 0;
    for (const [a, b] of spans) {
      const real = text.slice(a, b);
      const token = Object.keys(vault).find((k) => strip(vault[k]) === strip(real));
      expect(token).toBeDefined();
      rebuilt += text.slice(at, a) + token;
      at = b;
    }
    rebuilt += text.slice(at);
    expect(rebuilt).toBe(result.text);
  });
});

describe("merge", () => {
  it("returns sorted, overlap-free spans", () => {
    expect(merge([[5, 9], [0, 3], [7, 12], [3, 4]])).toEqual([[0, 4], [5, 12]]);
  });
});
