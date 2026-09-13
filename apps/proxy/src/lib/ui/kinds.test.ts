import { describe, expect, it } from "vitest";
import { inClearPhrase } from "./kinds";

describe("what a level leaves in clear, in words", () => {
  /** Ordered by what it costs the reader: that names and companies leave in clear is the thing
   *  to know first, whatever order the arithmetic returned them in. */
  it("names the consequential kinds first", () => {
    expect(inClearPhrase(["date", "path", "company", "name"], 80)).toBe(
      "names, companies, dates, paths",
    );
  });

  /** Never silently cut: what does not fit is counted. */
  it("counts what it cannot fit, and says nothing when nothing is left", () => {
    const long = ["name", "company", "address", "location", "dob", "date", "path", "url"];
    expect(inClearPhrase(long, 80)).toBe(
      "names, companies, addresses, places, birth dates +3 more",
    );
    expect(inClearPhrase(long, 24)).toMatch(/^names, companies \+6 more$/);
    expect(inClearPhrase([], 80)).toBe("");
  });

  /** An unknown kind is printed as the engine names it rather than dropped — a kind missing
   *  from the label table must still be stated. */
  it("keeps a kind it has no label for", () => {
    expect(inClearPhrase(["quantum"], 80)).toBe("quantum");
  });
});
