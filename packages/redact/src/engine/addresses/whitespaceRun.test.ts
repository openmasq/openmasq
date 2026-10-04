import { describe, expect, it } from "vitest";
import { detectAddresses } from "./index";

/** A pasted document with a long run of tabs or spaces must not stall the address pass: the
 *  notarial « à CITY (CP) » lookbehind ran at every position with two space runs that could
 *  split the same spaces — 9 s for 2 000 tabs, a send blocked at the redaction timeout. */
describe("detectAddresses on a long whitespace run", () => {
  it.each(["\t", " "])("stays fast on 20 000 × %j", (ws) => {
    const t = Date.now();
    detectAddresses(`demeurant à${ws.repeat(20_000)}x`);
    expect(Date.now() - t).toBeLessThan(1_000);
  });

  it("still finds the notarial place after a label and its separator", () => {
    const places = detectAddresses("Siège : BORDEAUX (33000)").map((d) => d.value);
    expect(places).toContain("BORDEAUX (33000)");
  });
});
