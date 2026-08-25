import { describe, it, expect, vi } from "vitest";
import type { McpConnection, McpTool, McpToolCall, McpToolResult } from "../types";
import {
  execCallCommand,
  findExecMetaTool,
  parseExecToolInfo,
  parseExecToolNames,
  wrapExecMeta,
} from "./execMeta";

const text = (t: string): McpToolResult => ({ content: [{ type: "text", text: t }] });

// The exact `info` shape PostHog returns (from the reported journal).
const INFO_EXECUTE_SQL =
  "name: execute-sql\n" +
  "title: Execute SQL query\n" +
  "description: |-\n  Executes HogQL — PostHog's variant of SQL over ClickHouse.\n\n  Use read-data-schema first.\n" +
  "annotations:\n  destructiveHint: false\n  readOnlyHint: true\n" +
  `inputSchema: '{"type":"object","properties":{"query":{"type":"string"}},"required":["query"]}'`;

describe("parsers", () => {
  it("parseExecToolNames: JSON array AND {matches:[…]}", () => {
    expect(parseExecToolNames('["execute-sql","query-trends","read-data-schema"]')).toEqual([
      "execute-sql",
      "query-trends",
      "read-data-schema",
    ]);
    expect(parseExecToolNames('{"matches":["insight-query","query-funnel"],"truncated":true}')).toEqual([
      "insight-query",
      "query-funnel",
    ]);
    expect(parseExecToolNames("not json")).toEqual([]);
  });

  it("parseExecToolInfo: name, description, REAL schema, readOnly", () => {
    const info = parseExecToolInfo(INFO_EXECUTE_SQL, "fallback");
    expect(info.name).toBe("execute-sql");
    expect(info.description).toContain("HogQL");
    expect(info.readOnly).toBe(true);
    expect(info.inputSchema).toMatchObject({
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    });
  });

  it("parseExecToolInfo: unparseable schema → permissive passthrough (still callable)", () => {
    const info = parseExecToolInfo("name: broken\ninputSchema: 'not json'", "broken");
    expect(info.name).toBe("broken");
    expect(info.inputSchema).toEqual({ type: "object", additionalProperties: true });
  });

  it("execCallCommand: `call <tool> <json>` (and no trailing args when empty)", () => {
    expect(execCallCommand("query-trends", { kind: "events" })).toBe('call query-trends {"kind":"events"}');
    expect(execCallCommand("read-data-schema", {})).toBe("call read-data-schema");
  });
});

/** A fake exec-meta connection that mimics PostHog: ONE `exec` tool, dispatching
 *  `tools`/`info`/`call`. Records the raw calls so we can assert the translation. */
function fakeExecServer(names: string[]) {
  const calls: McpToolCall[] = [];
  const conn: McpConnection = {
    id: "posthog",
    async listTools(): Promise<McpTool[]> {
      return [
        {
          name: "exec",
          description: "CLI over PostHog tools",
          inputSchema: { type: "object", properties: { command: { type: "string" }, context: { type: "string" } }, required: ["command", "context"] },
          serverId: "posthog",
        },
      ];
    },
    async callTool(call: McpToolCall): Promise<McpToolResult> {
      calls.push(call);
      const cmd = String((call.arguments as { command?: string }).command ?? "");
      if (cmd === "tools") return text(JSON.stringify(names));
      if (cmd.startsWith("info ")) {
        const n = cmd.slice(5).trim();
        return text(`name: ${n}\ntitle: ${n}\ndescription: doc ${n}\nannotations:\n  readOnlyHint: true\ninputSchema: '{"type":"object","properties":{"q":{"type":"string"}}}'`);
      }
      if (cmd.startsWith("call ")) return text(`ran: ${cmd}`);
      return text("unknown");
    },
    close: vi.fn(async () => {}),
  };
  return { conn, calls };
}

