import { describe, expect, it } from "vitest";
import { detectAddresses } from ".";

const found = (t: string) => detectAddresses(t).filter((d) => d.category === "ADDRESS").map((d) => `${d.value}${d.country ? ` [${d.country}]` : ""}`);

describe("detectAddresses — the Germanic and Nordic compounds", () => {
  it("a hyphenated compound, the postal code and city consumed", () => {
    expect(found("Adresse: Vadim-Pohl-Ring 6, 12345 Berlin")).toEqual(["Vadim-Pohl-Ring 6, 12345 Berlin [DE]"]);
    expect(found("wohnhaft Fritschgasse 5, 1010 Wien")).toEqual(["Fritschgasse 5, 1010 Wien [DE]"]);
    expect(found("Ninthelaan 475, 1234 AB Amsterdam")).toEqual(["Ninthelaan 475, 1234 AB Amsterdam [NL]"]);
  });
  it("the number first, and a Nordic street with no country table", () => {
    expect(found("Payer: Nigel Henschel    Adress: 6 Vadim-Pohl-Ring")).toEqual(["6 Vadim-Pohl-Ring [DE]"]);
    expect(found("Straße: 549 Furugränd, 12345 Berlin")).toEqual(["549 Furugränd, 12345 Berlin"]);
    expect(found("bor på Storgatan 12, 111 22 Stockholm")).toEqual(["Storgatan 12"]);
  });
  it("a word that merely ends in a type word is not a street", () => {
    expect(found("the boring 12 percent rise")).toEqual([]);
    expect(found("Kapitel 3 Absatz 2")).toEqual([]);
    expect(found("Anschrift: MUSTERSTRASSE 12, 10115 Berlin")).toEqual(["MUSTERSTRASSE 12, 10115 Berlin [DE]"]);
  });
});
