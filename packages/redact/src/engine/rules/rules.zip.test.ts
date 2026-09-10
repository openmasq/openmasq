import { describe, expect, it } from "vitest";
import { redact } from "../redact";
import { pseudonymize } from "../../model/pseudonymize";

const zips = (s: string) => redact(s).matches.filter((m) => m.type === "zipcode").map((m) => m.value);

describe("US ZIP after a state code", () => {
  it("takes the ZIP after a state code, with or without the second comma", () => {
    expect(zips("Atlanta, GA 30344")).toEqual(["30344"]);
    expect(zips("Antioch, CA, 94509")).toEqual(["94509"]);
    expect(zips("Bayamón, PR 00757-1234")).toEqual(["00757-1234"]);
  });
  it("takes the ZIP after a state NAME", () => {
    expect(zips("Jeddo, Michigan, 48032")).toEqual(["48032"]);
    expect(zips("Bastrop, Texas, 78602")).toEqual(["78602"]);
  });
  it("takes the ZIP after the label word", () => {
    expect(zips("Los Gatos, postcode 95030")).toEqual(["95030"]);
    expect(zips("a postcode of 91351 in the county")).toEqual(["91351"]);
    expect(zips("ZIP: 84123")).toEqual(["84123"]);
  });
  it("needs the comma — a state word in prose is not an address", () => {
    expect(zips("either A OR 30344 units")).toEqual([]);
    expect(zips("checked IN 46201 times")).toEqual([]);
    expect(zips("GA 30344")).toEqual([]);
    expect(zips("Tulsa, 74146")).toEqual([]); // city alone: no anchor a rule may trust
  });
  it("needs a real state code", () => {
    expect(zips("Paris, FR 75011")).toEqual([]);
    expect(zips("ref, XX 12345")).toEqual([]);
  });

  it("survives the whole pipeline", async () => {
    const r = await pseudonymize("Ship to: 12 Peachtree St, Atlanta, GA 30344", {});
    expect(r.text).not.toContain("30344");
  });
});
