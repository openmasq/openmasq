import { describe, expect, it } from "vitest";
import { describePolicy, overridesMasking, parseMcpPolicy } from "./policy";

describe("the per-server policy of proxy.json", () => {
  it("reads source, level, disable, keep and writes per server id", () => {
    expect(
      parseMcpPolicy({
        notion: { source: "openmasq", level: "strict", writes: "deny" },
        github: { source: "client", level: "standard", disable: ["email"], keep: ["Octocat"] },
        filesystem: { source: "off" },
      }),
    ).toEqual({
      notion: { source: "openmasq", level: "strict", writes: "deny" },
      github: { source: "client", level: "standard", disable: ["email"], keep: ["Octocat"] },
      filesystem: { source: "off" },
    });
  });

  it("refuses rather than ignores: a bad side, a bad level, a misspelt key, a non-object entry", () => {
    expect(() => parseMcpPolicy({ notion: { source: "mine" } })).toThrow(
      /mcp.notion.source is openmasq, client or off, not "mine"/,
    );
    expect(() => parseMcpPolicy({ notion: { level: "strcit" } })).toThrow(
      /standard, renforce or strict/,
    );
    expect(() => parseMcpPolicy({ notion: { write: "deny" } })).toThrow(
      /mcp.notion: unknown key "write" — did you mean "writes"/,
    );
    expect(() => parseMcpPolicy({ notion: { disable: "email" } })).toThrow(/array of strings/);
    expect(() => parseMcpPolicy({ notion: true })).toThrow(/mcp.notion must be an object/);
  });

  it("knows which entries shape a masker of their own, and describes one for the card", () => {
    expect(overridesMasking({ writes: "deny" })).toBe(false);
    expect(overridesMasking({ level: "strict" })).toBe(true);
    expect(overridesMasking({ disable: ["email"] })).toBe(true);
    expect(describePolicy({ source: "openmasq", level: "strict", writes: "deny" })).toBe(
      "strict · writes deny · ours",
    );
    expect(describePolicy({ source: "client" })).toBe("the client's");
    expect(describePolicy({})).toBe("");
  });
});
