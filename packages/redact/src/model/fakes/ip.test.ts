// The two properties a coding agent reasons on, pinned: an address keeps its CLASS (the
// substitute answers "private or public?" the same) and its NEIGHBOURHOOD (two hosts on one
// /24 stay on one fake /24). The utility bench (`apps/proxy/bench`) measured both failing
// before this generator existed: a LAN address was answered "publique", a shared /24 "non".
import { describe, expect, it } from "vitest";
import { keyFromHex } from "./prf";
import { fakeIp, ipPrefixPairs } from "./ip";

const KEY = keyFromHex("c3".repeat(32))!;
const octets = (ip: string) => ip.split(".").map(Number);

describe("fakeIp keeps the class", () => {
  it("a loopback stays loopback, each RFC 1918 block stays in its block", () => {
    expect(octets(fakeIp("127.0.0.1", 0))[0]).toBe(127);
    expect(octets(fakeIp("10.4.5.6", 0))[0]).toBe(10);
    const b = octets(fakeIp("172.20.1.9", 0));
    expect(b[0]).toBe(172);
    expect(b[1]).toBeGreaterThanOrEqual(16);
    expect(b[1]).toBeLessThanOrEqual(31);
    expect(fakeIp("192.168.1.42", 0).startsWith("192.168.")).toBe(true);
    expect(fakeIp("169.254.7.7", 0).startsWith("169.254.")).toBe(true);
  });

  it("a public address stays public — never lands in a private, loopback or multicast block", () => {
    for (const real of ["104.215.3.14", "8.8.8.8", "93.184.216.34", "203.0.113.5"]) {
      for (let salt = 0; salt < 40; salt++) {
        const [a, b] = octets(fakeIp(real, salt, KEY));
        expect(a, `${real} salt ${salt}`).toBeGreaterThanOrEqual(1);
        expect(a).toBeLessThanOrEqual(223);
        expect([10, 127]).not.toContain(a);
        expect(a === 192 && b === 168).toBe(false);
        expect(a === 172 && b >= 16 && b <= 31).toBe(false);
        expect(a === 169 && b === 254).toBe(false);
      }
    }
  });

  it("never returns the real address, and differs from it under every key", () => {
    for (const real of ["127.0.0.1", "10.0.0.1", "192.168.0.1", "1.2.3.4"]) {
      expect(fakeIp(real, 0)).not.toBe(real);
      expect(fakeIp(real, 0, KEY)).not.toBe(real);
    }
  });
});

describe("fakeIp keeps the neighbourhood (prefix-preserving)", () => {
  it("two hosts on one /24 land on one fake /24; two /24s stay apart", () => {
    const a = fakeIp("10.0.5.7", 0, KEY);
    const b = fakeIp("10.0.5.99", 0, KEY);
    const c = fakeIp("10.0.6.7", 0, KEY);
    expect(a.split(".").slice(0, 3)).toEqual(b.split(".").slice(0, 3));
    expect(a).not.toBe(b);
    expect(a.split(".").slice(0, 3)).not.toEqual(c.split(".").slice(0, 3));
    // ...and the /16 is shared by all three (prefix by prefix).
    expect(a.split(".").slice(0, 2)).toEqual(c.split(".").slice(0, 2));
  });

  it("is keyed: another conversation key maps the same network elsewhere", () => {
    const other = keyFromHex("d4".repeat(32))!;
    expect(fakeIp("10.0.5.7", 0, KEY)).not.toBe(fakeIp("10.0.5.7", 0, other));
  });

  it("hands the vault the /24 pair, and nothing when the prefix is verbatim", () => {
    const real = "10.0.5.7";
    const fake = fakeIp(real, 0, KEY);
    const pairs = ipPrefixPairs(real, fake);
    expect(pairs).toEqual([[fake.split(".").slice(0, 3).join("."), "10.0.5"]]);
    expect(ipPrefixPairs("192.168.1.42", "192.168.1.77")).toEqual([]);
    expect(ipPrefixPairs("fe80::1", "fe80::2")).toEqual([]);
  });
});

describe("fakeIp on IPv6", () => {
  it("keeps a link-local or unique-local scope, hides the rest", () => {
    expect(fakeIp("fe80::1a2b:3c4d", 0, KEY).startsWith("fe80:")).toBe(true);
    expect(fakeIp("fd12:3456::1", 0, KEY).startsWith("fd")).toBe(true);
    expect(fakeIp("2a01:e0a:1234::1", 0, KEY)).not.toBe("2a01:e0a:1234::1");
  });
});
