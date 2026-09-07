// A fake address keeps two things a reader counts on: colleagues share a domain, and the
// domain keeps its extension. The utility bench (`apps/proxy/bench`) measured both breaking
// before: two addresses at one real domain landed on two fake domains, so "how many
// domains?" answered 3 for 2.
import { describe, expect, it } from "vitest";
import { pseudonymize } from "../../index";
import { keyFromHex } from "../fakes/prf";

const domainOf = (email: string) => email.slice(email.lastIndexOf("@") + 1);

describe("fake email domains", () => {
  it("gives every address at one real domain the SAME fake domain", async () => {
    const vault: Record<string, string> = {};
    const text =
      "clara.vermeil@atelier-sud.fr, noe.tallard@atelier-sud.fr et service@bureau-nord.fr";
    const r = await pseudonymize(text, { vault });
    const fakes = Object.entries(vault)
      .filter(([, real]) => real.includes("@"))
      .map(([fake, real]) => ({ fake, real }));
    const sud = fakes
      .filter((f) => f.real.endsWith("@atelier-sud.fr"))
      .map((f) => domainOf(f.fake));
    const nord = fakes
      .filter((f) => f.real.endsWith("@bureau-nord.fr"))
      .map((f) => domainOf(f.fake));
    expect(sud).toHaveLength(2);
    expect(new Set(sud).size).toBe(1); // one real domain → one fake domain
    expect(nord).toHaveLength(1);
    expect(sud[0]).not.toBe(nord[0]); // two real domains stay two
    expect(r.text).not.toContain("atelier-sud.fr");
  });

  it("keeps the extension: a .fr address reads .fr, a .io reads .io", async () => {
    for (const [email, tld] of [
      ["clara.vermeil@atelier-sud.fr", ".fr"],
      ["noe.tallard@brightloop.io", ".io"],
      ["iris.bonnefoy@example.de", ".de"],
    ] as const) {
      const vault: Record<string, string> = {};
      await pseudonymize(`Écris à ${email}.`, { vault, key: "e5".repeat(32) });
      const fake = Object.keys(vault).find((k) => k.includes("@"));
      expect(fake, email).toBeDefined();
      expect(domainOf(fake!).endsWith(tld)).toBe(true);
      expect(domainOf(fake!)).not.toBe(domainOf(email));
    }
  });

  it("is keyed: the same real domain maps elsewhere under another conversation key", async () => {
    const pick = async (key: string) => {
      const vault: Record<string, string> = {};
      await pseudonymize("clara.vermeil@atelier-sud.fr", { vault, key });
      return domainOf(Object.keys(vault).find((k) => k.includes("@"))!);
    };
    expect(keyFromHex("a1".repeat(32))).toBeDefined();
    const seen = new Set([
      await pick("a1".repeat(32)),
      await pick("b2".repeat(32)),
      await pick("c3".repeat(32)),
    ]);
    expect(seen.size).toBeGreaterThan(1);
  });
});
