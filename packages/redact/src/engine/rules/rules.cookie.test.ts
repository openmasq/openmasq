import { describe, expect, it } from "vitest";
import { redact } from "../redact";
import { pseudonymize } from "../../model/pseudonymize";

const wire = (s: string) => redact(s).text;

describe("cookies", () => {
  it("takes the whole Cookie / Set-Cookie header line", () => {
    const out = wire("Cookie: sessionid=8f3a2b9c1d; csrftoken=Qm9uam91cg\nUser-Agent: x");
    expect(out).not.toContain("8f3a2b9c1d");
    expect(out).not.toContain("Qm9uam91cg");
    expect(out).toContain("User-Agent: x");
  });
  it("takes a bare declaration when a cookie attribute follows it", () => {
    const out = wire("user_sid=j9k2l8m5n7p6o3q4r1s2; Path=/; Max-Age=3600; HttpOnly and then prose");
    expect(out).not.toContain("j9k2l8m5n7p6o3q4r1s2");
    expect(out).toContain("and then prose");
  });
  it("leaves an ordinary assignment or query string alone — no attribute, no cookie", () => {
    for (const s of ["timezone=UTC+07:00 is the setting", "?page=2&sort=name", "LOG_LEVEL=debug; NODE_ENV=production"]) {
      expect(wire(s)).toBe(s);
    }
  });

  it("survives the whole pipeline — the type carries a category all the way down", async () => {
    // A rule type absent from `LABELS` reaches `pseudonymize` with no category and dies in
    // `dropLineNoise` (`redactionCategory(undefined)`). `redact()` never goes that deep,
    // which is how a rule can pass every vector here and crash the product on first use.
    const r = await pseudonymize("Set-Cookie: sid=8f3a2b9c1d2e4f; Path=/; HttpOnly", {});
    expect(r.text).not.toContain("8f3a2b9c1d2e4f");
  });
});
