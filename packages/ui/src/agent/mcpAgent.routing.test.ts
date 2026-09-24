
import { describe, expect, it, vi } from "vitest";
import type { CompleteToolsResult, } from "@openmasq/llm";
import { runMcpAgentLoop, } from "./mcpAgent";
import type { Host } from "../host";

describe("runMcpAgentLoop — routing, catalog, blind calls, arg errors", () => {
  type Payload = { messages: { role: string; content: string }[]; tools?: { name: string }[]; toolChoice?: string };
  function fakeHostMany(nTools: number, turns: CompleteToolsResult[]) {
    const seen: Payload[] = [];
    const completeTools = vi.fn(async (payload: Payload) => {
      seen.push(payload);
      return turns.shift() ?? { text: "réponse", toolCalls: [], stopReason: "stop" };
    });
    const callTool = vi.fn(async () => ({ content: [{ type: "text" as const, text: "ok" }] }));
    const listTools = async () =>
      Array.from({ length: nTools }, (_, i) => ({
        name: `webflow__t${i}`,
        description: `Outil webflow numéro ${i}`,
        inputSchema: { type: "object", properties: { id: { type: "string" } } },
        serverId: "webflow",
      }));
    const host = {
      completeTools,
      mcp: { list: async () => [], add: async () => {}, remove: async () => {}, connect: async () => ({}), disconnect: async () => {}, listTools, callTool },
    } as unknown as Host;
    return { host, completeTools, callTool, seen };
  }
  const routerPick = (names: string[]): CompleteToolsResult => ({
    text: "",
    toolCalls: [{ id: "r", name: "select_tools", arguments: { tool_names: names } }],
    stopReason: "tool_calls",
  });
  const base = (host: Host) => ({
    host, provider: "openai" as const, modelId: "gpt-4o", apiKey: "sk",
    vault: {}, secrets: [], disabledKinds: [], fromWire: (s: string) => s, onText: () => {}, onToolCall: () => {},
  });

  it("pruned set → injects the awareness catalog + offers load_tools", async () => {
    const { host, seen } = fakeHostMany(30, [routerPick(["webflow__t0"]), { text: "voici", toolCalls: [], stopReason: "stop" }]);
    await runMcpAgentLoop({ ...base(host), history: [{ role: "user", content: "liste mes pages" }] });
    const main = seen[1]; // [0] = router (select_tools), [1] = the main model call
    const sys = main.messages.find((m) => m.role === "system")?.content ?? "";
    expect(sys).toContain("## webflow"); // full connected surface (awareness)
    expect(sys).toContain("webflow__t9"); // a PRUNED tool is still listed in the catalog
    expect(main.tools?.some((t) => t.name === "load_tools")).toBe(true);
    expect(main.tools?.some((t) => t.name === "webflow__t0")).toBe(true); // routed subset callable
    expect(main.tools?.some((t) => t.name === "webflow__t9")).toBe(false); // pruned one NOT callable
  });

  it("empty routing still ENTERS the loop with the catalog (not a fall-through)", async () => {
    // The text names NO connector — otherwise the by-name catch-up (test below) would
    // load the schemas and this test would measure something other than its subject: an
    // empty pick is never a fall-through, the loop runs with catalogue + load_tools.
    const { host, completeTools, seen } = fakeHostMany(30, [routerPick([]), { text: "Je peux gérer tes sites…", toolCalls: [], stopReason: "stop" }]);
    const handled = await runMcpAgentLoop({ ...base(host), history: [{ role: "user", content: "que peux-tu faire, concrètement ?" }] });
    expect(handled).toBe(true);
    expect(completeTools).toHaveBeenCalledTimes(2); // router + one answering call
    const main = seen[1];
    expect(main.messages.find((m) => m.role === "system")?.content).toContain("## webflow");
    expect(main.tools?.map((t) => t.name)).toEqual(["load_tools"]); // no schema loaded, load_tools offered
  });

  // Log of 27/07/2026: a workflow scoped to Google Calendar, « pick routeur VIDE
  // (0/296) », and the model sets off without a single calendar tool — it ends up
  // inventing a write for lack of being able to read. The DECLARED scope catches the router.
  it("un pick VIDE n'enlève pas les outils du connecteur SCOPÉ par le workflow", async () => {
    const { host, seen } = fakeHostMany(30, [routerPick([]), { text: "voici", toolCalls: [], stopReason: "stop" }]);
    await runMcpAgentLoop({
      ...base(host),
      history: [{ role: "user", content: "prépare ma journée" }],
      scopedConnectors: ["webflow"],
    });
    const offered = seen[1].tools?.map((t) => t.name) ?? [];
    expect(offered).toContain("webflow__t0");
    expect(offered).toContain("webflow__t29");
  });

  it("réponse routeur ILLISIBLE → repli garde-tout, et le cooldown de configuration n'est PAS armé", async () => {
    const { noteRouterSuccess, routerCooldownActive } = await import("./toolRouter");
    noteRouterSuccess(); // état propre — d'autres tests arment le cooldown exprès
    const unreadable = {
      text: "",
      stopReason: "tool_calls" as const,
      toolCalls: [{ id: "r", name: "select_tools", arguments: {}, argsError: "Unexpected token" }],
    };
    const { host, seen } = fakeHostMany(30, [unreadable, { text: "voici", toolCalls: [], stopReason: "stop" }]);
    await runMcpAgentLoop({ ...base(host), history: [{ role: "user", content: "mes pages" }] });
    // Catch-all: the 30 schemas fit, all offered — not a disguised empty pick.
    expect(seen[1].tools?.some((t) => t.name === "webflow__t29")).toBe(true);
    // One malformed answer ≠ a broken configuration: the next routing does happen.
    expect(routerCooldownActive(Date.now())).toBe(false);
  });

  // Log of 06/08/2026: « Voice intercom : compare tous les tickets… » — an EMPTY router
  // pick (0/115), then the model calls `intercom__search_conversations` read from the
  // catalogue, with invented args. The by-NAME catch-up closes the first half: empty pick
  // + a connected connector named in the text ⇒ its schemas are loaded outright.
  it("pick VIDE + connecteur NOMMÉ dans la demande → ses outils sont offerts quand même", async () => {
    const { host, seen } = fakeHostMany(30, [routerPick([]), { text: "voici", toolCalls: [], stopReason: "stop" }]);
    await runMcpAgentLoop({ ...base(host), history: [{ role: "user", content: "liste mes pages webflow" }] });
    const offered = seen[1].tools?.map((t) => t.name) ?? [];
    expect(offered).toContain("webflow__t0");
    expect(offered).toContain("webflow__t29");
  });

  it("pick NON vide → le rattrapage par nom ne s'applique pas (un routage réussi n'est pas élargi)", async () => {
    const { host, seen } = fakeHostMany(30, [routerPick(["webflow__t0"]), { text: "voici", toolCalls: [], stopReason: "stop" }]);
    await runMcpAgentLoop({ ...base(host), history: [{ role: "user", content: "liste mes pages webflow" }] });
    const offered = seen[1].tools?.map((t) => t.name) ?? [];
    expect(offered).toContain("webflow__t0");
    expect(offered).not.toContain("webflow__t9");
  });

  // The second half of the same log: the BLIND call to the schema. The tool exists, its
  // schema was not loaded, the args are invented — a PROVABLE violation is rejected
  // without touching the server, and the schema becomes offered on the next turn.
  it("appel aveugle au schéma avec du JSON-chaîne difforme → rejeté SANS toucher le serveur, schéma offert ensuite", async () => {
    const { host, callTool, seen } = fakeHostMany(30, [
      routerPick(["webflow__t0"]),
      {
        text: "",
        toolCalls: [{ id: "c1", name: "webflow__t5", arguments: { id: '{"from": 1, "to": 2}}' } }],
        stopReason: "tool_calls",
      },
      { text: "fini", toolCalls: [], stopReason: "stop" },
    ]);
    await runMcpAgentLoop({ ...base(host), history: [{ role: "user", content: "mes pages" }] });
    expect(callTool).not.toHaveBeenCalled();
    const bounce = seen[2].messages.filter((m) => m.role === "tool").at(-1)?.content ?? "";
    expect(bounce).toContain("schéma");
    expect(bounce).toContain("RIEN n'a été envoyé");
    expect(seen[2].tools?.some((t) => t.name === "webflow__t5")).toBe(true);
  });

  it("appel aveugle au schéma avec des args conformes → dispatché tel quel (pas de régression du chemin qui marchait)", async () => {
    const { host, callTool } = fakeHostMany(30, [
      routerPick(["webflow__t0"]),
      {
        text: "",
        toolCalls: [{ id: "c1", name: "webflow__t5", arguments: { id: "abc" } }],
        stopReason: "tool_calls",
      },
      { text: "fini", toolCalls: [], stopReason: "stop" },
    ]);
    await runMcpAgentLoop({ ...base(host), history: [{ role: "user", content: "mes pages" }] });
    expect(callTool).toHaveBeenCalledOnce();
  });

  // Two properties at once, and the second is the one that put a finger on a real hole:
  // the organisation block was read from `serverId`, which `RedactingMcpClient.listTools`
  // rewrites with the CONNECTION's id — « ipc » for every tool, since the loop has only
  // one. The filter therefore blocked NOTHING. It now reads the prefix of the name, which
  // main namespaces.
  it("bloque un connecteur interdit par l'organisation, et le rattrapage de scope ne le ressuscite pas", async () => {
    const seen: Payload[] = [];
    const completeTools = vi.fn(async (payload: Payload) => {
      seen.push(payload);
      return (
        [routerPick([]), { text: "voici", toolCalls: [], stopReason: "stop" as const }].at(
          seen.length - 1,
        ) ?? { text: "", toolCalls: [], stopReason: "stop" as const }
      );
    });
    // Two connectors, ONE of them blocked — otherwise the filtered set is empty, the loop
    // does not start and the assertion would pass without checking anything.
    const listTools = async () => [
      ...Array.from({ length: 20 }, (_, i) => ({
        name: `webflow__t${i}`,
        description: `Outil webflow ${i}`,
        inputSchema: { type: "object", properties: { id: { type: "string" } } },
        serverId: "webflow",
      })),
      ...Array.from({ length: 20 }, (_, i) => ({
        name: `linear__t${i}`,
        description: `Outil linear ${i}`,
        inputSchema: { type: "object", properties: { id: { type: "string" } } },
        serverId: "linear",
      })),
    ];
    const host = {
      completeTools,
      mcp: { list: async () => [], listTools, callTool: vi.fn() },
    } as unknown as Host;

    const handled = await runMcpAgentLoop({
      ...base(host),
      history: [{ role: "user", content: "prépare ma journée" }],
      scopedConnectors: ["webflow", "linear"],
      allowedServerIds: ["linear"], // allow-list : webflow n'y est pas, donc il tombe
    });
    expect(handled).toBe(true); // la boucle a bien tourné — l'assertion n'est pas vide
    const offered = seen[1].tools?.map((t) => t.name) ?? [];
    expect(offered).toContain("linear__t0"); // le connecteur scopé ET autorisé est rattrapé
    expect(offered.some((n) => n.startsWith("webflow__"))).toBe(false); // le non-autorisé, jamais
  });

  it("un pick VIDE sans connecteur nommé reste vide — le rattrapage exige le NOM, jamais une devinette", async () => {
    // ⚠️ DECISION REVERSED (06/08/2026), knowing the previous pin. The old test forbade
    // ANY textual catch-up, on the grounds that a capability question names without
    // wanting to call. Measured since: 85 empty picks/30 days, every model, and on an
    // empty pick a weak model does not call `load_tools` — it reads the name from the
    // catalogue and calls BLIND with invented args (log of 06/08: intercom, 3 round-trips
    // lost). On an empty pick there is NO successful routing to protect; the residual cost
    // (a capability question naming a connector pays for its schemas) is bounded and the
    // gain is measurable (`tool_route_rescue`). The restraint that SURVIVES, pinned here:
    // a text that names no connected connector loads none.
    const { host, seen } = fakeHostMany(30, [routerPick([]), { text: "je peux…", toolCalls: [], stopReason: "stop" }]);
    await runMcpAgentLoop({ ...base(host), history: [{ role: "user", content: "compare mes tickets du trimestre" }] });
    expect(seen[1].tools?.map((t) => t.name)).toEqual(["load_tools"]);
  });

  it("load_tools loads a schema on demand WITHOUT hitting any MCP server", async () => {
    const { host, callTool, seen } = fakeHostMany(30, [
      routerPick([]),
      { text: "", toolCalls: [{ id: "l1", name: "load_tools", arguments: { tool_names: ["webflow__t3"] } }], stopReason: "tool_calls" },
      { text: "fait", toolCalls: [], stopReason: "stop" },
    ]);
    await runMcpAgentLoop({ ...base(host), history: [{ role: "user", content: "crée une page" }] });
    expect(callTool).not.toHaveBeenCalled(); // load_tools is internal, never proxied
    const toolMsg = seen[2].messages.find((m) => m.role === "tool");
    expect(toolMsg?.content).toContain("Schémas chargés : webflow__t3");
    expect(seen[2].tools?.some((t) => t.name === "webflow__t3")).toBe(true); // now callable
  });

  it("returns false when no MCP tools are available (caller falls back)", async () => {
    const host = {
      completeTools: vi.fn(),
      mcp: {
        list: async () => [],
        add: async () => {},
        remove: async () => {},
        connect: async () => ({ id: "x", name: "x", url: "", connected: false, authorized: false }),
        disconnect: async () => {},
        listTools: async () => [],
        callTool: vi.fn(),
      },
    } as unknown as Host;

    const handled = await runMcpAgentLoop({
      host,
      provider: "openai",
      modelId: "gpt-4o",
      history: [],
      vault: {},
      secrets: [],
      disabledKinds: [],
      fromWire: (s) => s,
      onText: () => {},
      onToolCall: () => {},
    });
    expect(handled).toBe(false);
  });

  // A tool whose args the model keeps malforming — the loop feeds back the
  // expected params (and, on repeat, a minimal example) so a weak model can fix it.
  const argSchema = {
    type: "object",
    required: ["actions"],
    properties: {
      actions: {
        type: "array",
        items: { type: "object", required: ["label"], properties: { label: { type: "string" } } },
      },
    },
  };
  const stubMcp = (tool: { name: string; inputSchema: unknown }, callTool: () => Promise<unknown>) =>
    ({
      list: async () => [],
      add: async () => {},
      remove: async () => {},
      connect: async () => ({ id: "x", name: "x", url: "", connected: true, authorized: true }),
      disconnect: async () => {},
      listTools: async () => [{ description: "d", serverId: "ipc", ...tool }],
      callTool,
    });

  it("feeds back expected params on an arg error, escalating to an example on repeat", async () => {
    const seen: { messages: { role: string; content: string }[] }[] = [];
    const completeTools = vi.fn(async (payload: { messages: { role: string; content: string }[] }) => {
      seen.push({ messages: [...payload.messages] }); // snapshot — the loop mutates the array
      if (seen.length <= 2)
        return {
          text: "",
          toolCalls: [{ id: `c${seen.length}`, name: "webflow__element", arguments: { wrong: seen.length } }],
          stopReason: "tool_calls" as const,
        };
      return { text: "ok", toolCalls: [], stopReason: "stop" as const };
    });
    const callTool = vi.fn(async () => ({ content: [] })); // never reached (missing required)
    const host = {
      completeTools,
      mcp: stubMcp({ name: "webflow__element", inputSchema: argSchema }, callTool),
    } as unknown as Host;

    await runMcpAgentLoop({
      host, provider: "openai", modelId: "gpt-4o", apiKey: "sk",
      history: [{ role: "user", content: "modifie mon site webflow" }],
      vault: {}, secrets: [], disabledKinds: [], fromWire: (s) => s, onText: () => {}, onToolCall: () => {},
    });

    const t1 = seen[1].messages.filter((m) => m.role === "tool").pop();
    expect(t1?.content).toContain("Paramètres attendus pour webflow__element");
    expect(t1?.content).toContain("actions: array<object> (requis)");
    expect(t1?.content).not.toContain("Exemple d'appel minimal");
    const t2 = seen[2].messages.filter((m) => m.role === "tool").pop();
    expect(t2?.content).toContain("Exemple d'appel minimal");
    expect(callTool).not.toHaveBeenCalled(); // pre-validation → never hit the server
  });

  it("does NOT append the schema for a non-arg (auth) tool error", async () => {
    const seen: { messages: { role: string; content: string }[] }[] = [];
    const completeTools = vi.fn(async (payload: { messages: { role: string; content: string }[] }) => {
      seen.push({ messages: [...payload.messages] }); // snapshot — the loop mutates the array
      if (seen.length === 1)
        return {
          text: "",
          toolCalls: [{ id: "c1", name: "stripe__get", arguments: { id: "cus_1" } }],
          stopReason: "tool_calls" as const,
        };
      return { text: "done", toolCalls: [], stopReason: "stop" as const };
    });
    const callTool = vi.fn(async () => ({
      content: [{ type: "text" as const, text: "unauthorized: invalid api key" }],
      isError: true,
    }));
    const host = {
      completeTools,
      mcp: stubMcp(
        { name: "stripe__get", inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } } },
        callTool,
      ),
    } as unknown as Host;

    await runMcpAgentLoop({
      host, provider: "openai", modelId: "gpt-4o", apiKey: "sk",
      history: [{ role: "user", content: "récupère le client" }],
      vault: {}, secrets: [], disabledKinds: [], fromWire: (s) => s, onText: () => {}, onToolCall: () => {},
    });

    const t = seen[1].messages.filter((m) => m.role === "tool").pop();
    expect(t?.content).toContain("unauthorized");
    expect(t?.content).not.toContain("Paramètres attendus");
  });
});
