import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CompleteToolsResult } from "@openmasq/llm";
import type { Host } from "../host";
import { runMcpAgentLoop } from "./mcpAgent";

const { captureEvent } = vi.hoisted(() => ({ captureEvent: vi.fn() }));
vi.mock("../analytics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../analytics")>()),
  captureEvent,
}));

/** Every rescue that adds tools after routing is reported: the sum of `tool_route_rescue.tools`
 *  is what turns `tool_route_miss { offered: 0 }` into the summary's `routerOffered`. */
describe("tool_route_rescue — one event per rescued connector, tagged by rescue", () => {
  function host(turns: CompleteToolsResult[]) {
    const completeTools = vi.fn(async () => turns.shift() ?? { text: "ok", toolCalls: [], stopReason: "stop" });
    const listTools = async () =>
      Array.from({ length: 30 }, (_, i) => ({
        name: `webflow__t${i}`,
        description: `Outil webflow numéro ${i}`,
        inputSchema: { type: "object", properties: {} },
        serverId: "webflow",
      }));
    return {
      completeTools,
      mcp: { list: async () => [], listTools, callTool: vi.fn() },
    } as unknown as Host;
  }
  const emptyPick: CompleteToolsResult = {
    text: "",
    toolCalls: [{ id: "r", name: "select_tools", arguments: { tool_names: [] } }],
    stopReason: "tool_calls",
  };
  const run = (content: string, scopedConnectors?: string[]) =>
    runMcpAgentLoop({
      host: host([emptyPick, { text: "voici", toolCalls: [], stopReason: "stop" }]),
      provider: "openai",
      modelId: "gpt-4o",
      apiKey: "sk",
      vault: {},
      secrets: [],
      disabledKinds: [],
      fromWire: (s: string) => s,
      onText: () => {},
      onToolCall: () => {},
      history: [{ role: "user", content }],
      scopedConnectors,
    });
  const events = (name: string) =>
    captureEvent.mock.calls.map(([e]) => e as Record<string, unknown>).filter((e) => e.name === name);

  beforeEach(() => captureEvent.mockReset());

  it("a workflow's declared connector → via: scoped, and the miss + rescue add up to routerOffered", async () => {
    await run("prépare ma journée", ["webflow"]);
    expect(events("tool_route_miss")).toMatchObject([{ kind: "empty", offered: 0 }]);
    expect(events("tool_route_rescue")).toMatchObject([{ via: "scoped", connector: "webflow", tools: 30 }]);
    expect(events("tool_loop_summary")[0]?.routerOffered).toBe(30);
  });

  it("a connector the user named on an empty pick → via: named", async () => {
    await run("liste mes pages webflow");
    expect(events("tool_route_rescue")).toMatchObject([{ via: "named", connector: "webflow", tools: 30 }]);
  });

  it("no rescue → no event", async () => {
    await run("compare mes tickets du trimestre");
    expect(events("tool_route_rescue")).toEqual([]);
  });
});
