import { describe, expect, it } from "vitest";
import { fakeUsername } from "./username";

describe("fakeUsername — trailing digits", () => {
  it("keeps the digit count of the original's tail, and never returns the original", () => {
    const fake = fakeUsername("jdoe1234", 0);
    expect(fake).toMatch(/\d{4}$/);
    expect(fake.toLowerCase()).not.toBe("jdoe1234");
  });

  it("stays linear on a long digit run (no polynomial backtracking)", () => {
    const t = performance.now();
    fakeUsername(`${"1".repeat(50_000)}x`, 0);
    fakeUsername(`a${"9".repeat(50_000)}`, 0);
    expect(performance.now() - t).toBeLessThan(1000);
  });
});
