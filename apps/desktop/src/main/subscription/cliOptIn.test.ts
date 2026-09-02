// Spawning the user's PERSONAL subscription CLI takes an explicit gesture, and the
// privileged process is where that fact is held.
//
// The renderer picks the provider for a turn, so the interface alone cannot carry the
// permission: whoever can reach the chat channels — a renderer XSS included — can ask for
// `claude-cli` as easily as for any other model. Main therefore defaults every CLI to OFF
// and refuses to build a turn environment for one that was never mirrored on, which makes
// `subscriptionTurnEnv` the single choke point every spawn path goes through.
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("electron", () => ({ app: { isPackaged: false, getPath: () => "/tmp/openmasq-test" } }));

const CLIS = ["claude", "codex", "antigravity"] as const;

describe("the subscription CLI opt-in is held in main", () => {
  let mod: typeof import("./desktop");

  beforeEach(async () => {
    vi.resetModules();
    mod = await import("./desktop");
  });

  it("defaults to off for every CLI — a fresh process spawns nothing", () => {
    for (const cli of CLIS) expect(mod.isSubscriptionCliEnabled(cli)).toBe(false);
  });

  it("refuses a turn environment for a CLI that was never enabled", () => {
    for (const cli of CLIS) expect(() => mod.subscriptionTurnEnv(cli)).toThrow();
  });

  it("enabling one CLI does not enable its siblings", () => {
    mod.setSubscriptionCliEnabled("claude", true);
    expect(mod.isSubscriptionCliEnabled("claude")).toBe(true);
    expect(mod.isSubscriptionCliEnabled("codex")).toBe(false);
    expect(() => mod.subscriptionTurnEnv("codex")).toThrow();
  });

  it("closes again when the opt-in is withdrawn", () => {
    mod.setSubscriptionCliEnabled("claude", true);
    mod.setSubscriptionCliEnabled("claude", false);
    expect(mod.isSubscriptionCliEnabled("claude")).toBe(false);
    expect(() => mod.subscriptionTurnEnv("claude")).toThrow();
  });

  it("names the setting rather than failing silently", () => {
    expect(() => mod.subscriptionTurnEnv("claude")).toThrow(/Réglages/);
  });
});
