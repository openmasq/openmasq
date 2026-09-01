import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "./crypto.js";

const key = randomBytes(32);

describe("at-rest crypto (AES-256-GCM)", () => {
  it("round-trips a payload", () => {
    const secret = JSON.stringify({ access_token: "ya29.upstream-google-token" });
    expect(decrypt(encrypt(secret, key), key)).toBe(secret);
  });

  it("produces ciphertext that does not contain the plaintext", () => {
    const blob = encrypt("ya29.super-secret", key);
    expect(blob).not.toContain("super-secret");
  });

  it("uses a fresh IV each time (different ciphertext for same input)", () => {
    expect(encrypt("x", key)).not.toBe(encrypt("x", key));
  });

  it("rejects a wrong key", () => {
    const blob = encrypt("secret", key);
    expect(() => decrypt(blob, randomBytes(32))).toThrow();
  });

  it("rejects tampered ciphertext (GCM auth tag)", () => {
    const blob = encrypt("secret", key);
    const buf = Buffer.from(blob, "base64");
    buf[buf.length - 1] ^= 0xff; // flip a ciphertext bit
    expect(() => decrypt(buf.toString("base64"), key)).toThrow();
  });
});
