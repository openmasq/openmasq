
import { describe, expect, it, vi } from "vitest";
import { unredact, type Vault } from "@openmasq/redact";
import type { CompleteToolsResult, ChatMessage } from "@openmasq/llm";
import { runMcpAgentLoop, writeKey, type WriteConfirmInfo } from "./mcpAgent";
import { writeHost } from "./mcpAgent.testkit";
import { ToolTimeoutError } from "./mcpAgentWatchdog";
import { INTERRUPTED_TOOL_RESULT, TIMED_OUT_WRITE_RESULT } from "./turnCheckpoint";
import type { Host } from "../host";

/**
 * ⛔ The Outlook duplicate (18/08). `send_email` returned « Unexpected end of JSON input »
 * — an EMPTY `202 Accepted` from Graph, so a mail ALREADY SENT. The loop retried the same
 * call, a SECOND mail went out, then the user was told the send had failed. The cause is
 * fixed at the root (`connectors/run.ts`), but it will come back in another form — a
 * timeout, a cut after the request — and a duplicated send or payment cannot be undone.
 *
 * The invariant: from the FIRST failure of a WRITE, the result handed to the model tells
 * it that the failure proves nothing and that it must not replay. A READ, on the other
 * hand, replays without risk — the generic note « déjà renvoyé 2 fois » is enough for it.
 */
describe("runMcpAgentLoop — une écriture qui échoue ne se rejoue pas", () => {
  function failingHost(toolName: string, description: string) {
    const callTool = vi.fn(async () => ({
      content: [{ type: "text" as const, text: "Unexpected end of JSON input" }],
      isError: true,
    }));
    let n = 0;
    const completeTools = vi.fn(async () =>
      n++ === 0
        ? { text: "", toolCalls: [{ id: "c1", name: toolName, arguments: { to: "a@b.fr" } }], stopReason: "tool_calls" as const }
        : { text: "fini", toolCalls: [], stopReason: "stop" as const },
    );
    const host = {
      completeTools,
      mcp: {
        listTools: async () => [{ name: toolName, description, inputSchema: {}, serverId: "ipc" }],
        callTool,
      },
    } as unknown as Host;
    return { host, completeTools };
  }

  const run = (host: Host) =>
    runMcpAgentLoop({
      host,
      provider: "openai" as const,
      modelId: "gpt-4o",
      history: [{ role: "user" as const, content: "envoie un mail" }],
      vault: {} as Vault,
      secrets: [],
      disabledKinds: [],
      fromWire: (s: string) => s,
      onText: () => {},
      onToolCall: () => {},
      confirmWrite: async () => true,
    });

  const toolMessage = (completeTools: ReturnType<typeof vi.fn>): string => {
    const last = completeTools.mock.calls.at(-1)![0] as { messages: ChatMessage[] };
    const msg = last.messages.find((m) => m.role === "tool");
    return String((msg as { content?: unknown })?.content ?? "");
  };

  it("le PREMIER échec d'une écriture dit de ne pas relancer, et pourquoi", async () => {
    const { host, completeTools } = failingHost("microsoft-outlook__send_email", "Envoyer un email");
    await run(host);
    const text = toolMessage(completeTools);
    expect(text).toContain("Ne relance");
    expect(text).toMatch(/ne prouve PAS/i); // l'effet a pu avoir lieu
  });

  it("une LECTURE qui échoue ne reçoit PAS cette note (elle se rejoue sans risque)", async () => {
    const { host, completeTools } = failingHost("microsoft-outlook__list_recent", "Lister les messages récents");
    await run(host);
    expect(toolMessage(completeTools)).not.toMatch(/est une ÉCRITURE/);
  });
});

