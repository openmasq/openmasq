import { describe, expect, it } from "vitest";
import { REDACT_TIMEOUT_MAX_MS, REDACT_TIMEOUT_MIN_MS, redactTimeoutMs } from "./redactTimeout";

/** The send's detection budget follows the document: a whole contract must not hit a ceiling
 *  sized for a chat message (45 s blocked every long attachment, fail-closed for nothing). */
describe("redactTimeoutMs", () => {
  it("keeps the floor for a short message", () => {
    expect(redactTimeoutMs("")).toBe(REDACT_TIMEOUT_MIN_MS);
    expect(redactTimeoutMs("bonjour")).toBeLessThan(20_000);
  });
  it("grows past 45 s with a long document", () => {
    expect(redactTimeoutMs("x".repeat(300_000))).toBeGreaterThan(5 * 60_000);
  });
  it("still bounds a hung engine", () => {
    expect(redactTimeoutMs("x".repeat(5_000_000))).toBe(REDACT_TIMEOUT_MAX_MS);
  });
});
