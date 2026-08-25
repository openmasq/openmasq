import { describe, expect, it } from "vitest";
import { pseudonymize } from "./pseudonymize";
import type { Vault } from "../types";

/** The fake chosen for `original` (vault maps fake → original). */
function fakeOf(vault: Vault, original: string): string | undefined {
  return Object.entries(vault).find(([, v]) => v === original)?.[0];
}

// Regression: an IPv4 looks like a dotted "bare number", so the
// `isBareNumber && !numberCarriesMeaning` guard used to DROP every IP the regex
// rule caught — `pseudonymize` returned an empty vault and the real IP leaked to
// the model (the marker-mode `redact()` never had this bug). IPs must be swapped
// for a same-shape fake and recorded in the vault (reversible).
describe("pseudonymize redacts IP addresses (not dropped as bare numbers)", () => {
  it("swaps standalone IPv4s for same-shape fakes, into the vault", async () => {
    const input = 'ip1 144.48.82.1 et ip2 89.205.204.92 ; json {"ip":"144.48.82.1"}';
    const vault: Vault = {};
    const { text } = await pseudonymize(input, { vault, numbers: false });

    // both real IPs are gone from the wire
    expect(text).not.toContain("144.48.82.1");
    expect(text).not.toContain("89.205.204.92");

    // both are recorded in the vault (reversible) with a valid IPv4-shaped fake
    for (const ip of ["144.48.82.1", "89.205.204.92"]) {
      const fake = fakeOf(vault, ip);
      expect(fake, `IP ${ip} must be in the vault`).toBeTruthy();
      expect(fake).toMatch(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
      expect(fake).not.toBe(ip);
      // Every octet must be a VALID 0-255 (the old char-for-char swap emitted
      // out-of-range octets like `313` / `973` — an obviously broken fake IP).
      for (const oct of fake!.split(".")) expect(Number(oct)).toBeLessThanOrEqual(255);
    }
  });
});

// Regression: the rule's "compact IPv6" alternative was loose enough to match a
// colon-separated CLOCK TIME (`21:21:09`) — a timestamp column flooded the audit as
// "Adresses IP". `isRealIp` now rejects short, all-decimal colon runs.
describe("clock times are NOT flagged as IPv6", () => {
  it("leaves HH:MM:SS timestamps in clear", async () => {
    const input = "last sign-in 21:21:09, created 10:50:28, updated 07:44:14";
    const vault: Vault = {};
    const { text } = await pseudonymize(input, { vault, numbers: false });
    for (const t of ["21:21:09", "10:50:28", "07:44:14"]) {
      expect(text, `time ${t} must survive`).toContain(t);
      expect(fakeOf(vault, t)).toBeFalsy();
    }
  });

  it("still redacts a genuine IPv6", async () => {
    const ipv6 = "2001:db8:85a3:8d3:1319:8a2e:370:7348";
    const vault: Vault = {};
    const { text } = await pseudonymize(`server ${ipv6} online`, { vault, numbers: false });
    expect(text).not.toContain(ipv6);
    expect(fakeOf(vault, ipv6), "IPv6 must be redacted into the vault").toBeTruthy();
  });
});
