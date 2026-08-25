import { describe, expect, it } from "vitest";
import { fakeFor } from "./fakes";

/** Parse a dd/mm/yyyy-ish or yyyy-mm-dd-ish string into {y,m,d} by group widths. */
function parts(s: string): number[] {
  return (s.match(/\d+/g) ?? []).map(Number);
}

describe("fakeFor date realism", () => {
  const FORMATS = [
    "12/05/1990",
    "1990-05-12",
    "05.12.1990",
    "31/01/2001", // day > 12 → must be recognised as the day
    "1/3/1985",
  ];

  for (const value of FORMATS) {
    it(`${value} → a valid, same-format, different date`, () => {
      const fake = fakeFor("DOB", value, 0);
      expect(fake).toHaveLength(value.length); // same separators + widths
      expect(fake).not.toBe(value);
      // same non-digit skeleton (separators/order preserved)
      expect(fake.replace(/\d/g, "#")).toBe(value.replace(/\d/g, "#"));

      const nums = parts(fake);
      const year = nums.find((n) => n >= 1000)!;
      const small = nums.filter((n) => n < 1000);
      expect(year).toBeGreaterThanOrEqual(1940);
      expect(year).toBeLessThanOrEqual(2004); // DOB range
      // every small field is a valid day or month (never 0, never > 31)
      for (const n of small) {
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(31);
      }
      // at least one small field is a valid month (≤ 12)
      expect(small.some((n) => n <= 12)).toBe(true);
    });
  }

  it("keeps a month NAME and only changes the numbers, validly", () => {
    const fake = fakeFor("DOB", "5 janvier 1990", 0);
    expect(fake).toContain("janvier");
    expect(fake).not.toBe("5 janvier 1990");
    const [day, year] = parts(fake);
    expect(day).toBeGreaterThanOrEqual(1);
    expect(day).toBeLessThanOrEqual(28);
    expect(year).toBeGreaterThanOrEqual(1940);
    expect(year).toBeLessThanOrEqual(2004);
  });

  it("a generic DATE uses a recent plausible year", () => {
    const fake = fakeFor("DATE", "03/2024", 0);
    expect(fake).toHaveLength("03/2024".length);
    const [month, year] = parts(fake);
    expect(month).toBeGreaterThanOrEqual(1);
    expect(month).toBeLessThanOrEqual(12); // month-only field stays a valid month
    expect(year).toBeGreaterThanOrEqual(2005);
    expect(year).toBeLessThanOrEqual(2024);
  });

  it("is deterministic", () => {
    expect(fakeFor("DOB", "12/05/1990", 2)).toBe(fakeFor("DOB", "12/05/1990", 2));
  });
});
