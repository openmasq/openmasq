import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * REGRESSION — the STDIO half had no `onClose`.
 *
 * The remote side (`http.ts`) had long signaled the unexpected death of its transport,
 * and the owner would evict the connector. `connectStdio` didn't have that hook: a
 * child that dies stayed "connected" forever, and the caller kept
 * talking to it. This is what produced 848 "Error: Not connected" on Sentry over eight days
 * for a single vanished `@playwright/mcp` (the agent browser's stdio child).
 *
 * The two-phase contract, pinned here: an UNEXPECTED death warns, a DELIBERATE
 * closure stays silent — otherwise `close()` would trigger the reconnection we just canceled.
 */

const h = vi.hoisted(() => {
  class FakeTransport {
    constructor(public opts: unknown) {}
    async start() {}
    async close() {}
  }
  class FakeClient {
    onclose?: () => void;
    closed = 0;
    constructor(public info: unknown) {
      h.clients.push(this as never);
    }
    async connect(_t: FakeTransport) {}
    async close() {
      this.closed += 1;
      // The SDK notifies the closing of the transport, ours included: that's
      // exactly why the `closing` flag exists.
      this.onclose?.();
    }
  }
  return { FakeTransport, FakeClient, clients: [] as { onclose?: () => void; close: () => Promise<void> }[] };
});

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({ Client: h.FakeClient }));
vi.mock("@modelcontextprotocol/sdk/client/stdio.js", () => ({ StdioClientTransport: h.FakeTransport }));

import { connectStdio } from "./stdio";

describe("connectStdio — la mort de l'enfant se signale", () => {
  beforeEach(() => {
    h.clients.length = 0;
  });

  it("appelle `onClose` avec l'id quand le transport tombe tout seul", async () => {
    const closed: string[] = [];
    await connectStdio({ id: "pw", command: "node", onClose: (id) => closed.push(id) });
    // The SDK signals the fall (the child exited / crashed).
    h.clients[0].onclose?.();
    expect(closed).toEqual(["pw"]);
  });

  it("NE l'appelle PAS pour notre propre `close()` — une fermeture voulue n'est pas une panne", async () => {
    const closed: string[] = [];
    const conn = await connectStdio({ id: "fs", command: "node", onClose: (id) => closed.push(id) });
    await conn.close();
    expect(closed).toEqual([]);
  });

  it("le crochet est posé AVANT `connect` — un enfant mort-né compte aussi", async () => {
    // If it were set afterward, a death occurring during startup would go unnoticed,
    // and that's precisely the case of a missing binary.
    const closed: string[] = [];
    await connectStdio({ id: "x", command: "node", onClose: (id) => closed.push(id) });
    expect(h.clients[0].onclose).toBeTypeOf("function");
    h.clients[0].onclose?.();
    expect(closed).toEqual(["x"]);
  });

  it("sans `onClose`, rien ne casse — le champ est optionnel", async () => {
    await connectStdio({ id: "y", command: "node" });
    expect(() => h.clients[0].onclose?.()).not.toThrow();
  });
});
