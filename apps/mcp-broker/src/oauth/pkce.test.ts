import { describe, expect, it } from "vitest";
import { isS256, s256Challenge, verifyPkce } from "./pkce.js";

// RFC 7636 Appendix B test vector.
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

describe("PKCE", () => {
  it("computes the RFC 7636 S256 challenge", () => {
    expect(s256Challenge(VERIFIER)).toBe(CHALLENGE);
  });

  it("only accepts S256", () => {
    expect(isS256("S256")).toBe(true);
    expect(isS256("plain")).toBe(false);
    expect(isS256(undefined)).toBe(false);
  });

  it("verifies a matching verifier and rejects others", () => {
    expect(verifyPkce(VERIFIER, CHALLENGE)).toBe(true);
    expect(verifyPkce("wrong-verifier-value-padded-to-be-long-enough-xx", CHALLENGE)).toBe(false);
    expect(verifyPkce(undefined, CHALLENGE)).toBe(false);
    expect(verifyPkce("short", CHALLENGE)).toBe(false);
  });
});
