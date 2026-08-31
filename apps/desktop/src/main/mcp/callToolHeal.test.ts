import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * REGRESSION — the browser self-heal must fire on the RESULT path, not only on a throw.
 * @playwright/mcp reports tool failures as a NORMAL MCP result with `isError:true`
 * ("### Error\nError: browserBackend.callTool: Protocol error (Target.createTarget):
 * Not supported"), so the catch-based heal never saw the zero-tab race: the error rode
 * back to the model as a plain result and pwmcp stayed broken for every later browser
 * call. Pins: an `isError` result matching `isRecoverableBrowserError` triggers ONE
 * reconnect + retry; a genuine tool error does not.
 *
 * Lives in `mcp/` (vitest `include` covers `mcp/*.test.ts`, not new subfolders).
 */

// vi.mock factories are HOISTED above module init — shared state must be hoisted too.
const { routes, reconnects } = vi.hoisted(() => ({
  routes: new Map<string, { realName: string; server: { callTool: (c: unknown) => Promise<unknown> } }>(),
  reconnects: [] as string[],
}));

// `app`: pulled in by the import chain via the DevTools policy (devtools.ts) — a factory
// mock throws on any absent property, so we enumerate what the chain touches.
vi.mock("electron", () => ({ BrowserWindow: class {}, app: {} }));
vi.mock("./server/connect", () => ({
  ensureBrowserConnLive: vi.fn(async () => {}),
  reconnectBrowserConn: vi.fn(async (reason: string) => {
    reconnects.push(reason);
  }),
}));
vi.mock("./browserTools", () => ({
  browserMcpOutputDir: () => "/tmp",
  BROWSER_TOOL_ALLOWLIST: new Set(["browser_navigate", "browser_snapshot"]),
  isAllowedBrowserUrl: () => true,
  rewriteSearchEngine: (u: string) => u,
}));
vi.mock("./browser/snapshotInline", () => ({
  outputLinkBasenames: () => [],
  inlineOutputLinks: (t: string) => ({ text: t, inlined: [] }),
}));
vi.mock("../net/fetchAllow", () => ({ noteFetchHostsFromText: () => {} }));
vi.mock("../net/net", () => ({ assertPublicUrl: async () => {} }));

vi.mock("./server/registry", () => ({
  routes,
  refreshRoutes: vi.fn(async () => {}),
}));

import { mcpCallTool } from "./server/callTool";

const ZERO_TAB_ERROR = {
  isError: true,
  content: [
    {
      type: "text",
      text: "### Error\nError: browserBackend.callTool: Protocol error (Target.createTarget): Not supported",
    },
  ],
};
const OK = { content: [{ type: "text", text: "### Page\nLe Monde — actualités" }] };

beforeEach(() => {
  routes.clear();
  reconnects.length = 0;
});

function navRoute(callTool: ReturnType<typeof vi.fn>) {
  routes.set("browser__browser_navigate", { realName: "browser_navigate", server: { callTool } });
}

describe("browser heal — the isError RESULT path", () => {
  it("a zero-tab Target.createTarget RESULT reconnects once and the retry's page comes back", async () => {
    const callTool = vi.fn().mockResolvedValueOnce(ZERO_TAB_ERROR).mockResolvedValueOnce(OK);
    navRoute(callTool);
    const result = await mcpCallTool({
      id: "1",
      name: "browser__browser_navigate",
      arguments: { url: "https://www.lemonde.fr" },
    });
    expect(reconnects).toHaveLength(1);
    expect(callTool).toHaveBeenCalledTimes(2);
    expect(result.isError ?? false).toBe(false);
    expect((result.content[0] as { text: string }).text).toContain("Le Monde");
  });

  it("retries ONCE only — a persistent failure is returned, never looped", async () => {
    const callTool = vi.fn().mockResolvedValue(ZERO_TAB_ERROR);
    navRoute(callTool);
    const result = await mcpCallTool({
      id: "1",
      name: "browser__browser_navigate",
      arguments: { url: "https://www.lemonde.fr" },
    });
    expect(reconnects).toHaveLength(1);
    expect(callTool).toHaveBeenCalledTimes(2);
    expect(result.isError).toBe(true);
  });

  it("a GENUINE tool error result (blocked nav, locator) is returned untouched — no reconnect", async () => {
    const callTool = vi.fn().mockResolvedValue({
      isError: true,
      content: [{ type: "text", text: "### Error\nNavigation bloquée (schéma non autorisé)" }],
    });
    navRoute(callTool);
    const result = await mcpCallTool({
      id: "1",
      name: "browser__browser_navigate",
      arguments: { url: "https://www.lemonde.fr" },
    });
    expect(reconnects).toHaveLength(0);
    expect(callTool).toHaveBeenCalledTimes(1);
    expect(result.isError).toBe(true);
  });

  it("the THROW path still heals too (lost page exception)", async () => {
    const callTool = vi
      .fn()
      .mockRejectedValueOnce(new Error("Target page, context or browser has been closed"))
      .mockResolvedValueOnce(OK);
    navRoute(callTool);
    const result = await mcpCallTool({
      id: "1",
      name: "browser__browser_navigate",
      arguments: { url: "https://www.lemonde.fr" },
    });
    expect(reconnects).toHaveLength(1);
    expect(result.isError ?? false).toBe(false);
  });
});
