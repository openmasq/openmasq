import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CompleteToolsResult } from "@openmasq/llm";
import type { Host } from "../host";
import { runMcpAgentLoop } from "./mcpAgent";

const { captureEvent } = vi.hoisted(() => ({ captureEvent: vi.fn() }));
vi.mock("../analytics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../analytics")>()),
  captureEvent,
}));

/** `tool_loop_summary.routerMs` times the router MODEL call only, so the cost of routing can
 *  be read apart from the answer. No call ⇒ no field (never a misleading 0). */
describe("tool_loop_summary — routerMs", () => {
  function host(nTools: number, turns: CompleteToolsResult[]) {
    const completeTools = vi.fn(
      async () => turns.shift() ?? { text: "ok", toolCalls: [], stopReason: "stop" },
    );
    const listTools = async () =>
      Array.from({ length: nTools }, (_, i) => ({
        name: `webflow__t${i}`,
        description: `Outil webflow numéro ${i}`,
        inputSchema: { type: "object", properties: {} },
        serverId: "webflow",
      }));
    return {
      completeTools,
      mcp: {
        list: async () => [],
        add: async () => {},
        remove: async () => {},
        connect: async () => ({}),
        disconnect: async () => {},
        listTools,
        callTool: vi.fn(),
      },
    } as unknown as Host;
  }
  const params = (h: Host) => ({
    host: h,
    provider: "openai" as const,
    modelId: "gpt-4o",
    apiKey: "sk",
    vault: {},
    secrets: [],
    disabledKinds: [],
    fromWire: (s: string) => s,
    onText: () => {},
    onToolCall: () => {},
    history: [{ role: "user" as const, content: "que peux-tu faire ?" }],
  });
  const summary = () =>
    captureEvent.mock.calls.map(([e]) => e).find((e) => e.name === "tool_loop_summary") as Record<
      string,
      unknown
    >;

  beforeEach(() => captureEvent.mockReset());

  it("carries the router call's duration when routing ran", async () => {
    const pick: CompleteToolsResult = {
      text: "",
      toolCalls: [{ id: "r", name: "select_tools", arguments: { tool_names: [] } }],
      stopReason: "tool_calls",
    };
    await runMcpAgentLoop(
      params(host(30, [pick, { text: "voici", toolCalls: [], stopReason: "stop" }])),
    );
    expect(typeof summary().routerMs).toBe("number");
    expect(summary().routerMs as number).toBeGreaterThanOrEqual(0);
  });

  it("omits it when the tool set fits and no router call ran", async () => {
    await runMcpAgentLoop(params(host(3, [{ text: "voici", toolCalls: [], stopReason: "stop" }])));
    expect(summary()).toBeDefined();
    expect("routerMs" in summary()).toBe(false);
  });
});
