import { describe, expect, it } from "vitest";
import { pseudonymize } from "../../index";
import { detectAddresses } from "./index";

/** US addresses as they are written — USPS abbreviations, directionals — and the house number
 *  that `trimAddressTail` used to read as a postal code (« 3301 McKinney Ave » → « 3301 Mc »). */
describe("US addresses: abbreviations, directionals, a 4-digit house number", () => {
  const addresses = (t: string) =>
    detectAddresses(t)
      .filter((d) => d.category === "ADDRESS")
      .map((d) => d.value);

  it.each([
    [
      "resides at 6120 E Saguaro Vista Dr, Scottsdale, AZ 85251, and",
      "6120 E Saguaro Vista Dr, Scottsdale, AZ 85251",
    ],
    [
      "send it to 2021 NE Alberta St, Portland, OR 97211. Thanks",
      "2021 NE Alberta St, Portland, OR 97211",
    ],
    ["(his brother), 12 Seaview Ct, Brick, NJ 08723 – loan", "12 Seaview Ct, Brick, NJ 08723"],
    ["Carlos, 3301 McKinney Ave, Dallas, TX 75204 – 60%", "3301 McKinney Ave, Dallas, TX 75204"],
    ["Address: 512 Juniper St NW, Atlanta, GA 30318", "512 Juniper St NW, Atlanta, GA 30318"],
    ["Pickup – 1820 Market St, San Francisco, CA 94102", "1820 Market St, San Francisco, CA 94102"],
  ])("%s", (text, expected) => {
    expect(addresses(text)).toContain(expected);
  });

  it.each([
    "We met at 12 St Patrick's Day parades.", // « St » is Saint before a name, never the type
    "Chapter 12 Dr Watson explains the method.",
    "Rated 5 Stars by 300 Users",
  ])("leaves %s alone", (text) => {
    expect(addresses(text)).toEqual([]);
  });

  it("a French address keeps its postal-code cut", () => {
    expect(addresses("Siège : 12 rue des Lilas, 75011 Paris. SIRET 123")).toContain(
      "12 rue des Lilas, 75011 Paris",
    );
  });

  it("the street leaves the outgoing text", async () => {
    const r = await pseudonymize("Carlos, 3301 McKinney Ave, Dallas, TX 75204 – 60%", {
      vault: {},
      numbers: false,
    });
    expect(r.text).not.toContain("McKinney");
  });
});
