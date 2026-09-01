import { describe, expect, it } from "vitest";
import { fakeDerivedNavHost } from "./browserNavFake";

// Vault is fake → real.
const VAULT = { "Norvik Group": "Karl Studio", "Évreux": "Rouen", n1: "4242" };

describe("fakeDerivedNavHost", () => {
  it("flags a hostname minted from a fake (lowercased, de-spaced, de-accented)", () => {
    expect(fakeDerivedNavHost("https://norvikgroup.fr", VAULT)).toEqual({
      fake: "Norvik Group",
      host: "norvikgroup.fr",
    });
    expect(fakeDerivedNavHost("https://www.norvik-group.com/contact", VAULT)?.fake).toBe("Norvik Group");
    expect(fakeDerivedNavHost("http://norvikgroup.co.uk", VAULT)?.fake).toBe("Norvik Group");
  });

  it("never flags the REAL value's own domain — that is the right site", () => {
    expect(fakeDerivedNavHost("https://karl-studio.fr", VAULT)).toBeNull();
    expect(fakeDerivedNavHost("https://www.karlstudio.com", VAULT)).toBeNull();
  });

  it("leaves unrelated hosts alone (search engines, news sites, anything)", () => {
    for (const u of [
      "https://www.google.com/search?q=Norvik+Group", // fake in the QUERY is the exfil scan's job, not ours
      "https://www.lemonde.fr",
      "https://fr.wikipedia.org/wiki/Rouen",
    ]) {
      expect(fakeDerivedNavHost(u, VAULT)).toBeNull();
    }
  });

  it("ignores short fakes — a 2-char number token must not flag half the web", () => {
    expect(fakeDerivedNavHost("https://n1.example.com", VAULT)).toBeNull();
    // "Évreux" normalizes to "evreux" (6) → long enough, and IS flagged on a minted host.
    expect(fakeDerivedNavHost("https://evreux-agence.fr", VAULT)?.fake).toBe("Évreux");
  });

  it("a host matching BOTH forms is ambiguous → allowed (the exfil scan still runs)", () => {
    expect(fakeDerivedNavHost("https://norvikgroup-karlstudio.fr", VAULT)).toBeNull();
  });

  it("tolerates garbage input (no throw, no flag)", () => {
    expect(fakeDerivedNavHost("", VAULT)).toBeNull();
    expect(fakeDerivedNavHost("not a url", VAULT)).toBeNull();
    expect(fakeDerivedNavHost("ftp://norvikgroup.fr", VAULT)).toBeNull();
    expect(fakeDerivedNavHost("https://norvikgroup.fr", {})).toBeNull();
  });
});
