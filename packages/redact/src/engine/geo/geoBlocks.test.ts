import { describe, expect, it } from "vitest";
import type { Detection } from "../../types";
import { resolveGeoBlocks } from "./geoBlocks";
import { departmentOfCp } from "../frGeo";

const cand = (value: string, category: string, start: number, country = "FR"): Detection => ({
  value,
  category,
  country,
  start,
});

describe("resolveGeoBlocks — cross-field geo coherence", () => {
  it("derives ONE coherent place: the commune's postal ↔ the Département name the same place", () => {
    const m = resolveGeoBlocks(
      [cand("92110 CLICHY", "PLACE", 20), cand("Hauts-de-Seine", "DEPARTMENT", 60)],
      new Set(),
    );
    const communeFake = m.get("92110 CLICHY")!;
    const deptFake = m.get("Hauts-de-Seine")!;
    expect(communeFake).toBeTruthy();
    expect(deptFake).toBeTruthy();
    const cp = communeFake.match(/\d{5}/)![0];
    expect(departmentOfCp(cp)).toBe(deptFake); // coherent
    expect(communeFake).not.toContain("92110"); // real values are redacted
    expect(deptFake.toLowerCase()).not.toBe("hauts-de-seine");
  });

  it("two DISTINCT address blocks get distinct places (all fakes unique → reversible)", () => {
    const m = resolveGeoBlocks(
      [
        cand("92110 CLICHY", "PLACE", 10),
        cand("Hauts-de-Seine", "DEPARTMENT", 40),
        cand("35000 RENNES", "PLACE", 400), // far → a second block
        cand("Ille-et-Vilaine", "DEPARTMENT", 430),
      ],
      new Set(),
    );
    expect(m.size).toBe(4);
    const fakes = [...m.values()];
    expect(new Set(fakes).size).toBe(fakes.length); // no two reals share a fake
    expect(m.get("92110 CLICHY")).not.toBe(m.get("35000 RENNES"));
  });

  it("a LONE geo field is not block-grouped (kept for the independent faker)", () => {
    expect(resolveGeoBlocks([cand("Paris", "CITY", 5)], new Set()).size).toBe(0);
  });

  it("avoids a place whose components are already TAKEN (collision-free)", () => {
    // Pin many candidate cities as taken so the picker must skip past them; the result
    // must still be coherent and never reuse a taken string.
    const taken = new Set(["Isère", "38000 Grenoble"]);
    const m = resolveGeoBlocks(
      [cand("92110 CLICHY", "PLACE", 0), cand("Hauts-de-Seine", "DEPARTMENT", 30)],
      taken,
    );
    for (const f of m.values()) expect(taken.has(f)).toBe(false);
  });

  it("an UNCOVERED country (no place table, e.g. JP) is skipped → independent faker", () => {
    const m = resolveGeoBlocks(
      [cand("東京都", "CITY", 0, "JP"), cand("100-0001", "POSTAL_CODE", 30, "JP")],
      new Set(),
    );
    expect(m.size).toBe(0);
  });

  it("CN block: city / province / postal fake to ONE coherent CN place (province matches)", () => {
    // Country inferred from the Han script (no country tag on the city/postal fields).
    const m = resolveGeoBlocks(
      [cand("深圳市", "CITY", 0, ""), cand("广东省", "REGION", 20, "CN"), cand("518000", "POSTAL_CODE", 40, "")],
      new Set(),
    );
    expect(m.size).toBe(3);
    const cityFake = m.get("深圳市")!;
    const provFake = m.get("广东省")!;
    expect(provFake).not.toBe("广东省"); // a DIFFERENT province
    expect(cityFake).not.toBe("深圳市");
  });

  it("US block: City / State / Zip fake to ONE coherent US place (state ≠ real, format kept)", () => {
    const m = resolveGeoBlocks(
      [cand("Austin", "CITY", 0, "US"), cand("Texas", "REGION", 20, "US"), cand("78701", "POSTAL_CODE", 40, "US")],
      new Set(),
    );
    expect(m.size).toBe(3);
    const stateFake = m.get("Texas")!;
    expect(stateFake).not.toBe("Texas"); // a DIFFERENT state
    expect(stateFake).toMatch(/^[A-Z][a-z]/); // full name kept (original was a full name)
  });
});
