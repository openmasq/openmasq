import { describe, expect, it } from "vitest";
import { isReservedIp } from "../validators";
import { pseudonymize } from "../../index";

/**
 * Reserved / special-use IPs identify no host on anybody's network — masking one protects
 * nobody and hands a coding agent a wrong address. The console made it visible: a run over
 * OpenMasq's own repo faked `127.0.0.1`, `169.254.169.254` and turned `0.0.0.0` into a public
 * address. A PRIVATE address stays masked — internal topology can be sensitive.
 */
describe("isReservedIp — the constants that are nobody's data", () => {
  it("is true for special-use ranges", () => {
    for (const ip of [
      "0.0.0.0", "127.0.0.1", "127.231.191.227", "169.254.169.254", "169.254.0.1",
      "192.0.2.5", "198.51.100.9", "203.0.113.1", "255.255.255.255",
      "::", "::1", "fe80::1", "febf::abcd", "2001:db8::1",
    ])
      expect(isReservedIp(ip), ip).toBe(true);
  });

  it("is false for a real host — public OR private (still PII, still masked)", () => {
    for (const ip of [
      "144.48.82.1", "8.8.8.8", "89.205.204.92", // public
      "10.0.0.42", "172.16.5.9", "192.168.1.1", // RFC1918 private
      "100.64.0.1", // CGNAT
      "fd00:ec2::254", "2606:4700::1", // ULA + public IPv6
    ])
      expect(isReservedIp(ip), ip).toBe(false);
  });
});

describe("the ip rule leaves a reserved address in clear", () => {
  it("keeps the constants, masks a real host, in one pass", async () => {
    const input =
      "bind 0.0.0.0, loopback 127.0.0.1, metadata 169.254.169.254, but the box is 144.48.82.1 and 192.168.1.10";
    const { text, matches } = await pseudonymize(input, { vault: {}, numbers: false });
    // reserved constants survive verbatim — the agent needs them
    for (const kept of ["0.0.0.0", "127.0.0.1", "169.254.169.254"]) expect(text).toContain(kept);
    // the real public + private host are gone
    expect(text).not.toContain("144.48.82.1");
    expect(text).not.toContain("192.168.1.10");
    expect(matches.map((m) => m.value).sort()).toEqual(["144.48.82.1", "192.168.1.10"]);
  });
});
