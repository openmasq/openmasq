import { describe, expect, it } from "vitest";
import { browserConnStale, isRecoverableBrowserError } from "./server/browserHeal";

// In vitest.config.ts `include` as `main/mcp/*.test.ts` — a `server/` sibling would
// silently not run (see apps/desktop/CLAUDE.md), hence the test lives one level up.

describe("browserConnStale — the browser connector self-heal trigger", () => {
  const EP1 = "http://127.0.0.1:60001/secret1";
  const EP2 = "http://127.0.0.1:60002/secret2";

  it("healthy: child running on the endpoint pwmcp was spawned against", () => {
    expect(browserConnStale(true, EP1, EP1)).toBe(false);
  });

  it("stale: the agent-browser child is gone (window close → stopAgentBrowser)", () => {
    expect(browserConnStale(false, null, EP1)).toBe(true);
    expect(browserConnStale(false, EP1, EP1)).toBe(true); // dead child, whatever the endpoint says
  });

  it("stale: the child was RESPAWNED — new endpoint + broker secret under a live pwmcp", () => {
    expect(browserConnStale(true, EP2, EP1)).toBe(true);
  });

  it("stale: pwmcp connected before any endpoint was recorded (defensive)", () => {
    expect(browserConnStale(true, EP1, null)).toBe(true);
    expect(browserConnStale(true, null, EP1)).toBe(true);
  });
});

describe("isRecoverableBrowserError — reconnect-and-retry a LIVE-but-broken pwmcp", () => {
  it("recovers the zero-tab createTarget race (the reported error)", () => {
    expect(
      isRecoverableBrowserError("browserBackend.callTool: Protocol error (Target.createTarget): Not supported"),
    ).toBe(true);
  });

  it("recovers a lost/closed page (pwmcp still pointed at a gone target)", () => {
    expect(isRecoverableBrowserError("Target page, context or browser has been closed")).toBe(true);
    expect(isRecoverableBrowserError("Error: Target closed")).toBe(true);
    expect(isRecoverableBrowserError("Session closed. Most likely the page has been closed.")).toBe(true);
  });

  it("does NOT reconnect on a genuine tool error (a reconnect would only repeat it)", () => {
    expect(isRecoverableBrowserError("Navigation bloquée (adresse interne/privée) : http://169.254.169.254/")).toBe(false);
    expect(isRecoverableBrowserError("strict mode violation: locator('table') resolved to 3 elements")).toBe(false);
    expect(isRecoverableBrowserError("net::ERR_NAME_NOT_RESOLVED")).toBe(false);
    expect(isRecoverableBrowserError("Timeout 30000ms exceeded")).toBe(false);
  });
});
