import { describe, expect, it } from "vitest";
import { withDisplayTokens } from "./displayReplacements";

describe("withDisplayTokens — the viewers' jetons substitution", () => {
  const reps = [
    { real: "Louis Terral", fake: "Nadia Vannec", tone: "coral", kind: "name" },
    { real: "Anna Vayre", fake: "Paul Cayre", tone: "coral", kind: "name" },
    { real: "FR7630006000011234567890189", fake: "FR7699999000011234567890111", tone: "blue", kind: "iban" },
  ];

  it("swaps each fake for its token; real/tone/kind untouched (reveal + force paths intact)", () => {
    const out = withDisplayTokens(reps);
    expect(out.map((r) => r.fake)).toEqual(["[PERSON1]", "[PERSON2]", "[IBAN]"]);
    expect(out.map((r) => r.real)).toEqual(reps.map((r) => r.real));
    expect(out.map((r) => r.tone)).toEqual(reps.map((r) => r.tone));
    expect(reps[0].fake).toBe("Nadia Vannec"); // input list never mutated
  });

  it("is idempotent — a list substituted twice renders the same tokens", () => {
    expect(withDisplayTokens(withDisplayTokens(reps))).toEqual(withDisplayTokens(reps));
  });
});
