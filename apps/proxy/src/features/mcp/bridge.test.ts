import { describe, expect, it } from "vitest";
import type { McpConnection } from "@openmasq/mcp";
import type { Masker } from "../../lib/masker";
import { createBridge } from "./bridge";
import { connectUpstream } from "./upstream";

const REAL = "Camille Roussel";
const FAKE = "Marc Charvet";
const masker: Masker = {
  async mask(text, vault) {
    if (!text.includes(REAL)) return { text, matches: [] };
    vault[FAKE] = REAL;
    return { text: text.split(REAL).join(FAKE), matches: [] };
  },
  restoreReply: (t) => t,
  restoreArgs: (t, v) => Object.entries(v).reduce((s, [f, r]) => s.split(f).join(r), t),
};

async function bridgeOver(connection: McpConnection, m: Masker = masker) {
  const upstream = await connectUpstream(
    [{ id: "crm", transport: "stdio", command: "unused", args: [], env: {} }],
    { connect: async () => connection },
  );
  return createBridge({ upstream, masker: m, policy: "allow", confirm: async () => true });
}

const session = () => ({ vault: {}, key: "k", mode: "fake" as const });

describe("bridge — a tool that throws", () => {
  it("hands the agent a MASKED message when the upstream call throws", async () => {
    const bridge = await bridgeOver({
      id: "crm",
      listTools: async () => [{ name: "find", inputSchema: { type: "object" }, serverId: "crm" }],
      callTool: async () => {
        throw new Error(`no record for ${REAL}`);
      },
      close: async () => {},
    });
    const err = await bridge.callTool("crm__find", {}, session()).catch((e: Error) => e);
    expect((err as Error).message).toBe(`no record for ${FAKE}`);
  });

  it("masks a failure before the call too (the write gate's confirmation)", async () => {
    const upstream = await connectUpstream(
      [{ id: "crm", transport: "stdio", command: "unused", args: [], env: {} }],
      {
        connect: async () => ({
          id: "crm",
          listTools: async () => [
            { name: "send_mail", inputSchema: { type: "object" }, serverId: "crm" },
          ],
          callTool: async () => ({ content: [] }),
          close: async () => {},
        }),
      },
    );
    const bridge = createBridge({
      upstream,
      masker,
      policy: "confirm",
      confirm: async () => {
        throw new Error(`terminal lost while asking about ${REAL}`);
      },
    });
    const err = (await bridge.callTool("crm__send_mail", {}, session()).catch((e) => e)) as Error;
    expect(err.message).toBe(`terminal lost while asking about ${FAKE}`);
  });

  it("withholds the message whole when the masker itself fails", async () => {
    const broken: Masker = {
      ...masker,
      mask: async () => {
        throw new Error("engine down");
      },
    };
    const bridge = await bridgeOver(
      {
        id: "crm",
        listTools: async () => [{ name: "find", inputSchema: { type: "object" }, serverId: "crm" }],
        callTool: async () => {
          throw new Error(`no record for ${REAL}`);
        },
        close: async () => {},
      },
      broken,
    );
    const err = (await bridge.callTool("crm__find", {}, session()).catch((e) => e)) as Error;
    expect(err.message).not.toContain(REAL);
  });
});

describe("bridge — the per-server policy is the one of the server that ADVERTISED the tool", () => {
  it("applies the owning server's deny, not a re-parse of the name", async () => {
    const upstream = await connectUpstream(
      [{ id: "crm-x", transport: "stdio", command: "unused", args: [], env: {} }],
      {
        connect: async () => ({
          id: "crm-x",
          listTools: async () => [{ name: "update_contact", inputSchema: { type: "object" }, serverId: "crm-x" }],
          callTool: async () => ({ content: [{ type: "text", text: "done" }] }),
          close: async () => {},
        }),
      },
    );
    const asked: string[] = [];
    const bridge = createBridge({
      upstream,
      masker,
      policy: "allow",
      confirm: async () => true,
      perServer: (id) => (asked.push(id), id === "crm-x" ? { writes: "deny" } : {}),
    });
    const out = (await bridge.callTool("crm-x__update_contact", {}, session())) as { refused?: boolean };
    expect(asked).toEqual(["crm-x"]);
    expect(out.refused).toBe(true);
  });
});
