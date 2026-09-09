import { afterEach, describe, expect, it } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { McpConnection, McpToolCall } from "@openmasq/mcp";
import { createApp } from "../../app";
import { DEFAULTS, type WritePolicy } from "../../config/config";
import { silentReporter } from "../../lib/ui";
import type { Masker } from "../../lib/masker";
import { createBridge } from "./bridge";
import { connectUpstream } from "./upstream";

// The same one-name masker `app.test.ts` uses: the engine is tested in `@openmasq/redact`,
// what is pinned here is the BOUNDARY — what the agent gets, what the server gets.
const REAL = "Camille Roussel";
const FAKE = "Marc Charvet";
const masker: Masker = {
  async mask(text, vault) {
    if (!text.includes(REAL)) return { text, matches: [] };
    vault[FAKE] = REAL;
    return {
      text: text.split(REAL).join(FAKE),
      matches: [{ type: "name", value: REAL, placeholder: FAKE, category: "name" } as never],
    };
  },
  restoreReply: (t, v) => Object.entries(v).reduce((s, [f, r]) => s.split(f).join(r), t),
  restoreArgs: (t, v) => Object.entries(v).reduce((s, [f, r]) => s.split(f).join(r), t),
};

/** The real MCP server, standing in for Gmail: it answers with a REAL value and records the
 *  arguments it was given, which is how we check the outward leg was un-redacted. */
function fakeCrm(): { connection: McpConnection; calls: McpToolCall[] } {
  const calls: McpToolCall[] = [];
  return {
    calls,
    connection: {
      id: "crm",
      listTools: async () => [
        {
          name: "search_clients",
          description: "Search the client book",
          inputSchema: { type: "object", properties: { q: { type: "string" } } },
          serverId: "crm",
        },
        { name: "send_invoice", inputSchema: { type: "object" }, serverId: "crm" },
      ],
      callTool: async (call) => {
        calls.push(call);
        return { content: [{ type: "text", text: `Dossier ouvert par ${REAL}, 2 factures.` }] };
      },
      close: async () => {},
    },
  };
}

interface Booted {
  url: string;
  calls: McpToolCall[];
  upstreamBodies: string[];
  close: () => Promise<void>;
}

async function boot(policy: WritePolicy, confirmAnswer = false): Promise<Booted> {
  const crm = fakeCrm();
  const upstream = await connectUpstream(
    [{ id: "crm", transport: "stdio", command: "unused", args: [], env: {} }],
    { connect: async () => crm.connection },
  );

  // A stand-in for the model provider, so one test can watch BOTH channels of the vault.
  const upstreamBodies: string[] = [];
  const model = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      upstreamBodies.push(body);
      res.writeHead(200, { "content-type": "application/json" }).end(
        JSON.stringify({
          choices: [{ index: 0, message: { role: "assistant", content: "ok" } }],
        }),
      );
    });
  });
  await new Promise<void>((r) => model.listen(0, "127.0.0.1", r));
  const origin = `http://127.0.0.1:${(model.address() as AddressInfo).port}`;

  const app = createApp({
    config: { ...DEFAULTS, openai: origin, rulesOnly: true, mcp: true, mcpWrites: policy },
    masker,
    reporter: silentReporter,
    mcp: {
      bridge: createBridge({
        upstream,
        masker,
        policy,
        confirm: async () => confirmAnswer,
      }),
      version: "test",
    },
  });
  const proxy: HttpServer = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => proxy.once("listening", () => r()));
  const url = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
  return {
    url,
    calls: crm.calls,
    upstreamBodies,
    close: async () => {
      await upstream.close();
      // A failed assertion can leave the agent's SSE stream open; `close()` alone would
      // then wait for it forever and the failure would read as a timeout.
      proxy.closeAllConnections?.();
      await new Promise<void>((r) => proxy.close(() => r()));
      await new Promise<void>((r) => model.close(() => r()));
    },
  };
}

async function agent(url: string): Promise<Client> {
  const client = new Client({ name: "test-agent", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${url}/mcp`)));
  return client;
}

let booted: Booted | undefined;
afterEach(async () => {
  await booted?.close();
  booted = undefined;
});

describe("/mcp — the integrations, masked", () => {
  it("advertises the upstream tools, namespaced, with their schema untouched", async () => {
    booted = await boot("confirm");
    const client = await agent(booted.url);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(["crm__search_clients", "crm__send_invoice"]);
    expect(tools[0].inputSchema).toEqual({ type: "object", properties: { q: { type: "string" } } });
    await client.close();
  });

  it("gives the agent a FAKE, then takes that fake back as the REAL value", async () => {
    booted = await boot("confirm");
    const client = await agent(booted.url);

    // 1. The result comes back masked: this is the only name the agent ever learns.
    const first = await client.callTool({
      name: "crm__search_clients",
      arguments: { q: "dossier" },
    });
    const text = JSON.stringify(first.content);
    expect(text).toContain(FAKE);
    expect(text).not.toContain(REAL);

    // 2. The agent follows up on what it read. The outward leg restores it, because a
    //    search for a substitute finds nobody (rule 11).
    await client.callTool({ name: "crm__search_clients", arguments: { q: FAKE } });
    expect(booted.calls.at(-1)?.arguments).toEqual({ q: REAL });
    await client.close();
  });

  it("shares ONE vault with the model calls, so the fake means the same thing on both", async () => {
    booted = await boot("confirm");
    const client = await agent(booted.url);
    await client.callTool({ name: "crm__search_clients", arguments: { q: "x" } });
    await client.close();

    // The agent now writes back what the tool told it. The chat channel must restore the
    // fake it never minted itself — that only works if both channels share the vault.
    await fetch(`${booted.url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "user", content: `Relance ${FAKE}` }],
      }),
    });
    expect(booted.upstreamBodies.at(-1)).toContain(FAKE);
    expect(booted.upstreamBodies.at(-1)).not.toContain(REAL);
  });

  it("refuses a write under --mcp-writes deny, and never reaches the server", async () => {
    booted = await boot("deny");
    const client = await agent(booted.url);
    const result = await client.callTool({ name: "crm__send_invoice", arguments: {} });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toMatch(/Refused/);
    expect(booted.calls).toHaveLength(0);
    await client.close();
  });

  it("refuses a write nobody approved — and says so where the agent can read it", async () => {
    booted = await boot("confirm", false);
    const client = await agent(booted.url);
    const result = await client.callTool({ name: "crm__send_invoice", arguments: {} });
    expect(result.isError).toBe(true);
    expect(booted.calls).toHaveLength(0);
    await client.close();
  });

  it("runs the write once it is approved", async () => {
    booted = await boot("confirm", true);
    const client = await agent(booted.url);
    const result = await client.callTool({ name: "crm__send_invoice", arguments: {} });
    expect(result.isError).toBeFalsy();
    expect(booted.calls).toHaveLength(1);
    await client.close();
  });
});
