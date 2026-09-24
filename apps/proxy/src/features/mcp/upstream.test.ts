import { describe, expect, it } from "vitest";
import type { McpConnection } from "@openmasq/mcp";
import type { ServerSpec } from "./servers";
import { connectUpstream } from "./upstream";

const spec = (id: string, extra: Record<string, string> = {}): ServerSpec => ({
  id,
  transport: "stdio",
  command: id,
  args: [],
  env: extra,
});

/** A connection factory that counts what it opened and closed, per id. */
const factory = () => {
  const opened: string[] = [];
  const closed: string[] = [];
  const connect = async (s: ServerSpec): Promise<McpConnection> => {
    opened.push(s.id);
    return {
      id: s.id,
      listTools: async () => [{ name: "t", inputSchema: {}, serverId: s.id }],
      callTool: async () => ({ content: [] }),
      close: async () => void closed.push(s.id),
    };
  };
  return { opened, closed, connect };
};

describe("upstream.apply — reconnect only what moved", () => {
  it("connects a new id, closes a gone one, and leaves an unchanged one alone", async () => {
    const f = factory();
    const up = await connectUpstream([spec("notion"), spec("crm")], { connect: f.connect });
    expect(f.opened).toEqual(["notion", "crm"]);
    const moved = await up.apply([spec("crm"), spec("github")]);
    expect(moved.sort()).toEqual(["github", "notion"]);
    expect(f.closed).toEqual(["notion"]);
    expect(f.opened).toEqual(["notion", "crm", "github"]); // crm was not touched
    expect(
      up
        .connections()
        .map((c) => c.id)
        .sort(),
    ).toEqual(["crm", "github"]);
    const names = (await up.tools()).map((t) => t.name).sort();
    expect(names).toEqual(["crm__t", "github__t"]);
  });

  it("reconnects an id named as changed — a login, an edited entry — and reports it", async () => {
    const f = factory();
    const down: string[] = [];
    const up = await connectUpstream([spec("notion")], {
      connect: f.connect,
      onDown: (id, why) => down.push(`${id}: ${why}`),
    });
    expect(await up.apply([spec("notion", { T: "new" })], new Set(["notion"]))).toEqual(["notion"]);
    expect(f.closed).toEqual(["notion"]);
    expect(f.opened).toEqual(["notion", "notion"]);
    expect(down).toEqual([]); // a reconnect is not a loss
    // …and a server gone from the list is said to be gone.
    await up.apply([]);
    expect(down).toEqual(["notion: no longer declared"]);
  });

  it("retries a server that failed at start-up only when its entry or credentials changed", async () => {
    let fail = true;
    const f = factory();
    const connect = async (s: ServerSpec) => {
      if (s.id === "notion" && fail) throw new Error("401 unauthorized");
      return f.connect(s);
    };
    const up = await connectUpstream([spec("notion")], { connect });
    expect(up.connections()).toEqual([]);
    // Nothing changed: not retried (a failing server is not hammered on every reload).
    expect(await up.apply([spec("notion")])).toEqual([]);
    // The user signed in: named as changed, connected now.
    fail = false;
    expect(await up.apply([spec("notion")], new Set(["notion"]))).toEqual(["notion"]);
    expect(up.connections().map((c) => c.id)).toEqual(["notion"]);
  });
});
