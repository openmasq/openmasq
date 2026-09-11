import { describe, expect, it } from "vitest";
import { redact } from "../../index";

// A MAC has no checksum, so the rule fires on shape; the adjacency guards are what keep it
// off a byte DUMP — a 6-pair run that is part of a longer `XX-XX-…` hex sequence, which is
// binary test data, not a device address (measured across serializer test suites).
const masked = (t: string, v: string) => !redact(t).text.includes(v);

describe("MAC rule — an address, not a byte dump", () => {
  it("masks a standalone MAC address (`:` and `-` forms)", () => {
    expect(masked("device 00:1A:2B:3C:4D:5E joined", "00:1A:2B:3C:4D:5E")).toBe(true);
    expect(masked("MAC 00-1a-2b-3c-4d-5e", "00-1a-2b-3c-4d-5e")).toBe(true);
  });
  it("does NOT mask a 6-pair run inside a longer hex dump", () => {
    // 8-byte dump: the middle 6-pair windows must not be picked out as MACs.
    const t = "bytes C5-E2-BA-E3-00-00-2D-39 in the frame";
    expect(redact(t).text).toBe(t);
  });
  it("still masks two MACs in a space/comma-separated list", () => {
    const t = "allow 00:1A:2B:3C:4D:5E, AA:BB:CC:DD:EE:FF";
    expect(masked(t, "00:1A:2B:3C:4D:5E")).toBe(true);
    expect(masked(t, "AA:BB:CC:DD:EE:FF")).toBe(true);
  });
});