describe("wrapExecMeta", () => {
  it("expands the sub-tools DIRECTLY (name + real schema), replacing raw exec", async () => {
    const { conn } = fakeExecServer(["execute-sql", "query-trends", "insight-query"]);
    const wrapped = wrapExecMeta(conn);
    const tools = await wrapped.listTools();
    expect(tools.map((t) => t.name)).toEqual(["execute-sql", "query-trends", "insight-query"]);
    expect(tools.every((t) => t.serverId === "posthog")).toBe(true);
    expect(tools[0].inputSchema).toMatchObject({ properties: { q: { type: "string" } } });
    expect(tools.find((t) => t.name === "exec")).toBeUndefined(); // exec no longer offered
  });

  it("a direct call is TRANSLATED to `exec call <tool> <json>`", async () => {
    const { conn, calls } = fakeExecServer(["execute-sql"]);
    const wrapped = wrapExecMeta(conn);
    await wrapped.listTools();
    calls.length = 0;
    const res = await wrapped.callTool({ name: "execute-sql", arguments: { query: "SELECT 1" } });
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe("exec");
    expect((calls[0].arguments as { command: string }).command).toBe('call execute-sql {"query":"SELECT 1"}');
    expect(res.content[0]).toMatchObject({ text: 'ran: call execute-sql {"query":"SELECT 1"}' });
  });

  it("the `include` filter + maxTools bound which sub-tools are expanded, keeping `exec` for the tail", async () => {
    const { conn } = fakeExecServer(["query-trends", "cdp-functions-create", "query-funnel", "batch-export-get"]);
    const wrapped = wrapExecMeta(conn, { include: (n) => n.startsWith("query-"), maxTools: 1 });
    const tools = await wrapped.listTools();
    // filtered + capped to 1 direct tool, PLUS the raw `exec` fallback (a tail exists).
    expect(tools.map((t) => t.name)).toEqual(["query-trends", "exec"]);
    expect(tools.find((t) => t.name === "exec")?.description).toContain("command");
  });

  it("a filtered call still routes through exec; the retained `exec` passes straight through", async () => {
    const { conn, calls } = fakeExecServer(["query-trends", "batch-export-get"]);
    const wrapped = wrapExecMeta(conn, { include: (n) => n.startsWith("query-") });
    await wrapped.listTools();
    calls.length = 0;
    // a direct sub-tool → translated
    await wrapped.callTool({ name: "query-trends", arguments: { kind: "events" } });
    expect((calls[0].arguments as { command: string }).command).toBe('call query-trends {"kind":"events"}');
    // the retained `exec` (long-tail escape hatch) is NOT translated — passes through verbatim
    calls.length = 0;
    await wrapped.callTool({ name: "exec", arguments: { command: "call batch-export-get", context: "x" } });
    expect(calls[0].name).toBe("exec");
    expect((calls[0].arguments as { command: string }).command).toBe("call batch-export-get");
  });

  it("keepExecFallback:false drops the tail hatch (full replacement of the filtered set)", async () => {
    const { conn } = fakeExecServer(["query-trends", "batch-export-get"]);
    const wrapped = wrapExecMeta(conn, { include: (n) => n.startsWith("query-"), keepExecFallback: false });
    expect((await wrapped.listTools()).map((t) => t.name)).toEqual(["query-trends"]);
  });

  it("no `exec` fallback when EVERYTHING is expanded (no tail to reach)", async () => {
    const { conn } = fakeExecServer(["query-trends", "query-funnel"]);
    const wrapped = wrapExecMeta(conn); // no include → all expanded
    const tools = await wrapped.listTools();
    expect(tools.map((t) => t.name)).toEqual(["query-trends", "query-funnel"]);
    expect(tools.find((t) => t.name === "exec")).toBeUndefined();
  });

  it("FAIL-SAFE: enumeration failure keeps the RAW connection (never breaks)", async () => {
    const { conn } = fakeExecServer([]); // `tools` returns [] → nothing to expand
    const wrapped = wrapExecMeta(conn);
    const tools = await wrapped.listTools();
    expect(tools.map((t) => t.name)).toEqual(["exec"]); // raw exec preserved
  });

  it("a NON-exec-meta server is returned unchanged", async () => {
    const plain: McpConnection = {
      id: "gmail",
      listTools: async () => [{ name: "send_email", inputSchema: { type: "object" }, serverId: "gmail" }],
      callTool: async () => text("sent"),
      close: async () => {},
    };
    const wrapped = wrapExecMeta(plain);
    expect((await wrapped.listTools()).map((t) => t.name)).toEqual(["send_email"]);
  });

  it("findExecMetaTool: only a lone `exec` with a `command` param qualifies", () => {
    expect(findExecMetaTool([{ name: "exec", inputSchema: { type: "object", properties: { command: {} } }, serverId: "x" }])).toBeTruthy();
    expect(findExecMetaTool([{ name: "exec", inputSchema: { type: "object", properties: {} }, serverId: "x" }])).toBeNull();
    expect(findExecMetaTool([{ name: "send_email", inputSchema: { type: "object" }, serverId: "x" }])).toBeNull();
  });
});
