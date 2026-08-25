import { describe, expect, it, vi } from "vitest";
import { redact, pseudonymize } from "@openmasq/redact";
import { RedactingMcpClient } from "./client";
import type { McpConnection, McpTool, McpToolCall, McpToolResult, Vault } from "../types";

/** In-memory fake MCP server. Records the args it actually received. */
function fakeServer(
  id: string,
  tools: McpTool[],
  run: (call: McpToolCall) => McpToolResult,
): McpConnection & { seen: McpToolCall[] } {
  const seen: McpToolCall[] = [];
  return {
    id,
    seen,
    async listTools() {
      return tools.map((t) => ({ ...t, serverId: id }));
    },
    async callTool(call) {
      seen.push(call);
      return run(call);
    },
    async close() {},
  };
}

const gmailTools: McpTool[] = [
  {
    name: "search",
    description: "Search the mailbox",
    inputSchema: { type: "object", properties: { query: { type: "string" } } },
    serverId: "gmail",
  },
];

describe("RedactingMcpClient", () => {
  it("namespaces tools by server id", async () => {
    const gmail = fakeServer("gmail", gmailTools, () => ({ content: [] }));
    const mcp = new RedactingMcpClient({ connections: [gmail] });
    const tools = await mcp.listTools();
    expect(tools.map((t) => t.name)).toEqual(["gmail__search"]);
  });

  it("unredacts arguments before they reach the real server", async () => {
    // The vault already maps a placeholder -> the user's real address (seen on a
    // prior turn). The model only ever knew the placeholder.
    const vault: Vault = { "[REDACTED_EMAIL_1]": "alice@corp.com" };
    const gmail = fakeServer("gmail", gmailTools, () => ({ content: [] }));
    const mcp = new RedactingMcpClient({ connections: [gmail], vault });

    await mcp.callTool({
      name: "gmail__search",
      arguments: { query: "from:[REDACTED_EMAIL_1]" },
    });

    expect(gmail.seen[0]).toMatchObject({
      name: "search", // un-namespaced on the wire
      arguments: { query: "from:alice@corp.com" }, // real value restored
    });
  });

  it("redacts the tool result before the model sees it (vault grows)", async () => {
    const vault: Vault = {};
    const gmail = fakeServer("gmail", gmailTools, () => ({
      content: [{ type: "text", text: "From bob@corp.com — call +33612345678" }],
    }));
    const mcp = new RedactingMcpClient({ connections: [gmail], vault });

    const result = await mcp.callTool({ name: "gmail__search", arguments: {} });
    const text = (result.content[0] as { text: string }).text;

    expect(text).not.toContain("bob@corp.com");
    expect(text).not.toContain("+33612345678");
    // both secrets are now reversible via the shared vault
    expect(Object.values(vault)).toContain("bob@corp.com");
    expect(Object.values(vault)).toContain("+33612345678");
  });

  it("default engine produces reversible FAKES (no [REDACTED] marker) that round-trip", async () => {
    // The default redactResult is now pseudonymize → believable FAKES, NOT the
    // visible [REDACTED_…] marker (the model normalises those to a bare
    // "[REDACTED]" that unredact can't reverse → literal [REDACTED] in the reply).
    const vault: Vault = {};
    const gmail = fakeServer("gmail", gmailTools, (call) => {
      if (Object.keys(call.arguments).length === 0)
        return { content: [{ type: "text", text: "reply to carol@corp.com" }] };
      return { content: [{ type: "text", text: JSON.stringify(call.arguments) }] };
    });
    const mcp = new RedactingMcpClient({ connections: [gmail], vault });

    const first = await mcp.callTool({ name: "gmail__search", arguments: {} });
    const wire = (first.content[0] as { text: string }).text;
    expect(wire).not.toContain("carol@corp.com"); // real value hidden
    expect(wire).not.toMatch(/\[REDACTED/); // FAKE, not a visible marker

    // The fake stored in the vault (fake → original) is what's in the wire; the
    // model echoes it verbatim, and unredact maps it back on the next call.
    const placeholder = Object.keys(vault).find((k) => vault[k] === "carol@corp.com")!;
    expect(placeholder).toBeTruthy();
    expect(wire).toContain(placeholder);

    await mcp.callTool({ name: "gmail__search", arguments: { to: placeholder } });
    expect(gmail.seen[1].arguments).toEqual({ to: "carol@corp.com" });
  });

  it("strips raw file bytes when no extractor is wired (never leaks base64)", async () => {
    const gmail = fakeServer("gmail", gmailTools, () => ({
      content: [{ type: "image", data: "AAAAbob@corp.comAAAA", mimeType: "image/png" }],
    }));
    const mcp = new RedactingMcpClient({ connections: [gmail], vault: {} });
    const result = await mcp.callTool({ name: "gmail__search", arguments: {} });
    const part = result.content[0] as { type: string; data?: string; text?: string };
    // No extractFile → bytes are replaced with a safe placeholder, never passed through.
    expect(part.type).toBe("text");
    expect(part.data).toBeUndefined();
    expect(part.text).not.toContain("AAAAbob@corp.comAAAA");
  });

  it("extracts + redacts a file result so the model sees only redacted text", async () => {
    const vault: Vault = {};
    const extractFile = vi.fn(async () => "Invoice for bob@corp.com, call +33612345678");
    const gmail = fakeServer("gmail", gmailTools, () => ({
      content: [{ type: "image", data: "BASE64BYTES", mimeType: "application/pdf" }],
    }));
    const mcp = new RedactingMcpClient({ connections: [gmail], vault, extractFile });

    const result = await mcp.callTool({ name: "gmail__search", arguments: {} });
    const part = result.content[0] as { type: string; text: string };

    expect(extractFile).toHaveBeenCalledWith("BASE64BYTES", "application/pdf");
    expect(part.type).toBe("text");
    expect(part.text).not.toContain("BASE64BYTES"); // raw bytes never reach the model
    expect(part.text).not.toContain("bob@corp.com"); // extracted PII redacted
    expect(part.text).not.toContain("+33612345678");
    expect(Object.values(vault)).toContain("bob@corp.com"); // vault grew → reversible
  });

  it("extracts a `resource` blob block (Drive-style file result)", async () => {
    const extractFile = vi.fn(async () => "secret bob@corp.com");
    const gmail = fakeServer("gmail", gmailTools, () => ({
      content: [
        { type: "resource", resource: { uri: "drive://x", blob: "B64", mimeType: "application/pdf" } },
      ],
    }));
    const mcp = new RedactingMcpClient({ connections: [gmail], vault: {}, extractFile });

    const result = await mcp.callTool({ name: "gmail__search", arguments: {} });
    const part = result.content[0] as { type: string; text: string };

    expect(extractFile).toHaveBeenCalledWith("B64", "application/pdf");
    expect(part.type).toBe("text");
    expect(part.text).not.toContain("bob@corp.com");
  });

  it("supports an injected model-based redactor for results", async () => {
    const vault: Vault = {};
    const redactResult = vi.fn((text: string, v: Vault) =>
      redact(text, { vault: v, secrets: ["Acme Corp"] }).text,
    );
    const gmail = fakeServer("gmail", gmailTools, () => ({
      content: [{ type: "text", text: "Acme Corp invoice" }],
    }));
    const mcp = new RedactingMcpClient({ connections: [gmail], vault, redactResult });

    const result = await mcp.callTool({ name: "gmail__search", arguments: {} });
    expect(redactResult).toHaveBeenCalled();
    expect((result.content[0] as { text: string }).text).not.toContain("Acme Corp");
  });

  it("throws on an unknown tool name", async () => {
    const gmail = fakeServer("gmail", gmailTools, () => ({ content: [] }));
    const mcp = new RedactingMcpClient({ connections: [gmail] });
    await expect(mcp.callTool({ name: "gmail__nope", arguments: {} })).rejects.toThrow(
      /Unknown MCP tool/,
    );
  });

  it("SERIALISES concurrent result redaction (self-safe shared-vault writes)", async () => {
    // Three read-only calls fired in parallel (a turn's prefetch). Their result
    // redactions each mutate the shared vault, so they must NOT overlap — else two
    // reals could collide onto one fake / a vault entry could be lost. The client's
    // internal mutex must serialise them even for an INJECTED redactor.
    let active = 0;
    let maxActive = 0;
    const redactResult = async (text: string) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5)); // hold the critical section
      active--;
      return text;
    };
    const gmail = fakeServer("gmail", gmailTools, () => ({
      content: [{ type: "text", text: "hi" }],
    }));
    const mcp = new RedactingMcpClient({ connections: [gmail], vault: {}, redactResult });
    await Promise.all([
      mcp.callTool({ name: "gmail__search", arguments: {} }),
      mcp.callTool({ name: "gmail__search", arguments: {} }),
      mcp.callTool({ name: "gmail__search", arguments: {} }),
    ]);
    expect(maxActive).toBe(1); // never two redactions in flight at once
  });
});

