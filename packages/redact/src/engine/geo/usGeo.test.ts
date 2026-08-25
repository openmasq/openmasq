import { describe, expect, it } from "vitest";
import { detectUsGeo } from "./usGeo";
import { isUsState, usStateName, isUsStateFullName } from "./usStates";

describe("usStates helpers", () => {
  it("recognises full names and 2-letter codes", () => {
    expect(isUsState("California")).toBe(true);
    expect(isUsState("ca")).toBe(true);
    expect(isUsState("TX")).toBe(true);
    expect(isUsState("Paris")).toBe(false);
  });
  it("maps a code to its full name, and knows the form", () => {
    expect(usStateName("NY")).toBe("New York");
    expect(isUsStateFullName("Texas")).toBe(true);
    expect(isUsStateFullName("TX")).toBe(false);
  });
});

describe("detectUsGeo — labeled US State field (precision-first)", () => {
  const vals = (t: string) => detectUsGeo(t).map((d) => `${d.value}:${d.country}`);

  it("detects a labeled State — full name or abbreviation", () => {
    expect(vals("State : Texas")).toEqual(["Texas:US"]);
    expect(vals("Province: CA")).toEqual(["CA:US"]);
    expect(vals("État : New York, USA")).toEqual(["New York:US"]);
  });
  it("does NOT detect a bare state name in prose (no label → ambiguous)", () => {
    expect(detectUsGeo("Georgia is a country and a US state.")).toEqual([]);
    expect(detectUsGeo("I flew to Washington yesterday.")).toEqual([]);
  });
  it("ignores a labeled value that isn't a US state", () => {
    expect(detectUsGeo("State : the current one")).toEqual([]);
    expect(detectUsGeo("Province : Ontario")).toEqual([]); // a CA province, not a US state
  });
  it("carries an offset (for block grouping)", () => {
    const [d] = detectUsGeo("State : Texas");
    expect(typeof d.start).toBe("number");
    expect(d.category).toBe("REGION");
  });
});
