import { describe, expect, it } from "vitest";
import { redact } from "../../index";
import { nirKeyValid, nirMonthOk } from "./rules.franceNir";

// Drive the REAL engine (marker mode) so ordering/overlap with card/phone is exercised too.
function redacted(text: string, value: string): boolean {
  const o = redact(text, {}).text;
  return !o.includes(value) && /\[REDACTED_[A-Z_]+_\d+\]/.test(o);
}
const clear = (text: string) => redact(text, {}).text === text;

describe("NIR — the forms people actually write", () => {
  it("dash-separated groups, key glued or apart", () => {
    expect(redacted("Numéro de sécurité sociale 1-84-03-75-120-005-49", "1-84-03-75-120-005-49")).toBe(true);
    expect(redacted("N° SS 1 84 03 75 120 005-49", "1 84 03 75 120 005")).toBe(true);
  });

  it("the bare 13 digits behind a keyword (« N° SS », « NIR », « sécu »)", () => {
    expect(redacted("N° SS : 1840375120005", "1840375120005")).toBe(true);
    expect(redacted("NIR 1840375120005 clé 49", "1840375120005")).toBe(true);
  });

  it("an OCR O-for-zero behind a keyword", () => {
    expect(redacted("N° SS : 1 84 O3 75 120 005 49", "1 84 O3 75 120 005 49")).toBe(true);
  });

  it("a keyword lets ANY month through (invented test numbers included)", () => {
    expect(redacted("N° SS 2 85 13 99 123 456 78", "2 85 13 99 123 456 78")).toBe(true);
  });

  it("a SPECIAL month (20–42, 50–99) fires bare only with a valid key", () => {
    expect(redacted("salarié 2 85 42 99 123 456 64 inscrit", "2 85 42 99 123 456 64")).toBe(true);
    expect(redacted("réf 190209912345602 ok", "190209912345602")).toBe(true);
    // Same shape, wrong key, no keyword: an ordinary 15-digit number stays clear.
    expect(clear("réf 190209912345603 ok")).toBe(true);
  });

  it("still refuses a bare 13-digit run with no keyword (epoch milliseconds)", () => {
    expect(clear("ts 1840375120005 ms")).toBe(true);
  });
});

describe("nirKeyValid / nirMonthOk", () => {
  it("computes the key, Corsica included", () => {
    expect(nirKeyValid("1 84 03 75 120 005 49")).toBe(true);
    expect(nirKeyValid("1 84 03 75 120 005 48")).toBe(false);
    // 2A → 19: 1840319120005 mod 97.
    const k = 97 - (1840319120005 % 97);
    expect(nirKeyValid(`1 84 03 2A 120 005 ${String(k).padStart(2, "0")}`)).toBe(true);
  });

  it("13–19 and 43–49 are never issued; a special month needs its key", () => {
    expect(nirMonthOk("1 84 03 75 120 005")).toBe(true);
    expect(nirMonthOk("1 84 15 75 120 005 12")).toBe(false);
    expect(nirMonthOk("1 84 45 75 120 005 12")).toBe(false);
    expect(nirMonthOk("2 85 42 99 123 456 64")).toBe(true);
    expect(nirMonthOk("2 85 42 99 123 456 65")).toBe(false);
  });
});
