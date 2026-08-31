import { describe, it, expect, vi } from "vitest";
import { routeTools, needsRouting, RouterUnreadableError, type RouterTool } from "./toolRouter";
import type { CompleteToolsPayload } from "../host";
import type { CompleteToolsResult } from "@openmasq/llm";

const TOOLS: RouterTool[] = [
  { name: "webflow__list_sites", description: "List Webflow sites", serverId: "webflow" },
  { name: "webflow__list_pages", description: "List pages of a site", serverId: "webflow" },
  { name: "canva__export", description: "Export a design", serverId: "canva" },
];

/** A mock `complete` returning a select_tools call with `picks`. */
function completeWith(picks: unknown, toolName = "select_tools") {
  return vi.fn(
    async (_p: CompleteToolsPayload): Promise<CompleteToolsResult> => ({
      text: "",
      stopReason: "tool_calls",
      toolCalls: [{ id: "c1", name: toolName, arguments: { tool_names: picks } }],
    }),
  );
}

const BASE = { provider: "mistral" as const, modelId: "mistral-medium-2508" };

describe("routeTools", () => {
  it("returns the picked subset ∩ the real tool names", async () => {
    const keep = await routeTools({
      ...BASE,
      tools: TOOLS,
      userText: "liste les pages de mon site webflow",
      complete: completeWith(["webflow__list_pages", "webflow__list_sites"]),
    });
    expect([...keep].sort()).toEqual(["webflow__list_pages", "webflow__list_sites"]);
  });

  it("drops hallucinated names not in the catalog", async () => {
    const keep = await routeTools({
      ...BASE,
      tools: TOOLS,
      userText: "x",
      complete: completeWith(["webflow__list_pages", "ghost__nonexistent"]),
    });
    expect([...keep]).toEqual(["webflow__list_pages"]);
  });

  it("empty pick → empty set (no tool needed)", async () => {
    const keep = await routeTools({ ...BASE, tools: TOOLS, userText: "bonjour", complete: completeWith([]) });
    expect(keep.size).toBe(0);
  });

  // ⚠️ REVERSED behaviour (06/08/2026): "non-array/missing → empty set" used to conflate
  // an UNREADABLE response with "no tool required". A disguised empty pick sent the
  // model off improvising with no tools (85 empty picks/30 days measured, all causes combined);
  // the unreadable case now surfaces TYPED so the caller keeps everything if it fits.
  it("tool_names manquant/non-liste → RouterUnreadableError, jamais un faux « aucun outil »", async () => {
    await expect(routeTools({ ...BASE, tools: TOOLS, userText: "x", complete: completeWith(undefined) }))
      .rejects.toBeInstanceOf(RouterUnreadableError);
  });

  it("arguments malformés (argsError) → RouterUnreadableError — le JSON difforme d'un modèle faible n'est pas un pick", async () => {
    const complete = vi.fn(
      async (): Promise<CompleteToolsResult> => ({
        text: "",
        stopReason: "tool_calls",
        toolCalls: [{ id: "c1", name: "select_tools", arguments: {}, argsError: "Unexpected token }" }],
      }),
    );
    await expect(routeTools({ ...BASE, tools: TOOLS, userText: "x", complete })).rejects.toBeInstanceOf(RouterUnreadableError);
  });

  it("réponse sans AUCUN appel d'outil → RouterUnreadableError (toolChoice required ignoré par le fournisseur)", async () => {
    const complete = vi.fn(
      async (): Promise<CompleteToolsResult> => ({ text: "voici ma sélection…", stopReason: "stop", toolCalls: [] }),
    );
    await expect(routeTools({ ...BASE, tools: TOOLS, userText: "x", complete })).rejects.toBeInstanceOf(RouterUnreadableError);
  });

  it("un nom NU est re-préfixé quand il est unique (même résolution que le dispatch)", async () => {
    const keep = await routeTools({ ...BASE, tools: TOOLS, userText: "x", complete: completeWith(["export"]) });
    expect([...keep]).toEqual(["canva__export"]);
  });

  it("un nom NU ambigu n'est PAS deviné — deux candidats, aucun retenu", async () => {
    const tools: RouterTool[] = [...TOOLS, { name: "canva2__export", description: "x", serverId: "canva2" }];
    const keep = await routeTools({ ...BASE, tools, userText: "x", complete: completeWith(["export"]) });
    expect(keep.size).toBe(0);
  });

  it("un pick au niveau CONNECTEUR (« webflow ») se développe en tous ses outils", async () => {
    const keep = await routeTools({ ...BASE, tools: TOOLS, userText: "x", complete: completeWith(["webflow"]) });
    expect([...keep].sort()).toEqual(["webflow__list_pages", "webflow__list_sites"]);
  });

  it("throws when the router call itself fails", async () => {
    const complete = vi.fn(async (_p: CompleteToolsPayload): Promise<CompleteToolsResult> => {
      throw new Error("boom");
    });
    await expect(routeTools({ ...BASE, tools: TOOLS, userText: "x", complete })).rejects.toThrow("boom");
  });

  it("only sends tool NAMES + descriptions to the router (never schemas)", async () => {
    const complete = completeWith([]);
    await routeTools({ ...BASE, tools: TOOLS, userText: "x", complete });
    const sysMsg = complete.mock.calls[0][0].messages[0].content;
    expect(sysMsg).toContain("webflow__list_pages");
    expect(sysMsg).toContain("List pages of a site");
    // the router is only offered its own select_tools tool, not the real ones
    expect(complete.mock.calls[0][0].tools?.map((t) => t.name)).toEqual(["select_tools"]);
    expect(complete.mock.calls[0][0].toolChoice).toBe("required");
  });
});

describe("needsRouting", () => {
  it("skips a small set that comfortably fits", () => {
    expect(needsRouting(1_000, 5, 128_000)).toBe(false);
  });
  it("routes when the estimate exceeds the default ratio of the window", () => {
    expect(needsRouting(60_000, 20, 128_000)).toBe(true);
  });
  it("routes when there are too many tools even if the estimate is small", () => {
    expect(needsRouting(1_000, 40, 128_000)).toBe(true);
  });
});

describe("router cooldown (échec mémorisé, TTL)", () => {
  it("un échec active la pause ; le TTL l'expire ; un succès l'annule", async () => {
    const { routerCooldownActive, noteRouterFailure, noteRouterSuccess } = await import("./toolRouter");
    noteRouterSuccess(); // clean state
    expect(routerCooldownActive(1_000)).toBe(false);
    noteRouterFailure(1_000);
    expect(routerCooldownActive(1_000 + 1)).toBe(true); // on pause
    expect(routerCooldownActive(1_000 + 5 * 60_000 + 1)).toBe(false); // TTL expired
    noteRouterFailure(2_000);
    noteRouterSuccess();
    expect(routerCooldownActive(2_000 + 1)).toBe(false); // success = immediate reset
  });
});
