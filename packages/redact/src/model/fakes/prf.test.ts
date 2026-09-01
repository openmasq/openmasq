// An implementation of a standard is checked against that standard's published vectors,
// never against a snapshot of itself — a snapshot pins whatever the code does, including
// what it does wrong.
//   SHA-256: FIPS 180-4 / NIST examples.
//   HMAC-SHA256: RFC 4231, test cases 1-4 and 6 (the long-key case that exercises the
//   "key longer than the block size is hashed first" branch).
import { describe, it, expect } from "vitest";
import { sha256, hmacSha256, prfSeed, keyFromHex } from "./prf";

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const bytes = (s: string) => new TextEncoder().encode(s);
const fromHex = (h: string) => new Uint8Array(h.match(/../g)!.map((x) => parseInt(x, 16)));

describe("sha256 — FIPS 180-4 vectors", () => {
  it('"abc"', () => {
    expect(hex(sha256(bytes("abc")))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("empty string", () => {
    expect(hex(sha256(new Uint8Array(0)))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("two-block message", () => {
    const m = "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq";
    expect(hex(sha256(bytes(m)))).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
  });

  it("one million 'a' (length handling across many blocks)", () => {
    expect(hex(sha256(bytes("a".repeat(1_000_000))))).toBe(
      "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0",
    );
  });
});

describe("hmacSha256 — RFC 4231 vectors", () => {
  it("case 1", () => {
    expect(hex(hmacSha256(fromHex("0b".repeat(20)), bytes("Hi There")))).toBe(
      "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7",
    );
  });

  it("case 2 (key shorter than the block)", () => {
    expect(hex(hmacSha256(bytes("Jefe"), bytes("what do ya want for nothing?")))).toBe(
      "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
    );
  });

  it("case 3", () => {
    expect(hex(hmacSha256(fromHex("aa".repeat(20)), fromHex("dd".repeat(50))))).toBe(
      "773ea91e36800e46854db8ebd09181a72959098b3ef8c122d9635514ced565fe",
    );
  });

  it("case 4", () => {
    const key = fromHex("0102030405060708090a0b0c0d0e0f10111213141516171819");
    expect(hex(hmacSha256(key, fromHex("cd".repeat(50))))).toBe(
      "82558a389a443c0ea4cc819899f2083a85f0faa3e578f8077a2e3ff46729665b",
    );
  });

  it("case 6 (key LONGER than the block — hashed first)", () => {
    const key = fromHex("aa".repeat(131));
    const msg = bytes("Test Using Larger Than Block-Size Key - Hash Key First");
    expect(hex(hmacSha256(key, msg))).toBe(
      "60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54",
    );
  });
});

describe("prfSeed", () => {
  const key = fromHex("11".repeat(32));

  it("is a non-negative 31-bit integer (drops into the legacy seed arithmetic)", () => {
    for (const v of ["Jean Dupont", "+33612345678", ""]) {
      const s = prfSeed(key, "NAME", v, 0);
      expect(Number.isSafeInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(2 ** 31);
    }
  });

  it("is deterministic, and separates category / value / attempt", () => {
    expect(prfSeed(key, "NAME", "Jean", 0)).toBe(prfSeed(key, "NAME", "Jean", 0));
    expect(prfSeed(key, "NAME", "Jean", 0)).not.toBe(prfSeed(key, "ORG", "Jean", 0));
    expect(prfSeed(key, "NAME", "Jean", 0)).not.toBe(prfSeed(key, "NAME", "Jean", 1));
    expect(prfSeed(key, "NAME", "Jean", 0)).not.toBe(prfSeed(key, "NAME", "Jeanne", 0));
  });

  it("changes with the key (two conversations share nothing)", () => {
    expect(prfSeed(key, "NAME", "Jean", 0)).not.toBe(
      prfSeed(fromHex("22".repeat(32)), "NAME", "Jean", 0),
    );
  });
});

describe("keyFromHex", () => {
  it("accepts a 32-byte hex key", () => {
    expect(keyFromHex("ab".repeat(32))).toHaveLength(32);
  });

  it("refuses anything else rather than silently truncating", () => {
    for (const bad of [undefined, "", "ab", "zz".repeat(32), "ab".repeat(31), "ab".repeat(33)]) {
      expect(keyFromHex(bad)).toBeUndefined();
    }
  });
});
