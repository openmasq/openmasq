import { describe, it, expect, vi, afterEach } from "vitest";
import { createSink, scrubMessage } from "@openmasq/analytics";

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("scrubMessage", () => {
  it("removes PII-ish substrings from an error message", () => {
    const out = scrubMessage(
      "send failed for user@corp.com token sk_abcdefghijklmnopqrstuvwx id 1234567 at /Users/julien/secret/file",
    );
    expect(out).not.toContain("user@corp.com");
    expect(out).not.toContain("sk_abcdefghijklmnopqrstuvwx");
    expect(out).not.toContain("1234567");
    expect(out).not.toContain("/Users/julien/secret");
    expect(out).toContain("‹email›");
  });
  it("truncates to a bounded length", () => {
    expect(scrubMessage("x".repeat(1000)).length).toBeLessThanOrEqual(200);
  });
});

describe("captureError → $exception channel", () => {
  afterEach(() => vi.unstubAllGlobals());

  function wire(consent = true) {
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) => ({ ok: true }));
    vi.stubGlobal("fetch", fetchFn);
    vi.stubGlobal("navigator", {}); // no Do-Not-Track / GPC
    const s = createSink({ getAnonId: () => "anon-x", defaultSource: "test" });
    s.configureAnalytics({ key: "phc_test", apiHost: "https://eu.i.posthog.com" });
    s.setAnalyticsConsent(consent);
    return { s, fetchFn };
  }

  it("posts an anonymised, bounded $exception with a scrubbed message", async () => {
    const { s, fetchFn } = wire();
    s.captureError({ scope: "redaction", code: "bug1", name: "TypeError", status: 0, message: "Cannot read x of undefined a@b.com" });
    await flush();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchFn.mock.calls[0][1] as RequestInit).body as string);
    expect(body.event).toBe("$exception");
    expect(body.properties.scope).toBe("redaction");
    expect(body.properties.$exception_list[0].type).toBe("TypeError");
    expect(body.properties.$exception_list[0].value).not.toContain("a@b.com");
  });

  it("is gated by consent (no send when off)", async () => {
    const { s, fetchFn } = wire(false);
    s.captureError({ scope: "auth", code: "magic-link" });
    await flush();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("DROPS transient/operational failures (offline fetch, token refresh)", async () => {
    const { s, fetchFn } = wire();
    s.captureError({ scope: "network", code: "op1", name: "TypeError", message: "Failed to fetch" });
    s.captureError({ scope: "auth", code: "op2", name: "AuthRetryableFetchError", message: "Failed to fetch" });
    s.captureError({ scope: "auth", code: "op3", name: "InvalidGrantError", message: "Invalid refresh token" });
    await flush();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("DROPS MCP transport-lifecycle churn (a dead connector's SSE drop, not a code bug)", async () => {
    // These two were ~87% of all $exception volume, drowning real bugs. The condition is
    // already surfaced by the reconnect banner + teardown — the bug channel must stay clean.
    const { s, fetchFn } = wire();
    s.captureError({ scope: "mcp", code: "list-tools", name: "Error", message: "Not connected" });
    s.captureError({ scope: "mcp", code: "list-tools", name: "McpError", message: "MCP error -32000: Connection closed" });
    s.captureError({ scope: "mcp", code: "reconnect", name: "McpError", message: "MCP error -32000: Connection closed" });
    await flush();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("KEEPS a genuine MCP packaging regression (a DIFFERENT message still reports)", async () => {
    // The message-specific drop must not swallow a real bundling failure — those look
    // like a spawn/module error, never the two transport strings.
    const { s, fetchFn } = wire();
    s.captureError({ scope: "mcp", code: "reconnect", name: "Error", message: "spawn npx ENOENT" });
    await flush();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("KEEPS a FATAL (uncaught) error even if its message looks operational", async () => {
    const { s, fetchFn } = wire();
    s.captureError({ scope: "uncaught", code: "crash1", name: "TypeError", fatal: true, message: "Failed to fetch" });
    await flush();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("DROPS an auth rejection (401/403) — signed-out/expired sync poll, not a bug", async () => {
    const { s, fetchFn } = wire();
    // The exact shape the sync HTTP layer throws (message form, no structured status).
    s.captureError({ scope: "sync", code: "listVaults", name: "Error", message: "[sync] GET /sync/vaults → 401" });
    s.captureError({ scope: "sync", code: "pushConv", name: "Error", message: "[sync] POST /sync/vaults/abc → 403" });
    // And the structured-status form, for callers that populate it.
    s.captureError({ scope: "sync", code: "getOrgProfile", status: 401 });
    await flush();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("KEEPS a FATAL 401 (an uncaught auth reject is still a real crash)", async () => {
    const { s, fetchFn } = wire();
    s.captureError({ scope: "uncaught", code: "crash401", status: 401, fatal: true, message: "→ 401" });
    await flush();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("does NOT mistake a 401X id or latency for an auth reject (needs the → arrow)", async () => {
    const { s, fetchFn } = wire();
    s.captureError({ scope: "inference", code: "real-bug", name: "TypeError", message: "took 4013ms; item 401 failed" });
    await flush();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("FLOOD-caps a repeating error signature (a retry loop can't spam)", async () => {
    const { s, fetchFn } = wire();
    // A non-operational signature (an operational one would be DROPPED before the cap).
    for (let i = 0; i < 8; i++) s.captureError({ scope: "render", code: "loop1", name: "TypeError", message: "x is not a function" });
    await flush();
    expect(fetchFn).toHaveBeenCalledTimes(5); // MAX_PER_SIGNATURE
  });
});
