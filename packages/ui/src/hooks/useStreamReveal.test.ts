import { describe, it, expect } from "vitest";
import { revealBoundary, advanceProgress } from "./useStreamReveal";

describe("revealBoundary", () => {
  const s = "Le judo est un art"; //  indices: word breaks at 2,7,11,14

  it("clamps the ends", () => {
    expect(revealBoundary(s, 0)).toBe(0);
    expect(revealBoundary(s, -5)).toBe(0);
    expect(revealBoundary(s, s.length)).toBe(s.length);
    expect(revealBoundary(s, s.length + 10)).toBe(s.length);
  });

  it("never cuts a word in half — backs up to the previous whitespace", () => {
    // index 4 is inside "judo" (Le·judo) → back up to just after "Le "
    expect(revealBoundary(s, 4)).toBe(3);
    expect(s.slice(0, revealBoundary(s, 4))).toBe("Le ");
  });

  it("keeps a boundary that already lands on / before whitespace", () => {
    // index 2 is the space after "Le" → kept as-is (char at n is space)
    expect(revealBoundary(s, 2)).toBe(2);
    // index 3 is the start of "judo" (char before is space) → kept
    expect(revealBoundary(s, 3)).toBe(3);
  });

  it("treats newlines/tabs as boundaries", () => {
    const t = "one\ntwo";
    expect(revealBoundary(t, 4)).toBe(4); // right after the newline
    expect(revealBoundary(t, 5)).toBe(4); // inside "two" → back to after "\n"
  });

  it("is non-decreasing in n and never over-reveals", () => {
    let prev = 0;
    for (let n = 0; n <= s.length; n++) {
      const b = revealBoundary(s, n);
      expect(b).toBeGreaterThanOrEqual(prev); // boundary never moves backward
      expect(b).toBeLessThanOrEqual(n); // never reveals past what was earned
      prev = b;
    }
  });
});

describe("advanceProgress", () => {
  it("never overshoots the target and stops at it", () => {
    expect(advanceProgress(999, 1000, 1)).toBeLessThanOrEqual(1000);
    expect(advanceProgress(1000, 1000, 1)).toBe(1000);
    expect(advanceProgress(1200, 1000, 1)).toBe(1000); // clamps a stale over-value
  });

  it("always moves forward while behind (a trickle still advances)", () => {
    // 1 char of backlog, tiny dt → still strictly increases (MIN_CPS floor)
    const next = advanceProgress(10, 11, 1 / 60);
    expect(next).toBeGreaterThan(10);
    expect(next).toBeLessThanOrEqual(11);
  });

  it("drains a big burst quickly but is bounded (MAX_CPS ceiling)", () => {
    // 5000-char backlog in one 16ms frame can't reveal the whole thing at once.
    const next = advanceProgress(0, 5000, 1 / 60);
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThan(5000);
  });

  it("converges to the target over repeated frames", () => {
    let p = 0;
    for (let i = 0; i < 600 && p < 200; i++) p = advanceProgress(p, 200, 1 / 60);
    expect(p).toBe(200);
  });
});