describe("runMcpAgentLoop — write confirmation", () => {
  const baseParams = (host: Host) => ({
    host,
    provider: "openai" as const,
    modelId: "gpt-4o",
    history: [{ role: "user" as const, content: "mets à jour le client" }],
    vault: {} as Vault,
    secrets: [],
    disabledKinds: [],
    fromWire: (s: string) => s,
    onText: () => {},
    onToolCall: () => {},
  });

  it("skips the server call when the user refuses a write", async () => {
    const { host, callTool } = writeHost();
    const seenMsgs: string[] = [];
    await runMcpAgentLoop({
      ...baseParams(host),
      confirmWrite: async () => false,
      onText: () => {},
      // capture the tool message fed back to the model
      // (via a spy on completeTools' payload is overkill; assert callTool instead)
    });
    void seenMsgs;
    expect(callTool).not.toHaveBeenCalled();
  });

  it("runs the write when the user approves", async () => {
    const { host, callTool } = writeHost();
    const confirmWrite = vi.fn(async () => true);
    await runMcpAgentLoop({ ...baseParams(host), confirmWrite });
    expect(confirmWrite).toHaveBeenCalledTimes(1);
    expect(callTool).toHaveBeenCalledTimes(1);
  });

  it("hard-stops repeated declined writes before the turn cap (no infinite grind)", async () => {
    // A model that keeps trying the SAME write while every confirm is declined —
    // e.g. the popup was dismissed by navigating away, so each write auto-declines.
    // Must terminate at the dead-streak cap (5), not grind through the 14-turn budget.
    let n = 0;
    const completeTools = vi.fn(async () => ({
      text: "",
      toolCalls: [
        { id: `w${n++}`, name: "stripe__stripe_api_write", arguments: { stripe_api_operation_id: "PostCustomers" } },
      ],
      stopReason: "tool_calls" as const,
    }));
    const host = {
      completeTools,
      mcp: {
        listTools: async () => [
          { name: "stripe__stripe_api_write", description: "Execute a Stripe write", inputSchema: {}, serverId: "ipc" },
        ],
        callTool: vi.fn(),
      },
    } as unknown as Host;
    let finalText = "";
    const handled = await runMcpAgentLoop({
      ...baseParams(host),
      confirmWrite: async () => false,
      onText: (t: string, pending?: boolean) => {
        if (!pending) finalText = t;
      },
    });
    expect(handled).toBe(true);
    expect(completeTools).toHaveBeenCalledTimes(5); // stopped at MAX_CONSECUTIVE_DEAD, not 14
    expect(finalText).toMatch(/interrompue|Limite d'appels/);
  });

  it("does not prompt when no confirmWrite hook is wired", async () => {
    const { host, callTool } = writeHost();
    await runMcpAgentLoop({ ...baseParams(host) });
    expect(callTool).toHaveBeenCalledTimes(1);
  });

  // Retry-safety (Option A): a "Réessayer" re-runs the whole turn, so a side-effecting
  // call that already SUCCEEDED must not fire a second time. The loop keys writes on
  // (turnId, tool, wire args) and skips one whose key is already in the conversation
  // ledger. These pin: record-on-success, skip-on-replay, and turn-scoping.
  const ARGS = { stripe_api_operation_id: "PostCustomers" };
  const KEY = writeKey("turn-1", "stripe__stripe_api_write", ARGS);

  it("records a SUCCEEDED write in the ledger, keyed on (turnId, tool, args)", async () => {
    const { host, callTool } = writeHost();
    const done: string[] = [];
    await runMcpAgentLoop({
      ...baseParams(host),
      confirmWrite: async () => true,
      turnId: "turn-1",
      writeLedgerHas: () => false,
      onWriteDone: (k: string) => done.push(k),
    });
    expect(callTool).toHaveBeenCalledTimes(1);
    expect(done).toEqual([KEY]); // exactly the key a retry will look up
  });

  it("SKIPS a write already in the ledger — no dispatch, no confirm, model told « déjà effectué »", async () => {
    const { host, callTool } = writeHost();
    const confirmWrite = vi.fn(async () => true);
    const results: { tool: string; ok: boolean; note?: string }[] = [];
    const handled = await runMcpAgentLoop({
      ...baseParams(host),
      confirmWrite,
      turnId: "turn-1",
      writeLedgerHas: (k: string) => k === KEY, // the failed attempt already ran it
      onToolResult: (r: { tool: string; ok: boolean; note?: string }) => results.push(r),
    });
    expect(handled).toBe(true);
    expect(callTool).not.toHaveBeenCalled(); // the real action did NOT re-run
    expect(confirmWrite).not.toHaveBeenCalled(); // and the user was NOT re-prompted
    expect(results.some((r) => r.ok && r.note === "déjà effectué")).toBe(true);
  });

  it("a DIFFERENT turn re-runs the same write (idempotency is turn-scoped)", async () => {
    const { host, callTool } = writeHost();
    const oldTurnKey = writeKey("turn-OLD", "stripe__stripe_api_write", ARGS);
    await runMcpAgentLoop({
      ...baseParams(host),
      confirmWrite: async () => true,
      turnId: "turn-NEW",
      writeLedgerHas: (k: string) => k === oldTurnKey, // ledger holds only the OLD turn's key
    });
    expect(callTool).toHaveBeenCalledTimes(1); // new turn's key differs → the write runs
  });

  it("no turnId ⇒ idempotency is inert (unchanged behaviour)", async () => {
    const { host, callTool } = writeHost();
    const onWriteDone = vi.fn();
    await runMcpAgentLoop({
      ...baseParams(host),
      confirmWrite: async () => true,
      writeLedgerHas: () => true, // even a "hit" is ignored without a turnId
      onWriteDone,
    });
    expect(callTool).toHaveBeenCalledTimes(1);
    expect(onWriteDone).not.toHaveBeenCalled();
  });

  // Regression: Stop must release the loop even when it is parked on a blocking
  // await that does NOT observe the signal on its own (a confirm dialog left open,
  // or an MCP dispatch with no server cancel channel). Without raceAbort these
  // awaits would hang forever and the test would time out.
  it("aborts immediately when Stop fires while awaiting the write confirmation", async () => {
    const { host, callTool } = writeHost();
    const controller = new AbortController();
    const confirmWrite = vi.fn(() => {
      controller.abort(); // Stop pressed while the dialog is open …
      return new Promise<boolean>(() => {}); // … and the dialog never resolves
    });
    const handled = await runMcpAgentLoop({ ...baseParams(host), signal: controller.signal, confirmWrite });
    expect(handled).toBe(true); // finalized, not hung
    expect(confirmWrite).toHaveBeenCalledTimes(1);
    expect(callTool).not.toHaveBeenCalled(); // never dispatched
  });

  it("aborts a hung tool dispatch instead of waiting for it to settle", async () => {
    const { host } = writeHost();
    const controller = new AbortController();
    const callTool = vi.fn(() => {
      controller.abort(); // Stop pressed during the (un-cancellable) dispatch …
      return new Promise<never>(() => {}); // … and the server never replies
    });
    (host.mcp as unknown as { callTool: unknown }).callTool = callTool;
    const handled = await runMcpAgentLoop({
      ...baseParams(host),
      signal: controller.signal,
      confirmWrite: async () => true,
    });
    expect(handled).toBe(true); // released, not hung on the pending dispatch
    expect(callTool).toHaveBeenCalledTimes(1);
  });

  it("shows the confirm dialog the REAL (un-redacted) args, not the model's fakes", async () => {
    // The model produced a FAKE name ("Manon Brivetonyv"); the real assignee is
    // "Manon Brivet". The confirm hook must see REAL (what will actually be written);
    // the server call must still receive the model's ORIGINAL (wire) args.
    const callTool = vi.fn(
      async (_call: { name: string; arguments: Record<string, unknown> }) => ({
        content: [{ type: "text" as const, text: "{\"ok\":true}" }],
      }),
    );
    const turns: CompleteToolsResult[] = [
      {
        text: "",
        toolCalls: [
          { id: "w1", name: "linear__update_issue", arguments: { assignee: "Manon Brivetonyv", id: "TES-5" } },
        ],
        stopReason: "tool_calls",
      },
      { text: "fini", toolCalls: [], stopReason: "stop" },
    ];
    const host = {
      completeTools: vi.fn(async () => turns.shift() ?? { text: "", toolCalls: [], stopReason: "stop" }),
      mcp: {
        list: async () => [],
        add: async () => {},
        remove: async () => {},
        connect: async () => ({ id: "x", name: "x", url: "", connected: true, authorized: true }),
        disconnect: async () => {},
        listTools: async () => [
          { name: "linear__update_issue", description: "Update an issue", inputSchema: {}, serverId: "ipc" },
        ],
        callTool,
      },
    } as unknown as Host;

    const confirmWrite = vi.fn(async (_info: WriteConfirmInfo) => true);
    await runMcpAgentLoop({
      ...baseParams(host),
      // Un-redaction: the fake maps back to the real assignee.
      fromWire: (s: string) => s.replace("Manon Brivetonyv", "Manon Brivet"),
      confirmWrite,
    });

    // The dialog saw the REAL name…
    expect(confirmWrite).toHaveBeenCalledTimes(1);
    expect(confirmWrite.mock.calls[0][0].args).toEqual({ assignee: "Manon Brivet", id: "TES-5" });
    // …while the server received the model's ORIGINAL wire args (untouched).
    expect(callTool.mock.calls[0][0].arguments).toEqual({ assignee: "Manon Brivetonyv", id: "TES-5" });
  });
});

describe("runMcpAgentLoop — resume-not-replay (Option B)", () => {
  const base = (host: Host) => ({
    host,
    provider: "openai" as const,
    modelId: "gpt-4o",
    history: [{ role: "user" as const, content: "fais le rapport et envoie-le" }],
    vault: {} as Vault,
    secrets: [],
    disabledKinds: [],
    fromWire: (s: string) => s,
    onText: () => {},
    onToolCall: () => {},
  });

  it("RESUME: seeds a prior attempt's transcript, so a COMPLETED call is NOT re-run", async () => {
    const callTool = vi.fn(async () => ({ content: [{ type: "text" as const, text: "{}" }] }));
    // The model, on resume, sees the read already done and goes straight to a final answer.
    const completeTools = vi.fn(async (_opts: { messages: ChatMessage[] }) => ({ text: "voici le rapport", toolCalls: [], stopReason: "stop" as const }));
    const host = {
      completeTools,
      mcp: {
        listTools: async () => [
          { name: "posthog__execute-sql", description: "run sql", inputSchema: {}, serverId: "posthog" },
        ],
        callTool,
      },
    } as unknown as Host;
    const resumeTranscript: ChatMessage[] = [
      { role: "assistant", content: "", toolCalls: [{ id: "t1", name: "posthog__execute-sql", arguments: { query: "SELECT 1" } }] },
      { role: "tool", toolCallId: "t1", content: "42 utilisateurs actifs" },
    ];
    await runMcpAgentLoop({ ...base(host), resumeTranscript });
    // The already-completed query is NOT dispatched again…
    expect(callTool).not.toHaveBeenCalled();
    // …and the model saw the prior transcript (so it could continue from it).
    const sent = completeTools.mock.calls[0][0].messages;
    expect(sent.some((m) => m.role === "assistant" && m.toolCalls?.some((c) => c.name === "posthog__execute-sql"))).toBe(true);
    expect(sent.some((m) => m.role === "tool" && m.content.includes("42 utilisateurs actifs"))).toBe(true);
  });

  it("CHECKPOINT: emits the accumulated transcript at each turn boundary", async () => {
    const { host } = writeHost(); // one write turn, then a stop
    const transcripts: ChatMessage[][] = [];
    await runMcpAgentLoop({
      ...base(host),
      confirmWrite: async () => true,
      onResumeTranscript: (t: ChatMessage[]) => transcripts.push(t),
    });
    expect(transcripts.length).toBeGreaterThan(0);
    const last = transcripts[transcripts.length - 1];
    // The checkpoint is a replayable pair: the assistant tool-call turn + its result.
    expect(last.some((m) => m.role === "assistant" && (m.toolCalls?.length ?? 0) > 0)).toBe(true);
    expect(last.some((m) => m.role === "tool")).toBe(true);
  });

  it("no resumeTranscript ⇒ a normal fresh turn (the write runs)", async () => {
    const { host, callTool } = writeHost();
    await runMcpAgentLoop({ ...base(host), confirmWrite: async () => true });
    expect(callTool).toHaveBeenCalledTimes(1);
  });
});

describe("runMcpAgentLoop — live-derived operation fallback", () => {
  it("derives the write operationId when the connector search returns 'no matching operations'", async () => {
    const NONE = "No matching operations found in OpenAPI spec version 2026-07-01.preview.";
    const OPS = "## PostCustomersCustomer\n  POST /v1/customers/{customer}\n  Update a customer";
    let n = 0;
    const callTool = vi.fn(async () => {
      n += 1;
      // 1st call = the model's search (miss); subsequent = the resolver's raw probes.
      return { content: [{ type: "text" as const, text: n === 1 ? NONE : OPS }] };
    });
    const turns: CompleteToolsResult[] = [
      {
        text: "",
        toolCalls: [
          { id: "s1", name: "stripe__stripe_api_search", arguments: { intent: "update customer name", resource: "customer" } },
        ],
        stopReason: "tool_calls",
      },
      { text: "ok", toolCalls: [], stopReason: "stop" },
    ];
    const seen: { messages: { role: string; content: string }[] }[] = [];
    const completeTools = vi.fn(async (payload: { messages: { role: string; content: string }[] }) => {
      seen.push(payload);
      return turns.shift() ?? { text: "", toolCalls: [], stopReason: "stop" };
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
          { name: "stripe__stripe_api_search", description: "", inputSchema: {}, serverId: "ipc" },
          { name: "stripe__stripe_api_write", description: "", inputSchema: {}, serverId: "ipc" },
        ],
        callTool,
      },
    } as unknown as Host;

    await runMcpAgentLoop({
      host,
      provider: "openai",
      modelId: "gpt-4o",
      history: [{ role: "user", content: "mets à jour le client" }],
      vault: {},
      secrets: [],
      disabledKinds: [],
      fromWire: (s) => s,
      onText: () => {},
      onToolCall: () => {},
    });

    // The tool message fed to the 2nd model turn carries the derived operationId + write tool.
    const toolMsg = seen[1].messages.find((m) => m.role === "tool");
    expect(toolMsg?.content).toContain("PostCustomersCustomer");
    expect(toolMsg?.content).toContain("stripe__stripe_api_write");
  });
});

