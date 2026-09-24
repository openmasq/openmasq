import { describe, expect, it } from "vitest";
import { redact } from "../redact";

const ids = (s: string) => redact(s).matches.filter((m) => m.type === "national_id").map((m) => m.value);

describe("ECHR application numbers", () => {
  it("takes every number of an enumeration, not only the first", () => {
    expect(ids("v. the United Kingdom [GC], nos. 65731/01 and 65900/01, § 22")).toEqual(["65731/01", "65900/01"]);
    expect(ids("(applications nos. 62776/00, 63388/00 and 63464/00)")).toEqual(["62776/00", "63388/00", "63464/00"]);
  });
  it("accepts the abbreviated and the French forms", () => {
    expect(ids("App. No. 34127/03 lodged")).toEqual(["34127/03"]);
    expect(ids("requête n° 8186/78 contre")).toEqual(["8186/78"]);
  });
  it("never fires on the bare shape — a sheet reference, a fraction, a score", () => {
    expect(ids("sheet/plan 13/40 of the estate")).toEqual([]);
    expect(ids("the vote was 288/3 in favour")).toEqual([]);
    expect(ids("about 3/4 of the applicants")).toEqual([]);
  });
});