describe("RedactingMcpClient tool resolution", () => {
  it("tolerates a dropped namespace (bare tool name)", async () => {
    const gmail = fakeServer("gmail", gmailTools, () => ({ content: [{ type: "text", text: "ok" }] }));
    const mcp = new RedactingMcpClient({ connections: [gmail] });
    // model called "search" instead of the advertised "gmail__search"
    const res = await mcp.callTool({ name: "search", arguments: {} });
    expect(gmail.seen[0]?.name).toBe("search"); // routed to the real (un-namespaced) name
    expect(res.content).toHaveLength(1);
  });

  it("rejects an unknown tool with the list of available tools", async () => {
    const gmail = fakeServer("gmail", gmailTools, () => ({ content: [] }));
    const mcp = new RedactingMcpClient({ connections: [gmail] });
    await expect(
      mcp.callTool({ name: "start-editing-transaction", arguments: {} }),
    ).rejects.toThrow(/Unknown MCP tool .*Available tools: gmail__search/);
  });

  // Concurrency safety for the agent loop's parallel read-only tool calls.

  it("threads the tool NAME into redactResult PER call (no shared 'current tool')", async () => {
    // A caller uses the tool name for per-connector policy; parallel calls must each see
    // their OWN name, not a shared var that races.
    const tools: McpTool[] = [
      { name: "search", description: "s", inputSchema: { type: "object" }, serverId: "gmail" },
      { name: "get", description: "g", inputSchema: { type: "object" }, serverId: "gmail" },
    ];
    const srv = fakeServer("gmail", tools, () => ({ content: [{ type: "text", text: "ok" }] }));
    const seen: string[] = [];
    const mcp = new RedactingMcpClient({
      connections: [srv],
      redactResult: (text, _vault, tool) => {
        seen.push(tool ?? "");
        return text;
      },
    });
    await Promise.all([
      mcp.callTool({ id: "1", name: "gmail__search", arguments: {} }),
      mcp.callTool({ id: "2", name: "gmail__get", arguments: {} }),
    ]);
    // Each result's redaction saw its OWN (model-facing) tool name.
    expect(seen.sort()).toEqual(["gmail__get", "gmail__search"]);
  });

  it("keeps ONE fake per real value across CONCURRENT tool-result redactions (serialised)", async () => {
    // Two results mention the SAME real value. With the redaction SERIALISED through a
    // promise chain (as the agent loop does via a mutex), the shared vault must allocate
    // ONE fake for it — used by BOTH results — even though the two calls run in parallel.
    const REAL = "julien.sabourdin@acme.io"; // regex-detectable (email) so the default engine fires
    const tools: McpTool[] = [
      { name: "a", description: "", inputSchema: { type: "object" }, serverId: "crm" },
      { name: "b", description: "", inputSchema: { type: "object" }, serverId: "crm" },
    ];
    const srv = fakeServer("crm", tools, (call) => ({
      content: [{ type: "text", text: `Contact ${REAL} via ${call.name}` }],
    }));
    const vault: Vault = {};
    let chain: Promise<unknown> = Promise.resolve();
    const mcp = new RedactingMcpClient({
      connections: [srv],
      vault,
      // Serialise the vault-mutating redaction (mirrors mcpAgent's mutex).
      redactResult: (text, v) => {
        const run = chain.then(() => pseudonymize(text, { vault: v })).then((r) => r.text);
        chain = run.catch(() => {});
        return run;
      },
    });
    const [r1, r2] = await Promise.all([
      mcp.callTool({ id: "1", name: "crm__a", arguments: {} }),
      mcp.callTool({ id: "2", name: "crm__b", arguments: {} }),
    ]);
    const fakes = Object.entries(vault)
      .filter(([, real]) => real === REAL)
      .map(([fake]) => fake);
    expect(fakes).toHaveLength(1); // atomic identity: exactly one fake for the person
    const t1 = (r1.content[0] as { text: string }).text;
    const t2 = (r2.content[0] as { text: string }).text;
    expect(t1).toContain(fakes[0]); // both results carry the SAME fake
    expect(t2).toContain(fakes[0]);
    expect(t1).not.toContain(REAL); // and neither leaks the real value
    expect(t2).not.toContain(REAL);
  });
});

