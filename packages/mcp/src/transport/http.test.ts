import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Regression: the OAuth two-phase flow is connect() → finishAuth(code) →
 * connect(). A StreamableHTTPClientTransport can be start()-ed only once (and
 * Client.connect() auto-calls start()), so the post-auth reconnect MUST run on a
 * fresh transport — otherwise the SDK throws
 * "StreamableHTTPClientTransport already started!". We mock the SDK to assert the
 * second connect() never reuses an already-started transport.
 */

const h = vi.hoisted(() => {
  class FakeUnauthorized extends Error {}
  const transports: FakeTransport[] = [];
  const connectCalls: FakeTransport[] = [];
  // first connect needs auth, every later connect succeeds
  const state = { needAuthOnce: true };

  class FakeTransport {
    started = false;
    finishAuth = vi.fn(async (_code: string) => {});
    constructor(
      public url: URL,
      public opts: unknown,
    ) {
      transports.push(this);
    }
    async start() {
      if (this.started) {
        throw new Error("StreamableHTTPClientTransport already started!");
      }
      this.started = true;
    }
    async close() {}
  }

  class FakeClient {
    constructor(public info: unknown) {}
    async connect(transport: FakeTransport) {
      connectCalls.push(transport);
      await transport.start(); // the SDK starts the transport inside connect()
      if (state.needAuthOnce) {
        state.needAuthOnce = false;
        throw new FakeUnauthorized("auth required");
      }
    }
    async close() {}
  }

  return { FakeUnauthorized, FakeTransport, FakeClient, transports, connectCalls, state };
});

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({ Client: h.FakeClient }));
vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
  StreamableHTTPClientTransport: h.FakeTransport,
}));
vi.mock("@modelcontextprotocol/sdk/client/auth.js", () => ({
  UnauthorizedError: h.FakeUnauthorized,
}));

import { HttpMcpServer } from "./http";

describe("HttpMcpServer OAuth reconnect", () => {
  beforeEach(() => {
    h.transports.length = 0;
    h.connectCalls.length = 0;
    h.state.needAuthOnce = true;
  });

  it("uses a fresh transport for the post-auth reconnect", async () => {
    const server = new HttpMcpServer({ id: "notion", url: "https://mcp.notion.com/mcp" });

    const first = await server.connect();
    expect(first).toEqual({ authorized: false });

    await server.finishAuth("auth-code");
    // finishAuth exchanges the code on the started transport…
    expect(h.transports[0].finishAuth).toHaveBeenCalledWith("auth-code");

    const second = await server.connect();
    expect(second).toEqual({ authorized: true });

    // …then the reconnect must run on a DIFFERENT, not-yet-started transport.
    expect(h.connectCalls).toHaveLength(2);
    expect(h.connectCalls[1]).not.toBe(h.connectCalls[0]);
  });

  it("would throw 'already started' if the transport were reused (guards the fix)", async () => {
    // Sanity: prove the fake reproduces the real SDK invariant.
    const t = new h.FakeTransport(new URL("https://x/mcp"), undefined);
    await t.start();
    await expect(t.start()).rejects.toThrow(/already started/);
  });
});
