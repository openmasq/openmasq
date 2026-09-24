
import { describe, expect, it, vi } from "vitest";
import { unredact, type Vault } from "@openmasq/redact";
import type { CompleteToolsResult, } from "@openmasq/llm";
import { runMcpAgentLoop, } from "./mcpAgent";
import { fakeHost, } from "./mcpAgent.testkit";
import type { Host } from "../host";

describe("runMcpAgentLoop — redaction, stuck guards, result budget", () => {
  it("runs tools and never leaks real data to the model; restores it for display", async () => {
    const vault: Vault = {};
    const callTool = vi.fn(async () => ({
      content: [{ type: "text" as const, text: "From bob@corp.com" }],
    }));
    const seen: { messages: { role: string; content: string }[] }[] = [];
    // The tool result is redacted to a same-kind FAKE (pseudonymise), not a
    // `[REDACTED_…]` placeholder — so the 2nd model turn ECHOES back the fake email
    // it received, which the loop then de-redacts to the real address for display.
    const completeTools = vi.fn(async (payload: { messages: { role: string; content: string }[] }) => {
      seen.push(payload);
      if (seen.length === 1) {
        return {
          text: "",
          toolCalls: [{ id: "c1", name: "gmail__search", arguments: { q: "latest" } }],
          stopReason: "tool_calls" as const,
        };
      }
      const toolMsg = payload.messages.find((m) => m.role === "tool");
      const fake = (toolMsg?.content.match(/\S+@\S+/) ?? ["?"])[0];
      return { text: `Le dernier email vient de ${fake}`, toolCalls: [], stopReason: "stop" as const };
    });
    const host = {
      completeTools,
      mcp: {
        list: async () => [],
        add: async () => {},
        remove: async () => {},
        connect: async () => ({ id: "x", name: "x", url: "", connected: true, authorized: true }),
        disconnect: async () => {},
        listTools: async () => [
          { name: "gmail__search", description: "", inputSchema: {}, serverId: "ipc" },
        ],
        callTool,
      },
    } as unknown as Host;

    const shown: string[] = [];
    const handled = await runMcpAgentLoop({
      host,
      provider: "openai",
      modelId: "gpt-4o",
      apiKey: "sk",
      history: [{ role: "user", content: "qui a écrit en dernier ?" }],
      vault,
      secrets: [],
      disabledKinds: [],
      fromWire: (s) => unredact(s, vault),
      onText: (content, pending) => {
        if (!pending) shown.push(content);
      },
      onToolCall: () => {},
    });

    expect(handled).toBe(true);
    expect(callTool).toHaveBeenCalledTimes(1);
    expect(completeTools).toHaveBeenCalledTimes(2);

    // The real address was captured in the vault (redacted on the way back in).
    expect(Object.values(vault)).toContain("bob@corp.com");

    // The SECOND model turn must have received the tool result REDACTED — the real
    // address is gone, replaced by a same-kind FAKE email (never a leak).
    const toolMsg = seen[1].messages.find((m) => m.role === "tool");
    expect(toolMsg?.content).not.toContain("bob@corp.com");
    expect(toolMsg?.content).toMatch(/\S+@\S+/);

    // The final answer shown to the user is de-redacted back to the real address.
    expect(shown.at(-1)).toBe("Le dernier email vient de bob@corp.com");
  });

  it("does NOT hard-stop distinct searches that each return a valid EMPTY result", async () => {
    // The real bug: searching several customers by email, most legitimately "not
    // found" (`{"results":[]}`), tripped the stuck-guard (keyed on tool+result,
    // ignoring args) after 3 empties — killing legitimate exploration.
    const search = (id: string, q: string): CompleteToolsResult => ({
      text: "",
      toolCalls: [{ id, name: "gmail__search", arguments: { query: q } }],
      stopReason: "tool_calls",
    });
    const turns: CompleteToolsResult[] = [
      search("c1", "a@x.com"),
      search("c2", "b@x.com"),
      search("c3", "c@x.com"),
      search("c4", "d@x.com"),
      { text: "Aucun n'est client.", toolCalls: [], stopReason: "stop" },
    ];
    const { host, callTool } = fakeHost(turns, '{"results":[]}');
    const shown: string[] = [];
    const handled = await runMcpAgentLoop({
      host, provider: "openai", modelId: "gpt-4o",
      history: [{ role: "user", content: "sont-ils clients ?" }],
      vault: {}, secrets: [], disabledKinds: [],
      fromWire: (s) => s,
      onText: (c, pending) => { if (!pending) shown.push(c); },
      onToolCall: () => {},
    });
    expect(handled).toBe(true);
    expect(callTool).toHaveBeenCalledTimes(4); // all four ran — NOT hard-stopped at 3
    expect(shown.at(-1)).toBe("Aucun n'est client.");
    expect(shown.join("\n")).not.toContain("Boucle d'outils interrompue");
  });

  it("STILL hard-stops a genuine dead-end loop (same 'no matching operation' to every guess)", async () => {
    // The guard must keep firing when the tool keeps REJECTING the approach with the
    // same dead-end message across different guessed verbs (not a valid empty result).
    const guess = (id: string, intent: string): CompleteToolsResult => ({
      text: "",
      toolCalls: [{ id, name: "gmail__search", arguments: { intent, resource: "customer" } }],
      stopReason: "tool_calls",
    });
    const turns = [guess("c1", "update"), guess("c2", "modify"), guess("c3", "edit"), guess("c4", "patch")];
    const { host, callTool } = fakeHost(turns, "no matching operation for that intent");
    const shown: string[] = [];
    const handled = await runMcpAgentLoop({
      host, provider: "openai", modelId: "gpt-4o",
      history: [{ role: "user", content: "mets à jour le client" }],
      vault: {}, secrets: [], disabledKinds: [],
      fromWire: (s) => s,
      onText: (c, pending) => { if (!pending) shown.push(c); },
      onToolCall: () => {},
    });
    expect(handled).toBe(true);
    expect(callTool).toHaveBeenCalledTimes(3); // hard-stopped at STUCK_STOP = 3
    expect(shown.join("\n")).toContain("Boucle d'outils interrompue");
  });

  it("hard-stops a ONE-tool hammer whose args differ every time (each call 'productive')", async () => {
    // The gap the two other guards miss: a model calls the SAME tool over and over
    // with NEW args, each returning a real, non-dead-end result — so every call is
    // "productive" (never trips STUCK_STOP, even extends the turn budget) yet never
    // converges. The per-tool cap (MAX_SAME_TOOL = 8) is the productivity-blind
    // backstop. Measured on the eval bench (`run_python`/`execute_sql` at 9–15×).
    const probe = (id: string, n: number): CompleteToolsResult => ({
      text: "",
      // DISTINCT args each turn → newInput true → each call looks productive.
      toolCalls: [{ id, name: "posthog__exec", arguments: { intent: "read", page: n } }],
      stopReason: "tool_calls",
    });
    const turns = Array.from({ length: 15 }, (_, i) => probe(`c${i}`, i));
    // A REAL result each time (not empty, not a dead-end) — the point is that it
    // still stops despite every call being "productive". ⚠️ The tool is deliberately
    // an UNKNOWN-intent one (`exec`, not `search`): the measured hammer was
    // `execute_sql`/`run_python`, and a positively-read tool now has its own, higher
    // cap (see the batch-of-reads case below). Since the fail-closed default (unknown ⇒
    // write, audit 2026-08-10), such a tool CONFIRMS and requires a request to ACT — the
    // scenario therefore becomes an approved write, and the cap must hold just the same.
    const { host, callTool } = fakeHost(turns, "3 messages trouvés (page suivante disponible)", "posthog__exec");
    const shown: string[] = [];
    const handled = await runMcpAgentLoop({
      host, provider: "openai", modelId: "gpt-4o",
      history: [{ role: "user", content: "exécute la requête sur chaque page et mets à jour le rapport" }],
      vault: {}, secrets: [], disabledKinds: [],
      fromWire: (s) => s,
      onText: (c, pending) => { if (!pending) shown.push(c); },
      onToolCall: () => {},
      confirmWrite: async () => true,
    });
    expect(handled).toBe(true);
    // Dispatched AT the cap, not the whole turn budget. The 9th call is REFUSED with
    // the conclude-now note (soft degrade); the model insists on response 10 → hard stop.
    expect(callTool).toHaveBeenCalledTimes(8); // MAX_SAME_TOOL
    expect(shown.join("\n")).toContain("8 appels à **Exécution** (PostHog)");
  });

  it("un BATCH de lectures distinctes au-delà du cap ne tue PAS le tour (refus doux, puis réponse)", async () => {
    // Log 01/08: 11 distinct `get_file_info` emitted in ONE answer; the old backstop
    // aborted the WHOLE turn on the 9th call (« ⚠️ Limite atteinte ») while the first 8
    // results were enough to answer. Now: 8 dispatched, the following ones refused with
    // the instruction to conclude, and the next answer is delivered normally.
    const batch: CompleteToolsResult = {
      text: "",
      toolCalls: Array.from({ length: 11 }, (_, i) => ({
        id: `b${i}`,
        name: "posthog__exec",
        arguments: { page: i },
      })),
      stopReason: "tool_calls",
    };
    const done: CompleteToolsResult = { text: "Voici la liste complète.", toolCalls: [], stopReason: "stop" };
    const { host, callTool, seen } = fakeHost([batch, done], "3 messages trouvés", "posthog__exec");
    const shown: string[] = [];
    // Same switch as the test above: `exec` is now a write (fail-closed default) —
    // approved here, because this test pins the SOFT refusal beyond the cap.
    const handled = await runMcpAgentLoop({
      host, provider: "openai", modelId: "gpt-4o",
      history: [{ role: "user", content: "exécute la requête sur chaque page et mets à jour le rapport" }],
      vault: {}, secrets: [], disabledKinds: [],
      fromWire: (s) => s,
      onText: (c, pending) => { if (!pending) shown.push(c); },
      onToolCall: () => {},
      confirmWrite: async () => true,
    });
    expect(handled).toBe(true);
    expect(callTool).toHaveBeenCalledTimes(8); // the cap is dispatched, not exceeded
    const final = shown.join("\n");
    expect(final).toContain("Voici la liste complète.");
    expect(final).not.toContain("Limite atteinte"); // no more ⚠️ abort on a batch
    // Each refused call handed the MODEL the instruction to conclude.
    const lastPayload = JSON.stringify(seen.at(-1)?.messages ?? []);
    expect(lastPayload).toContain("Limite d'appels atteinte pour `posthog__exec`");
  });

  it("un batch de LECTURES part en entier — c'est le contexte qui borne, pas le compte", async () => {
    // Log of 03/08: « revue de ma boîte mail » → 1 search then 20 `get_message` in ONE
    // answer. The flat ceiling refused 12 of them, and the user read « la revue s'arrête
    // au milieu ». The 20 are positively annotated reads, pre-loaded IN PARALLEL: a
    // single chat round-trip, no refusal.
    const batch: CompleteToolsResult = {
      text: "",
      toolCalls: Array.from({ length: 20 }, (_, i) => ({
        id: `m${i}`,
        name: "gmail__get_message",
        arguments: { id: `msg-${i}` },
      })),
      stopReason: "tool_calls",
    };
    const done: CompleteToolsResult = { text: "Voici la revue.", toolCalls: [], stopReason: "stop" };
    const { host, callTool, seen } = fakeHost([batch, done], "Objet : facture", "gmail__get_message");
    const shown: string[] = [];
    const handled = await runMcpAgentLoop({
      host, provider: "openai", modelId: "gpt-4o",
      history: [{ role: "user", content: "revue de ma boîte mail" }],
      vault: {}, secrets: [], disabledKinds: [],
      fromWire: (s) => s,
      onText: (c, pending) => { if (!pending) shown.push(c); },
      onToolCall: () => {},
    });
    expect(handled).toBe(true);
    expect(callTool).toHaveBeenCalledTimes(20);
    expect(shown.join("\n")).toContain("Voici la revue.");
    expect(JSON.stringify(seen.at(-1)?.messages ?? [])).not.toContain("Limite d'appels atteinte");
  });

  it("…mais le VOLUME des résultats, lui, coupe — sinon le tour meurt en 400", async () => {
    // The raised read ceiling only holds because a second guard counts what really
    // enters the window: 20 headers fit, 20 attachments do not. Without that budget we
    // would trade a turn cut too early for a « context length exceeded », which costs
    // the WHOLE turn instead of its end.
    const batch: CompleteToolsResult = {
      text: "",
      toolCalls: Array.from({ length: 25 }, (_, i) => ({
        id: `h${i}`,
        name: "gmail__get_message",
        arguments: { id: `msg-${i}` },
      })),
      stopReason: "tool_calls",
    };
    const done: CompleteToolsResult = { text: "Réponse partielle.", toolCalls: [], stopReason: "stop" };
    // gpt-4o = 128k tokens ⇒ budget ≈ 256,000 characters; a wave of 10 × 60,000 already
    // exceeds it, so the second wave does not go out and the remaining 15 are refused.
    const huge = "objet facture ".repeat(4300); // ~60,000 chars.
    const { host, callTool, seen } = fakeHost([batch, done], huge, "gmail__get_message");
    const shown: string[] = [];
    const handled = await runMcpAgentLoop({
      host, provider: "openai", modelId: "gpt-4o",
      history: [{ role: "user", content: "lis tout" }],
      vault: {}, secrets: [], disabledKinds: [],
      fromWire: (s) => s,
      onText: (c, pending) => { if (!pending) shown.push(c); },
      onToolCall: () => {},
    });
    expect(handled).toBe(true);
    // Cut by volume, well before the read ceiling (30): a single wave goes out.
    expect(callTool.mock.calls.length).toBeGreaterThan(0);
    expect(callTool.mock.calls.length).toBeLessThanOrEqual(10);
    // …and the model received the instruction to conclude, not an aborted turn.
    expect(JSON.stringify(seen.at(-1)?.messages ?? [])).toContain("Volume de résultats maximal atteint");
    expect(shown.join("\n")).toContain("Réponse partielle.");
  });

  // The counterpart of the previous test: SEARCHING is not HAMMERING. A web search
  // opens successive pages, each one « productive » (new URL, new content) — the flat
  // ceiling of 8 cut a perfectly normal path, at the very moment the model had just
  // found the right lead (log of 27/07).
  it("laisse une RECHERCHE web aller bien au-delà du plafond des outils ordinaires", async () => {
    const nav = (id: string, n: number): CompleteToolsResult => ({
      text: "",
      toolCalls: [
        { id, name: "browser__browser_navigate", arguments: { url: `https://exemple${n}.fr/` } },
      ],
      stopReason: "tool_calls",
    });
    const turns = Array.from({ length: 30 }, (_, i) => nav(`n${i}`, i));
    const callTool = vi.fn(async () => ({
      content: [{ type: "text" as const, text: "### Page\n- Page Title: une page de plus" }],
    }));
    const host = {
      completeTools: vi.fn(async () => turns.shift() ?? { text: "", toolCalls: [], stopReason: "stop" }),
      mcp: {
        list: async () => [],
        add: async () => {},
        remove: async () => {},
        connect: async () => ({ id: "x", name: "x", url: "", connected: true, authorized: true }),
        disconnect: async () => {},
        listTools: async () => [
          { name: "browser__browser_navigate", description: "", inputSchema: {}, serverId: "ipc" },
        ],
        callTool,
      },
    } as unknown as Host;
    const shown: string[] = [];
    await runMcpAgentLoop({
      host, provider: "openai", modelId: "gpt-4o",
      history: [{ role: "user", content: "cherche des infos sur cette association et liste ses membres" }],
      vault: {}, secrets: [], disabledKinds: [],
      fromWire: (s) => s,
      onText: (c, pending) => { if (!pending) shown.push(c); },
      onToolCall: () => {},
    });
    // 20 = MAX_SAME_WEB_READ. The point of the test is the CONTRAST with 8: sterile
    // grazing is still cut by the two other guards (identical results, dead streak),
    // which do not apply here since every page is different.
    expect(callTool).toHaveBeenCalledTimes(20);
    // And the message says what happened, without sending the user off to change model.
    expect(shown.join("\n")).toContain("20 pages consultées");
    expect(shown.join("\n")).not.toMatch(/modèle plus capable/);
  });
});
