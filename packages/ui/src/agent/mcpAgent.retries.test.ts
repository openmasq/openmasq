
import { describe, expect, it, vi } from "vitest";
import { runMcpAgentLoop, } from "./mcpAgent";
import { fakeHost, } from "./mcpAgent.testkit";
import type { Host } from "../host";

describe("runMcpAgentLoop — retries, hints, blame, streaming", () => {
  it("injects tool-use guidance as a system message on the first model call", async () => {
    const { host, seen } = fakeHost(
      [{ text: "Bonjour !", toolCalls: [], stopReason: "stop" }],
      "",
    );
    await runMcpAgentLoop({
      host,
      provider: "openai",
      modelId: "gpt-4o",
      history: [{ role: "user", content: "salut" }],
      vault: {},
      secrets: [],
      disabledKinds: [],
      fromWire: (s) => s,
      onText: () => {},
      onToolCall: () => {},
    });
    const sys = seen[0].messages.find((m) => m.role === "system");
    expect(sys?.content).toMatch(/APPELLE l'outil/);
    // Carve-out: generating content ≠ writing a file (don't misroute "crée un
    // document" onto a filesystem write_file).
    expect(sys?.content).toMatch(/rédiger un contenu n'est PAS écrire un fichier/);
    expect(sys?.content).toMatch(/write_file/);
  });

  it("hints 'no_tool_used' only after a forced-tool retry ALSO declines", async () => {
    const refuse = { text: "Je ne peux pas télécharger ce design directement.", toolCalls: [], stopReason: "stop" as const };
    const { host, completeTools } = fakeHost([refuse, { ...refuse }], "");
    const struggles: { tool: string; kind: string }[] = [];
    const handled = await runMcpAgentLoop({
      host,
      provider: "openai",
      modelId: "gpt-4o",
      history: [{ role: "user", content: "télécharge le design" }],
      vault: {},
      secrets: [],
      disabledKinds: [],
      fromWire: (s) => s,
      onText: () => {},
      onToolCall: () => {},
      onToolStruggle: (info) => struggles.push(info),
    });
    expect(handled).toBe(true);
    // It retried once (forced) before giving up, THEN surfaced the hint.
    expect(completeTools).toHaveBeenCalledTimes(2);
    expect(struggles).toEqual([{ server: "mcp", tool: "", kind: "no_tool_used" }]);
  });

  it("does NOT hint when the model answers normally without a tool", async () => {
    const { host } = fakeHost(
      [{ text: "Bien sûr, voici comment améliorer ton CV : …", toolCalls: [], stopReason: "stop" }],
      "",
    );
    const struggles: unknown[] = [];
    await runMcpAgentLoop({
      host,
      provider: "openai",
      modelId: "gpt-4o",
      history: [{ role: "user", content: "des conseils ?" }],
      vault: {},
      secrets: [],
      disabledKinds: [],
      fromWire: (s) => s,
      onText: () => {},
      onToolCall: () => {},
      onToolStruggle: (info) => struggles.push(info),
    });
    expect(struggles).toEqual([]);
  });

  it("auto-retries a refusal with a FORCED tool call, then runs the tool", async () => {
    const { host, completeTools, callTool, seen } = fakeHost(
      [
        // Turn 1: declines in prose, no tool call.
        { text: "Je ne peux pas télécharger ce design directement.", toolCalls: [], stopReason: "stop" },
        // Forced retry: now emits the tool call.
        {
          text: "",
          toolCalls: [{ id: "c1", name: "gmail__search", arguments: { q: "x" } }],
          stopReason: "tool_calls",
        },
        // After the tool result: final answer.
        { text: "Voilà.", toolCalls: [], stopReason: "stop" },
      ],
      "ok",
    );
    const struggles: unknown[] = [];
    await runMcpAgentLoop({
      host,
      provider: "openai",
      modelId: "gpt-4o-mini",
      history: [{ role: "user", content: "exporte mon CV" }],
      vault: {},
      secrets: [],
      disabledKinds: [],
      fromWire: (s) => s,
      onText: () => {},
      onToolCall: () => {},
      onToolStruggle: (info) => struggles.push(info),
    });
    // The retry was forced…
    expect((seen[1] as { toolChoice?: string }).toolChoice).toBe("required");
    // …the first call was NOT forced…
    expect((seen[0] as { toolChoice?: string }).toolChoice).toBeUndefined();
    // …the tool actually ran, and no "incapable" hint fired (it recovered).
    expect(callTool).toHaveBeenCalledTimes(1);
    expect(completeTools).toHaveBeenCalledTimes(3);
    expect(struggles).toEqual([]);
  });

  it("une réponse FABRIQUÉE sans outil, quand la demande NOMME le connecteur, force la même relance", async () => {
    // The log of 13/08: « quels sont les utilisateurs d'intercom ? » → a table of
    // INVENTED names/emails/phone numbers, zero tool calls — read as a redaction leak
    // by the user when nothing was real. No refusal phrasing, so `looksLikeRefusal` did
    // not bite: it is the NAMED connector + zero calls that must be enough to trigger
    // the forced retry (read-only, opportunistic).
    const { host, completeTools, callTool, seen } = fakeHost(
      [
        // Turn 1: confident answer, invented data, NO call — not a refusal.
        {
          text: "Voici vos utilisateurs : Alice (alice@company.com), Bob (bob@example.com).",
          toolCalls: [],
          stopReason: "stop",
        },
        // Forced retry: the real call goes out.
        {
          text: "",
          toolCalls: [{ id: "c1", name: "gmail__search", arguments: { q: "users" } }],
          stopReason: "tool_calls",
        },
        { text: "Voilà, d'après vos données réelles.", toolCalls: [], stopReason: "stop" },
      ],
      "ok",
    );
    await runMcpAgentLoop({
      host,
      provider: "openai",
      modelId: "gpt-4o-mini",
      history: [{ role: "user", content: "quels sont les utilisateurs de gmail ?" }],
      vault: {},
      secrets: [],
      disabledKinds: [],
      fromWire: (s) => s,
      onText: () => {},
      onToolCall: () => {},
    });
    expect((seen[0] as { toolChoice?: string }).toolChoice).toBeUndefined();
    expect((seen[1] as { toolChoice?: string }).toolChoice).toBe("required");
    expect(callTool).toHaveBeenCalledTimes(1);
    expect(completeTools).toHaveBeenCalledTimes(3);
  });

  it("blames the CONNECTOR, not the model, when the refused call matched the schema", async () => {
    // The reported turn (02/08/2026): `google-calendar__list_events {"limit":10}` — a
    // CONFORMING call (the tool declares no required argument) — received a 400. The app
    // displayed « le modèle a eu du mal (arguments invalides) » and advised Claude,
    // which would have sent exactly the same call to the same refusal.
    const completeTools = vi.fn(async () => ({
      text: "",
      toolCalls: [
        { id: "c1", name: "google-calendar__list_events", arguments: { limit: 10 } },
      ],
      stopReason: "tool_calls" as const,
    }));
    const callTool = vi.fn(async () => ({
      content: [{ type: "text" as const, text: "Upstream request failed (400): badRequest" }],
      isError: true,
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
          {
            name: "google-calendar__list_events",
            description: "",
            // Le schéma RÉEL : aucun `required`, `limit` borné 1..25.
            inputSchema: {
              type: "object",
              properties: { limit: { type: "integer", minimum: 1, maximum: 25 } },
            },
            serverId: "google-calendar",
          },
        ],
        callTool,
      },
    } as unknown as Host;
    const struggles: { tool: string; kind: string }[] = [];
    await runMcpAgentLoop({
      host,
      provider: "openrouter",
      modelId: "poolside/laguna-s-2.1:free",
      history: [{ role: "user", content: "prépare ma journée" }],
      vault: {},
      secrets: [],
      disabledKinds: [],
      fromWire: (s) => s,
      onText: () => {},
      onToolCall: () => {},
      onToolStruggle: (info) => struggles.push({ tool: info.tool, kind: info.kind }),
    });
    expect(struggles).toEqual([
      { tool: "google-calendar__list_events", kind: "connector_error" },
    ]);
  });

  it("blames the MODEL when its arguments really do violate the schema", async () => {
    const completeTools = vi.fn(async () => ({
      text: "",
      toolCalls: [
        { id: "c1", name: "google-calendar__list_events", arguments: { limit: "dix" } },
      ],
      stopReason: "tool_calls" as const,
    }));
    const callTool = vi.fn(async () => ({
      content: [{ type: "text" as const, text: "Upstream request failed (400): badRequest" }],
      isError: true,
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
          {
            name: "google-calendar__list_events",
            description: "",
            inputSchema: {
              type: "object",
              properties: { limit: { type: "integer", minimum: 1, maximum: 25 } },
            },
            serverId: "google-calendar",
          },
        ],
        callTool,
      },
    } as unknown as Host;
    const struggles: { kind: string }[] = [];
    await runMcpAgentLoop({
      host,
      provider: "openrouter",
      modelId: "poolside/laguna-s-2.1:free",
      history: [{ role: "user", content: "prépare ma journée" }],
      vault: {},
      secrets: [],
      disabledKinds: [],
      fromWire: (s) => s,
      onText: () => {},
      onToolCall: () => {},
      onToolStruggle: (info) => struggles.push({ kind: info.kind }),
    });
    expect(struggles).toEqual([{ kind: "arg_error" }]);
  });

  it("stops immediately on an agent-browser CDP fault (not 3 retries, not a model-blaming diagnosis)", async () => {
    // The regression: `browser__browser_navigate` failed with `Target.createTarget:
    // Not supported` (Electron can't create a CDP page target). The loop retried it
    // 3× and then blamed the MODEL ("réessaie avec un modèle plus capable"). It is a
    // deterministic BROWSER-BACKEND fault — stop on the FIRST one, truthfully.
    let calls = 0;
    const completeTools = vi.fn(async () => {
      calls++;
      return {
        text: "",
        toolCalls: [{ id: `c${calls}`, name: "browser__browser_navigate", arguments: { url: "https://www.google.com" } }],
        stopReason: "tool_calls" as const,
      };
    });
    const callTool = vi.fn(async () => {
      throw new Error("browserBackend.callTool: Protocol error (Target.createTarget): Not supported");
    });
    const host = {
      completeTools,
      mcp: {
        listTools: async () => [
          { name: "browser__browser_navigate", description: "Navigate", inputSchema: {}, serverId: "browser" },
        ],
        callTool,
      },
    } as unknown as Host;
    const finalTexts: string[] = [];
    const handled = await runMcpAgentLoop({
      host,
      provider: "openai",
      modelId: "poolside/laguna-s-2.1:free",
      history: [{ role: "user", content: "quelle actualité en France ?" }],
      vault: {},
      secrets: [],
      disabledKinds: [],
      browserAllowedDomains: [],
      fromWire: (s) => s,
      onText: (t, pending) => {
        if (!pending) finalTexts.push(t);
      },
      onToolCall: () => {},
    });
    expect(handled).toBe(true);
    // Stopped on the FIRST browser call — no retry loop.
    expect(callTool).toHaveBeenCalledTimes(1);
    expect(completeTools).toHaveBeenCalledTimes(1);
    // Truthful message: names the browser, NOT the model.
    const final = finalTexts.at(-1) ?? "";
    expect(final).toContain("navigateur intégré");
    expect(final).not.toMatch(/mod[èe]le plus capable/i);
  });

  it("keeps the prose answer when the forced-tool retry fails (provider rejects tool_choice=required)", async () => {
    // The regression: after a prose reply looked like a deferral, the loop re-asked
    // with tool_choice=required. On a provider that 400s on forced tool choice
    // (certains paliers gratuits), that threw and turned the ALREADY-DELIVERED answer red.
    // The retry is opportunistic now: its failure keeps the prose answer.
    const seen: { toolChoice?: string }[] = [];
    const completeTools = vi.fn(async (payload: { toolChoice?: string }) => {
      seen.push(payload);
      if (payload.toolChoice === "required") {
        throw new Error('openrouter tools request failed (400): {"error":"UPSTREAM_ERROR"}');
      }
      return {
        text: "Je vais vérifier vos emails tout de suite.",
        toolCalls: [],
        stopReason: "stop" as const,
      };
    });
    const host = {
      completeTools,
      mcp: {
        listTools: async () => [
          { name: "gmail__search", description: "", inputSchema: {}, serverId: "ipc" },
        ],
        callTool: vi.fn(),
      },
    } as unknown as Host;
    const finalTexts: string[] = [];
    // The loop RESOLVES (does not reject) and delivers the prose answer.
    const handled = await runMcpAgentLoop({
      host,
      provider: "openai",
      modelId: "poolside/laguna-s-2.1:free",
      history: [{ role: "user", content: "vérifie mes emails" }],
      vault: {},
      secrets: [],
      disabledKinds: [],
      fromWire: (s) => s,
      onText: (t, pending) => {
        if (!pending) finalTexts.push(t);
      },
      onToolCall: () => {},
    });
    expect(handled).toBe(true);
    expect(finalTexts.at(-1)).toContain("vérifier vos emails");
    // The forced retry WAS attempted (and swallowed, not thrown).
    expect(seen.some((p) => p.toolChoice === "required")).toBe(true);
  });

  it("surfaces a downloadable file URL from a tool result via onExportedFile", async () => {
    const EXPORT_URL =
      "https://export-download.canva.com/x/DADYuCgWHk0/c-dir.pdf?X-Amz-Signature=abc123";
    const { host, seen } = fakeHost(
      [
        {
          text: "",
          toolCalls: [{ id: "c1", name: "gmail__search", arguments: {} }],
          stopReason: "tool_calls",
        },
        { text: "Voilà ton CV.", toolCalls: [], stopReason: "stop" },
      ],
      `{"job":{"status":"success","urls":["${EXPORT_URL}"]}}`,
    );

    const exported: { url: string; mime: string }[] = [];
    await runMcpAgentLoop({
      host,
      provider: "openai",
      modelId: "gpt-4o",
      history: [{ role: "user", content: "exporte mon CV" }],
      vault: {},
      secrets: [],
      disabledKinds: [],
      fromWire: (s) => s,
      onText: () => {},
      onToolCall: () => {},
      onExportedFile: (url, mime) => {
        exported.push({ url, mime });
      },
    });

    // The host is handed the RAW signed URL to fetch + display.
    expect(exported).toEqual([{ url: EXPORT_URL, mime: "application/pdf" }]);
    // …but it must be GONE from the tool message the model sees (privacy).
    const toolMsg = seen.at(-1)?.messages.find((m) => m.role === "tool");
    expect(toolMsg?.content ?? "").not.toContain("X-Amz-Signature");
  });

  it("shows a fallback instead of a blank bubble when the model returns nothing", async () => {
    const { host } = fakeHost(
      [{ text: "", toolCalls: [], stopReason: "other" }],
      "",
    );
    const shown: string[] = [];
    await runMcpAgentLoop({
      host,
      provider: "google",
      modelId: "gemini-2.5-flash-lite",
      history: [{ role: "user", content: "crée une page notion" }],
      vault: {},
      secrets: [],
      disabledKinds: [],
      fromWire: (s) => s,
      onText: (content, pending) => {
        if (!pending) shown.push(content);
      },
      onToolCall: () => {},
    });
    expect(shown.at(-1)).toMatch(/aucune réponse/);
  });

  it("offers the tools in DETERMINISTIC (name-sorted) order — the prompt-cache prefix", async () => {
    const seen: { tools?: { name: string }[] }[] = [];
    const completeTools = vi.fn(async (payload: { tools?: { name: string }[] }) => {
      seen.push(payload);
      return { text: "ok", toolCalls: [], stopReason: "stop" as const };
    });
    const host = {
      completeTools,
      mcp: {
        list: async () => [],
        listTools: async () => [
          { name: "zeta__read", description: "", inputSchema: {}, serverId: "z" },
          { name: "alpha__read", description: "", inputSchema: {}, serverId: "a" },
          { name: "midway__read", description: "", inputSchema: {}, serverId: "m" },
        ],
        callTool: async () => ({ content: [] }),
      },
    } as unknown as Parameters<typeof runMcpAgentLoop>[0]["host"];
    await runMcpAgentLoop({
      host,
      provider: "openai",
      modelId: "gpt-5.5",
      history: [{ role: "user", content: "liste" }],
      vault: {},
      secrets: [],
      disabledKinds: [],
      fromWire: (s) => s,
      onText: () => {},
      onToolCall: () => {},
    });
    const names = (seen[0]?.tools ?? []).map((t) => t.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(names).toContain("alpha__read");
  });

  it("a hung NON-streamed model turn is stalled out instead of parking the loop", async () => {
    vi.useFakeTimers();
    try {
      const completeTools = vi.fn(() => new Promise<never>(() => {})); // never resolves
      const host = {
        completeTools,
        mcp: {
          list: async () => [],
          listTools: async () => [
            { name: "gmail__search", description: "", inputSchema: {}, serverId: "ipc" },
          ],
          callTool: async () => ({ content: [] }),
        },
      } as unknown as Parameters<typeof runMcpAgentLoop>[0]["host"];
      const done = runMcpAgentLoop({
        host,
        provider: "openai",
        modelId: "gpt-5.5",
        history: [{ role: "user", content: "cherche mes emails" }],
        vault: {},
        secrets: [],
        disabledKinds: [],
        fromWire: (s) => s,
        onText: () => {},
        onToolCall: () => {},
      });
      done.catch(() => {}); // avoids the unhandled rejection while the timers advance
      // Two budgets (the call + its single soft retry-stall) before the definitive failure.
      await vi.advanceTimersByTimeAsync(250_000);
      // Without the hard budget this HANGS forever; with it, the stall is classified and
      // reaches the store, which humanises it into an error bubble (humanizeSendError).
      await expect(done).rejects.toThrow(/MODEL_STALL/);
      expect(completeTools).toHaveBeenCalledTimes(2); // the call + ONE retry
    } finally {
      vi.useRealTimers();
    }
  });

  it("dedupes IDENTICAL calls within one turn (one dispatch, a pointer result for the twin)", async () => {
    const { host, callTool } = fakeHost(
      [
        {
          text: "",
          toolCalls: [
            { id: "a", name: "gmail__search", arguments: { query: "facture" } },
            { id: "b", name: "gmail__search", arguments: { query: "facture" } },
          ],
          stopReason: "tool_calls",
        },
        { text: "Fini.", toolCalls: [], stopReason: "stop" },
      ],
      "1 résultat",
    );
    await runMcpAgentLoop({
      host,
      provider: "openai",
      modelId: "gpt-5.5",
      history: [{ role: "user", content: "cherche la facture" }],
      vault: {},
      secrets: [],
      disabledKinds: [],
      fromWire: (s) => s,
      onText: () => {},
      onToolCall: () => {},
    });
    expect(callTool).toHaveBeenCalledTimes(1); // le jumeau n'est JAMAIS dispatché
  });

  it("a stalled turn is RETRIED once and the retried answer is kept", async () => {
    vi.useFakeTimers();
    try {
      let call = 0;
      const completeTools = vi.fn(() => {
        call += 1;
        if (call === 1) return new Promise<never>(() => {}); // 1er appel : pendu
        return Promise.resolve({ text: "Voici la réponse.", toolCalls: [], stopReason: "stop" as const });
      });
      const host = {
        completeTools,
        mcp: {
          list: async () => [],
          listTools: async () => [
            { name: "gmail__search", description: "", inputSchema: {}, serverId: "ipc" },
          ],
          callTool: async () => ({ content: [] }),
        },
      } as unknown as Parameters<typeof runMcpAgentLoop>[0]["host"];
      const shown: string[] = [];
      const done = runMcpAgentLoop({
        host,
        provider: "openai",
        modelId: "gpt-5.5",
        history: [{ role: "user", content: "cherche" }],
        vault: {},
        secrets: [],
        disabledKinds: [],
        fromWire: (s) => s,
        onText: (content, pending) => {
          if (!pending) shown.push(content);
        },
        onToolCall: () => {},
      });
      await vi.advanceTimersByTimeAsync(125_000);
      await done;
      expect(shown.at(-1)).toBe("Voici la réponse.");
    } finally {
      vi.useRealTimers();
    }
  });

  it("retries ONCE on a completely empty turn and keeps the retried answer", async () => {
    // The free tiers routinely return a zero-token completion under load — the retry
    // turns the dominant real-world failure class into a success (evals, 2026-07-24).
    const { host } = fakeHost(
      [
        { text: "", toolCalls: [], stopReason: "other" },
        { text: "Voici votre brief.", toolCalls: [], stopReason: "stop" },
      ],
      "",
    );
    const shown: string[] = [];
    await runMcpAgentLoop({
      host,
      provider: "openrouter",
      modelId: "google/gemma-4-26b-a4b-it:free",
      history: [{ role: "user", content: "prépare mon brief" }],
      vault: {},
      secrets: [],
      disabledKinds: [],
      fromWire: (s) => s,
      onText: (content, pending) => {
        if (!pending) shown.push(content);
      },
      onToolCall: () => {},
    });
    expect(shown.at(-1)).toBe("Voici votre brief.");
    expect(host.completeTools).toHaveBeenCalledTimes(2);
  });

  // ── Awareness (catalog) vs callability (loaded schemas) + load_tools ──────
});
