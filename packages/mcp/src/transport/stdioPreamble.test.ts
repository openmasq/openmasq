import { describe, it, expect } from "vitest";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { withPreamble } from "./stdio";

describe("withPreamble — the first line on the child's stdin precedes initialize", () => {
  it("sends the preamble right after start, then forwards everything to the inner transport", async () => {
    const sent: JSONRPCMessage[] = [];
    const inner = {
      started: false,
      onmessage: undefined as unknown,
      async start() { this.started = true; },
      async send(m: JSONRPCMessage) { sent.push(m); },
      async close() {},
    };
    const pre: JSONRPCMessage = { jsonrpc: "2.0", method: "x/pre", params: { a: 1 } };
    const t = withPreamble(inner as unknown as Transport, pre);
    const onmsg = () => {};
    t.onmessage = onmsg;
    await t.start();
    await t.send({ jsonrpc: "2.0", id: 0, method: "initialize" });
    expect(inner.started).toBe(true);
    expect(inner.onmessage).toBe(onmsg);
    expect(sent.map((m) => ("method" in m ? m.method : ""))).toEqual(["x/pre", "initialize"]);
  });
});