describe("per-call redactText override (browser clear-mode)", () => {
  it("uses the override for THAT call only; other calls keep the fail-closed default", async () => {
    const srv = fakeServer(
      "browser",
      [
        {
          name: "browser_navigate",
          description: "Open a page",
          inputSchema: { type: "object", properties: { url: { type: "string" } } },
          serverId: "browser",
        },
      ],
      () => ({ content: [{ type: "text", text: "Titulaires : Jean Rebour, Madrid" }] }),
    );
    const full = vi.fn(async (text: string) => `[REDACTED] ${text.length} car.`);
    const replay = vi.fn(async (text: string) => text); // clear-mode: pass-through
    const mcp = new RedactingMcpClient({ connections: [srv], redactResult: full });

    const clear = await mcp.callTool(
      { id: "1", name: "browser__browser_navigate", arguments: { url: "https://news.example" } },
      { redactText: replay },
    );
    expect((clear.content[0] as { text: string }).text).toBe("Titulaires : Jean Rebour, Madrid");
    expect(replay).toHaveBeenCalledTimes(1);
    expect(full).not.toHaveBeenCalled();

    // Same client, NO override: the full fail-closed redactor is back.
    const redacted = await mcp.callTool({
      id: "2",
      name: "browser__browser_navigate",
      arguments: { url: "https://news.example" },
    });
    expect((redacted.content[0] as { text: string }).text).toMatch(/^\[REDACTED\]/);
    expect(full).toHaveBeenCalledTimes(1);
  });

  it("the override never touches the ARG leg: un-redaction stays unconditional", async () => {
    const vault: Vault = { "Louis Terral": "Adam Berthon" };
    const srv = fakeServer(
      "browser",
      [
        {
          name: "browser_navigate",
          description: "Open a page",
          inputSchema: { type: "object", properties: { url: { type: "string" } } },
          serverId: "browser",
        },
      ],
      () => ({ content: [] }),
    );
    const mcp = new RedactingMcpClient({ connections: [srv], vault });
    await mcp.callTool(
      { id: "1", name: "browser__browser_navigate", arguments: { url: "https://g.example/?q=Louis+Terral" } },
      { redactText: async (t) => t },
    );
    expect(srv.seen[0].arguments).toEqual({ url: "https://g.example/?q=Adam+Berthon" });
  });
});
