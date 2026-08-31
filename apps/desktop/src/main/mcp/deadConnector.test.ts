import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * REGRESSION — a dead MCP server was REPORTED on every poll, never evicted.
 *
 * `refreshRoutes` caught the `listTools` failure, set the tool count to 0,
 * called `reportMainError`… and left the server in `connected`. The next refresh
 * then re-polled it, and re-reported it. Measured on Sentry on 12/08: **848
 * « Error: Not connected » events in eight days for ONE vanished `@playwright/mcp`
 * child**, plus 481 on another build — 93 % of the project's volume for two messages.
 *
 * What these cases pin down, and what a comment can't hold:
 *  • a DEAD transport is evicted, and is not reported (the « reconnection
 *    needed » banner is the surface that tells the user) ;
 *  • a REAL failure (spawn ENOENT, missing module — the packaging regression)
 *    is always reported, and the server is not evicted for that reason ;
 *  • two refreshes after a death do not produce two reports.
 */

const { reports } = vi.hoisted(() => ({ reports: [] as { scope: string; code: string }[] }));

// ⚠️ `vi.mock` paths resolve from THIS file, not from the module that
// imports: `registry.ts` lives in `server/`, so its `../../runtime/errorReport` is written
// `../runtime/errorReport` from here.
vi.mock("electron", () => ({ app: { getPath: () => "/tmp", getVersion: () => "0" }, BrowserWindow: class {} }));
vi.mock("./persist", () => ({ getServer: () => undefined }));
vi.mock("../runtime/errorReport", () => ({
  reportMainError: (scope: string, code: string) => {
    reports.push({ scope, code });
  },
}));
vi.mock("./browserTools", () => ({ BROWSER_TOOL_ALLOWLIST: new Set<string>() }));

import { connected, needsReconnect, refreshRoutes, toolCounts } from "./server/registry";

/** A server whose `listTools` always fails the same way. */
function failing(id: string, err: unknown) {
  const closed = { n: 0 };
  connected.set(id, {
    id,
    listTools: () => Promise.reject(err),
    callTool: () => Promise.reject(new Error("unused")),
    close: () => {
      closed.n += 1;
      return Promise.resolve();
    },
  } as never);
  return closed;
}

describe("refreshRoutes — un connecteur mort est évincé, pas re-signalé", () => {
  beforeEach(() => {
    connected.clear();
    toolCounts.clear();
    needsReconnect.clear();
    reports.length = 0;
  });

  it("évince sur « Not connected » sans rien rapporter, et le ferme", async () => {
    const closed = failing("pw", new Error("Not connected"));
    await refreshRoutes();
    expect(connected.has("pw")).toBe(false);
    expect(reports).toEqual([]);
    // Closed along the way: the child can be dead on the transport side without the SDK
    // client having released its resources.
    expect(closed.n).toBe(1);
    // And the user learns of it — that's what makes Sentry's silence acceptable.
    expect(needsReconnect.has("pw")).toBe(true);
  });

  it("évince aussi sur le second texte du SDK (« Connection closed »)", async () => {
    failing("notion", new Error("MCP error -32000: Connection closed"));
    await refreshRoutes();
    expect(connected.has("notion")).toBe(false);
    expect(reports).toEqual([]);
  });

  it("deux rafraîchissements après une mort = ZÉRO rapport (c'était 848)", async () => {
    failing("pw", new Error("Not connected"));
    await refreshRoutes();
    await refreshRoutes();
    expect(reports).toEqual([]);
    expect(connected.size).toBe(0);
  });

  it("une VRAIE panne est rapportée, et le serveur reste — le signal d'empaquetage survit", async () => {
    failing("fs", new Error("spawn npx ENOENT"));
    await refreshRoutes();
    expect(reports).toEqual([{ scope: "mcp", code: "list-tools" }]);
    // Not evicted: this isn't a dead transport, it's a server that never started
    // correctly — removing it would erase the trace instead of showing it.
    expect(connected.has("fs")).toBe(true);
    expect(toolCounts.get("fs")).toBe(0);
  });

  it("un serveur SAIN n'est ni évincé ni rapporté, et ses outils sont routés", async () => {
    connected.set("ok", {
      id: "ok",
      listTools: () => Promise.resolve([{ name: "ping" }]),
      callTool: () => Promise.resolve({}),
      close: () => Promise.resolve(),
    } as never);
    const tools = await refreshRoutes();
    expect(tools.map((t) => t.name)).toEqual(["ok__ping"]);
    expect(connected.has("ok")).toBe(true);
    expect(reports).toEqual([]);
  });
});