describe("écriture dispatchée sans réponse — l'issue INCONNUE est scellée (audit 2026-08-10)", () => {
  // The scenario `turnCheckpoint.ts` claims to cover but which was only covered for a
  // process crash: a user Stop (or a tool timeout) during an ALREADY dispatched write.
  // The e-mail may have gone out; a transcript where the call « n'a pas eu lieu » makes
  // the write be re-emitted on the retry. Two legs: the seal + the checkpoint.
  const params = (host: Host) => ({
    host,
    provider: "openai" as const,
    modelId: "gpt-4o",
    history: [{ role: "user" as const, content: "mets à jour le client" }],
    vault: {} as Vault,
    secrets: [],
    disabledKinds: [],
    fromWire: (s: string) => s,
    onText: () => {},
    onToolCall: () => {},
  });

  it("un Stop pendant le dispatch SCELLE l'appel en vol et CHECKPOINT le transcript", async () => {
    const { host } = writeHost();
    const controller = new AbortController();
    const callTool = vi.fn(() => {
      controller.abort(); // Stop pressé pendant le dispatch (non annulable) …
      return new Promise<never>(() => {}); // … et le serveur ne répond jamais
    });
    (host.mcp as unknown as { callTool: unknown }).callTool = callTool;
    const checkpoints: ChatMessage[][] = [];
    const handled = await runMcpAgentLoop({
      ...params(host),
      signal: controller.signal,
      confirmWrite: async () => true,
      turnId: "turn-1",
      onResumeTranscript: (t: ChatMessage[]) => checkpoints.push(t),
    });
    expect(handled).toBe(true);
    // The checkpoint IS laid (before, a Stop exited without checkpointing at all) …
    expect(checkpoints.length).toBeGreaterThan(0);
    const last = checkpoints.at(-1)!;
    // … and the dispatched call is sealed there as « issue inconnue », in its place in the transcript.
    const sealed = last.find((m) => m.role === "tool" && m.toolCallId === "w1");
    expect(sealed?.content).toBe(INTERRUPTED_TOOL_RESULT);
    expect(sealed?.content).toContain("PEUT-ÊTRE abouti");
  });

  it("un TIMEOUT d'écriture est rendu au modèle comme issue INCONNUE, jamais comme un échec à refaire", async () => {
    const { host, completeTools } = writeHost();
    const callTool = vi.fn(() =>
      Promise.reject(new ToolTimeoutError("stripe_api_write", 120_000)),
    );
    (host.mcp as unknown as { callTool: unknown }).callTool = callTool;
    const handled = await runMcpAgentLoop({
      ...params(host),
      confirmWrite: async () => true,
      turnId: "turn-1",
    });
    expect(handled).toBe(true);
    // The turn continues (not a Stop): the next model answer receives the tool result —
    // which must forbid re-emission, not just announce « Délai dépassé » flatly.
    const second = (completeTools.mock.calls.at(-1) as unknown[])[0] as {
      messages: { role: string; toolCallId?: string; content: string }[];
    };
    const toolMsg = second.messages.find((m) => m.role === "tool" && m.toolCallId === "w1");
    expect(toolMsg?.content).toBe(TIMED_OUT_WRITE_RESULT);
    expect(toolMsg?.content).toContain("NE RELANCE PAS");
  });

  it("un timeout de LECTURE garde l'erreur ordinaire — seule une écriture porte l'issue inconnue", async () => {
    // A replayed read is riskless; the « ne relance pas » message would be over-blocking.
    // The guard is `idemKey` (an identified write), not the error type.
    const callTool = vi.fn(() => Promise.reject(new ToolTimeoutError("gmail_search", 120_000)));
    const turns: CompleteToolsResult[] = [
      {
        text: "",
        toolCalls: [{ id: "r1", name: "gmail__search", arguments: { q: "facture" } }],
        stopReason: "tool_calls",
      },
      { text: "fini", toolCalls: [], stopReason: "stop" },
    ];
    const completeTools = vi.fn(async () => turns.shift() ?? { text: "", toolCalls: [], stopReason: "stop" });
    const host = {
      completeTools,
      mcp: {
        list: async () => [],
        listTools: async () => [
          { name: "gmail__search", description: "Search mail", inputSchema: {}, serverId: "ipc" },
        ],
        callTool,
      },
    } as unknown as Host;
    await runMcpAgentLoop({ ...params(host), turnId: "turn-1" });
    const second = (completeTools.mock.calls.at(-1) as unknown[])[0] as {
      messages: { role: string; toolCallId?: string; content: string }[];
    };
    const toolMsg = second.messages.find((m) => m.role === "tool" && m.toolCallId === "r1");
    expect(toolMsg?.content).not.toBe(TIMED_OUT_WRITE_RESULT);
  });
});

