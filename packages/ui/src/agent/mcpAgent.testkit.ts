import { vi } from "vitest";
import type { CompleteToolsResult } from "@openmasq/llm";
import type { Host } from "../host";

/** Host advertising a single WRITE tool, with a scripted first-turn tool call. */
export function writeHost() {
  const callTool = vi.fn(async () => ({ content: [{ type: "text" as const, text: "{\"ok\":true}" }] }));
  const turns: CompleteToolsResult[] = [
    {
      text: "",
      toolCalls: [{ id: "w1", name: "stripe__stripe_api_write", arguments: { stripe_api_operation_id: "PostCustomers" } }],
      stopReason: "tool_calls",
    },
    { text: "fini", toolCalls: [], stopReason: "stop" },
  ];
  const completeTools = vi.fn(async () => turns.shift() ?? { text: "", toolCalls: [], stopReason: "stop" });
  const host = {
    completeTools,
    mcp: {
      list: async () => [],
      add: async () => {},
      remove: async () => {},
      connect: async () => ({ id: "x", name: "x", url: "", connected: true, authorized: true }),
      disconnect: async () => {},
      listTools: async () => [
        { name: "stripe__stripe_api_write", description: "Execute a Stripe write", inputSchema: {}, serverId: "ipc" },
      ],
      callTool,
    },
  } as unknown as Host;
  return { host, callTool, completeTools };
}

/** Minimal fake Host: one MCP tool, a scripted two-turn completeTools, and a
 *  server that returns a real email in its tool result. */
export function fakeHost(turns: CompleteToolsResult[], toolText: string, toolName = "gmail__search") {
  const seen: { messages: { role: string; content: string }[] }[] = [];
  const completeTools = vi.fn(async (payload: { messages: { role: string; content: string }[] }) => {
    seen.push(payload);
    // Default keeps a test from crashing cryptically if the loop makes one more
    // model call than it scripted (e.g. the forced-tool retry).
    return turns.shift() ?? { text: "", toolCalls: [], stopReason: "stop" };
  });
  const callTool = vi.fn(async () => ({
    content: [{ type: "text" as const, text: toolText }],
  }));
  const host = {
    completeTools,
    mcp: {
      list: async () => [],
      add: async () => {},
      remove: async () => {},
      connect: async () => ({ id: "x", name: "x", url: "", connected: true, authorized: true }),
      disconnect: async () => {},
      listTools: async () => [
        { name: toolName, description: "", inputSchema: {}, serverId: "ipc" },
      ],
      callTool,
    },
  } as unknown as Host;
  return { host, completeTools, callTool, seen };
}
