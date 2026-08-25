import { describe, expect, it } from "vitest";
import { isConnectorAllowed, isModelAllowed } from "./orgAllowList";

describe("isConnectorAllowed", () => {
  it("permits everything when there is no organisation (undefined)", () => {
    expect(isConnectorAllowed("gmail", undefined)).toBe(true);
  });

  it("permits NOTHING on a managed account whose org opened nothing (empty list)", () => {
    // La distinction qui fait la règle 7 : `[]` ≠ `undefined`.
    expect(isConnectorAllowed("gmail", [])).toBe(false);
  });

  it("matches a live server id through its broker/local prefix", () => {
    expect(isConnectorAllowed("broker-gmail", ["gmail"])).toBe(true);
    expect(isConnectorAllowed("local-filesystem", ["filesystem"])).toBe(true);
  });

  it("matches a multi-account instance id back to its connector", () => {
    // La divergence historique : les réglages ignoraient ce cas, donc un connecteur
    // refusé se déverrouillait dès qu'il portait un second compte.
    expect(isConnectorAllowed("gmail--a1b2", ["gmail"])).toBe(true);
    expect(isConnectorAllowed("broker-gmail--a1b2", ["gmail"])).toBe(true);
  });

  it("refuses a connector the org never opened, even a well-formed one", () => {
    expect(isConnectorAllowed("notion", ["gmail", "linear"])).toBe(false);
  });

  it("refuses an unknown/absent id rather than defaulting open", () => {
    expect(isConnectorAllowed(undefined, ["gmail"])).toBe(false);
  });
});

describe("isModelAllowed", () => {
  it("permits everything with no organisation, nothing with an empty allow-list", () => {
    expect(isModelAllowed("gpt-5.5", undefined)).toBe(true);
    expect(isModelAllowed("gpt-5.5", [])).toBe(false);
  });

  it("permits only what the org opened", () => {
    expect(isModelAllowed("gpt-5.5", ["gpt-5.5"])).toBe(true);
    expect(isModelAllowed("claude-fable-5", ["gpt-5.5"])).toBe(false);
  });
});