describe("resolveOperation — les sondes passent par le client redacting (audit 2026-08-10)", () => {
  // Before: `resolveOperation` called `p.host.mcp.callTool` DIRECTLY — the only outgoing
  // path without the two legs of rule 11. A fake laid down by the model in `resource`
  // left as-is for the real server, and the server's output was re-injected verbatim
  // into the model message. The probes now go through the same client as any outgoing
  // call: args un-redacted, result re-redacted.
  it("une sonde de découverte part UN-redacted — jamais le faux vers le vrai serveur", async () => {
    const VAULT: Vault = { "Oslen Group": "Karl Studio" }; // fake → real
    const discovery = [
      "## PostCustomersCustomer",
      "POST /v1/customers/{customer}",
      "Met à jour un client existant",
    ].join("\n");
    let dispatches = 0;
    const callTool = vi.fn(async () => {
      dispatches += 1;
      return dispatches === 1
        ? { content: [{ type: "text" as const, text: "no matching operations found" }] }
        : { content: [{ type: "text" as const, text: discovery }] };
    });
    const turns: CompleteToolsResult[] = [
      {
        text: "",
        toolCalls: [
          {
            id: "s1",
            name: "stripe__stripe_api_search",
            // WIRE args: the model only knows the FAKE.
            arguments: { intent: "update customer name", resource: "Oslen Group" },
          },
        ],
        stopReason: "tool_calls",
      },
      { text: "fini", toolCalls: [], stopReason: "stop" },
    ];
    const completeTools = vi.fn(async () => turns.shift() ?? { text: "", toolCalls: [], stopReason: "stop" });
    const host = {
      completeTools,
      mcp: {
        list: async () => [],
        listTools: async () => [
          { name: "stripe__stripe_api_search", description: "Search the API", inputSchema: {}, serverId: "ipc" },
          { name: "stripe__stripe_api_write", description: "Execute a write", inputSchema: {}, serverId: "ipc" },
        ],
        callTool,
      },
    } as unknown as Host;
    await runMcpAgentLoop({
      host,
      provider: "openai" as const,
      modelId: "gpt-4o",
      history: [{ role: "user" as const, content: "mets à jour le client" }],
      vault: VAULT,
      secrets: [],
      disabledKinds: [],
      fromWire: (s: string) => unredact(s, VAULT),
      onText: () => {},
      onToolCall: () => {},
    });
    // The resolver did probe (at least one call after the model's) …
    expect(callTool.mock.calls.length).toBeGreaterThan(1);
    // … and EVERY probe carries the REAL value, not the fake (rule 11's outgoing leg).
    const probes = callTool.mock.calls.slice(1) as unknown as Array<[{ arguments: Record<string, unknown> }]>;
    for (const [probe] of probes) {
      expect(probe.arguments.resource).toBe("Karl Studio");
    }
    // The derived operation is handed back to the model (the fallback still works).
    const second = (completeTools.mock.calls.at(-1) as unknown[])[0] as {
      messages: { role: string; toolCallId?: string; content: string }[];
    };
    const toolMsg = second.messages.find((m) => m.role === "tool" && m.toolCallId === "s1");
    expect(toolMsg?.content).toContain("PostCustomersCustomer");
  });
});
