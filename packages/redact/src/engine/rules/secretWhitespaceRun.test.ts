import { describe, expect, it } from "vitest";
import { pseudonymize } from "../../index";

/** A pasted document with a long whitespace run must not stall the redaction pass — the
 *  secret rules' lookbehinds and the vertical-label separator were quadratic on it — and the
 *  cheap guards that fixed it must not change what is detected. */
describe("secret and label rules on a long whitespace run", () => {
  it.each(["\t", " "])("the whole pipeline stays fast on 100 000 × %j", async (ws) => {
    const t = Date.now();
    await pseudonymize(`numéro fiscal${ws.repeat(100_000)}x password:${ws.repeat(50_000)}y`, {
      vault: {},
      numbers: false,
    });
    // ~0.6 s alone; the bound leaves room for a loaded parallel run. Before: 17 s for the
    // tabs alone, minutes with the secret rules.
    expect(Date.now() - t).toBeLessThan(10_000);
  });

  it.each([
    ['password: "Sm7p!Tanc2026#x"', "Sm7p!Tanc2026#x"],
    ["API_KEY=sk_live_abc123xyz789", "sk_live_abc123xyz789"],
    ["mdp = monSuperMdp9", "monSuperMdp9"],
    ["client_secret: 9fQ2xLmA7pRt", "9fQ2xLmA7pRt"],
    ["Cookie: sessionid=abcdef123456; Path=/", "sessionid=abcdef123456"],
    ["Code BIC : DEUTDEFF", "DEUTDEFF"],
    ["Nom\nDupont-Marchal", "Dupont-Marchal"],
  ])("still masks %s", async (text, secret) => {
    const r = await pseudonymize(text, { vault: {}, numbers: false });
    expect(r.text).not.toContain(secret);
  });
});
