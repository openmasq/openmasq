import { describe, expect, it, vi } from "vitest";

// Mock DNS so hostname resolution is deterministic and offline.
const lookup = vi.fn();
vi.mock("node:dns/promises", () => ({ lookup: (...a: unknown[]) => lookup(...a) }));

import { isPrivateIp, assertPublicUrl, verifiedLookupAddresses } from "./net";

describe("isPrivateIp", () => {
  it("flags loopback / private / link-local / reserved IPv4", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254", // cloud metadata
      "100.64.0.1", // CGNAT
      "0.0.0.0",
      "198.18.0.5",
      "240.0.0.1",
      "192.88.99.1", // 6to4 relay anycast — routes off-box to an arbitrary relay
    ]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
  });

  it("allows public IPv4", () => {
    // 192.88.98/24 and 192.88.100/24 bracket the 6to4 /24 — the guard must be that
    // narrow and not swallow the rest of 192.88/16.
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.15.0.1", "172.32.0.1", "192.167.0.1", "192.88.98.1", "192.88.100.1"]) {
      expect(isPrivateIp(ip), ip).toBe(false);
    }
  });

  it("flags loopback / ULA / link-local / mapped IPv6", () => {
    for (const ip of ["::1", "fc00::1", "fd12:3456::1", "fe80::1", "::ffff:127.0.0.1"]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
    expect(isPrivateIp("2606:4700::1111")).toBe(false); // public
  });

  // Audit H-7: the HEX-notation embedded-v4 forms used to slip through as "public".
  it("flags IPv4-mapped/compatible IPv6 in HEX notation (H-7)", () => {
    for (const ip of [
      "::ffff:a9fe:a9fe", // 169.254.169.254 cloud metadata
      "::ffff:7f00:1", // 127.0.0.1 loopback
      "::7f00:1", // ::127.0.0.1 (IPv4-compatible)
      "::ffff:a9fe:a9fe".toUpperCase(),
    ]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
    expect(isPrivateIp("::ffff:8.8.8.8")).toBe(false); // mapped PUBLIC v4 stays public
  });

  // Audit NET-F1: a fully-expanded / non-`::`-grouped IPv4-mapped form is valid IPv6 but
  // does NOT start with `::`, so the old regex waved it through as public.
  it("flags IPv4-mapped IPv6 in ANY grouping, not just leading :: (NET-F1)", () => {
    for (const ip of [
      "0:0:0:0:0:ffff:169.254.169.254", // metadata, fully expanded
      "0:0:0:0:0:ffff:127.0.0.1", // loopback, fully expanded
      "0:0:0:0:0:0:169.254.169.254", // IPv4-compat, fully expanded
      "0:0:0:0:0:ffff:a9fe:a9fe", // metadata, hex, fully expanded
    ]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
    expect(isPrivateIp("0:0:0:0:0:ffff:8.8.8.8")).toBe(false); // public mapped stays public
  });

  it("flags multicast (ff00::/8) and site-local (fec0::/10) IPv6 (NET-F1)", () => {
    for (const ip of ["ff02::1", "ff00::", "fec0::1"]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
  });
});

describe("assertPublicUrl", () => {
  it("rejects internal hostnames without touching DNS", async () => {
    await expect(assertPublicUrl("http://localhost/x.pdf")).rejects.toThrow();
    await expect(assertPublicUrl("http://foo.local/x.pdf")).rejects.toThrow();
    expect(lookup).not.toHaveBeenCalled();
  });

  it("rejects literal private IPs (no DNS)", async () => {
    await expect(assertPublicUrl("http://169.254.169.254/meta.pdf")).rejects.toThrow();
    await expect(assertPublicUrl("http://127.0.0.1:8080/x.pdf")).rejects.toThrow();
    expect(lookup).not.toHaveBeenCalled();
  });

  it("passes a literal public IP without DNS", async () => {
    // assertPublicUrl returns the pinned public addresses (DNS-rebinding defence): for a
    // literal IP that's the host itself, and no DNS lookup happens.
    await expect(assertPublicUrl("https://8.8.8.8/x.pdf")).resolves.toEqual(["8.8.8.8"]);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("labels a RESOLUTION failure as EDNS_UNRESOLVED — a Wi-Fi blip is not a refusal", async () => {
    // Still fail-closed (it throws), but tellable apart from the SSRF refusal: the
    // browser tool path collapsed both into « Navigation bloquée (adresse
    // interne/privée) », so a network outage read as a security block — the model gave
    // up on the browser and the user was told lemonde/etfdb was a private address.
    lookup.mockRejectedValueOnce(Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" }));
    const err = await assertPublicUrl("https://etfdb.com/etfs/").catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as NodeJS.ErrnoException).code).toBe("EDNS_UNRESOLVED");
    expect(String(err)).not.toMatch(/private|internal/i);
  });

  it("a genuine private-address refusal does NOT carry the DNS code", async () => {
    lookup.mockResolvedValueOnce([{ address: "10.0.0.5", family: 4 }]);
    const err = await assertPublicUrl("https://sneaky.example.com/x.pdf").catch((e) => e);
    expect((err as NodeJS.ErrnoException).code).toBeUndefined();
    expect(String(err)).toMatch(/private/i);
  });

  it("rejects a hostname that resolves to a private address", async () => {
    lookup.mockResolvedValueOnce([{ address: "10.0.0.5", family: 4 }]);
    await expect(assertPublicUrl("https://sneaky.example.com/x.pdf")).rejects.toThrow();
  });

  it("allows a hostname that resolves to a public address", async () => {
    lookup.mockResolvedValueOnce([{ address: "203.0.113.9", family: 4 }]);
    // Resolves to the pinned resolved address(es) — the caller connects to those exact IPs.
    await expect(
      assertPublicUrl("https://export-download.canva.com/x.pdf"),
    ).resolves.toEqual(["203.0.113.9"]);
  });
});

describe("verifiedLookupAddresses (undici connect.lookup pin)", () => {
  // REGRESSION: undici's custom `connect.lookup` takes the dns.lookup({all:true}) callback
  // contract — an ARRAY of {address, family}. The old code called cb in the 3-arg
  // (err, address, family) form, so undici read `address` as undefined → "Invalid IP address:
  // undefined" → EVERY safeFetch threw `fetch failed` (favicons/link-previews/file-fetch dead).
  it("returns the ARRAY-of-{address,family} shape, with correct v4/v6 families", () => {
    expect(verifiedLookupAddresses(["140.82.113.3", "2606:50c0:8001::215"])).toEqual([
      { address: "140.82.113.3", family: 4 },
      { address: "2606:50c0:8001::215", family: 6 },
    ]);
  });
  it("keeps ALL verified addresses so undici can Happy-Eyeballs past an unreachable IPv6", () => {
    // Both were vetted public by assertPublicUrl; returning both lets an IPv6-only-broken
    // network fall back to the IPv4 without dead-ending on a single pinned IPv6.
    expect(verifiedLookupAddresses(["2606:50c0:8001::215", "140.82.113.3"])).toHaveLength(2);
  });
});
