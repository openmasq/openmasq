import { describe, it, expect } from "vitest";
import { countMatches, splitMatches, SEARCH_MIN_LEN } from "./docSearch";

describe("docSearch", () => {
  it("counts case-insensitive substring matches", () => {
    expect(countMatches("Le contrat ELEC et elec-machin", "elec")).toBe(2);
    // Accent-sensitive (a plain substring find): "elec" ≠ "élec" in "électricité".
    expect(countMatches("l'électricité", "elec")).toBe(0);
    expect(countMatches("aaaa", "aa")).toBe(2); // non-overlapping
    expect(countMatches("rien ici", "xyz")).toBe(0);
  });

  it("ignores queries below the min length (perf guard)", () => {
    expect(SEARCH_MIN_LEN).toBe(2);
    expect(countMatches("eeeee", "e")).toBe(0);
    expect(splitMatches("eeeee", "e").segs).toEqual([{ text: "eeeee" }]);
  });

  it("empty/whitespace query → one plain segment, no hits", () => {
    expect(splitMatches("abc", "").segs).toEqual([{ text: "abc" }]);
    expect(splitMatches("abc", "   ").segs).toEqual([{ text: "abc" }]);
  });

  it("splits into plain + hit segments, preserving original casing", () => {
    const { segs, next } = splitMatches("Contrat ELEC 20220208", "elec");
    expect(segs).toEqual([
      { text: "Contrat " },
      { text: "ELEC", hit: 0 }, // original casing kept, not the lowercased needle
      { text: " 20220208" },
    ]);
    expect(next).toBe(1);
  });

  it("numbers matches globally from `start` so chunks can be threaded", () => {
    const a = splitMatches("elec-elec", "elec", 0);
    expect(a.segs.filter((s) => s.hit !== undefined).map((s) => s.hit)).toEqual([0, 1]);
    expect(a.next).toBe(2);
    // a following chunk continues the numbering
    const b = splitMatches("x elec", "elec", a.next);
    expect(b.segs.find((s) => s.hit !== undefined)?.hit).toBe(2);
    expect(b.next).toBe(3);
  });

  it("handles a match at the very start and end", () => {
    expect(splitMatches("elec middle elec", "elec").segs).toEqual([
      { text: "elec", hit: 0 },
      { text: " middle " },
      { text: "elec", hit: 1 },
    ]);
  });
});
