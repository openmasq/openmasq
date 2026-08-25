// The eval harness: a REAL prompt, through the REAL redaction engine, to a REAL model,
// driving the REAL `runMcpAgentLoop`. Only the MCP servers are simulated (`servers.ts`).
//
// No Electron: `completeWithTools` is plain Node (the desktop only reaches it over IPC),
// so an eval is a vitest file, not a Playwright run. That is the whole reason this level
// exists — it costs seconds and an API call, not minutes and an OAuth'd account.
//
// What it does NOT cover, by construction: the renderer, the IPC bridge, and main's own
// re-checks. Those are UX and a second boundary; an eval that passes here says the LOOP
// behaves, not that the app does.

import { completeWithTools } from "@openmasq/llm";
import type { ChatMessage, ProviderId, ToolDef } from "@openmasq/llm";
import { pseudonymize, unredact, type Vault } from "@openmasq/redact";
import { buildSystemContent } from "../send/buildWire";
import { runMcpAgentLoop } from "../agent/mcpAgent";
import type { Host } from "../host";
import { Transcript, isRouterProbe, type ToolArgs } from "./transcript";
import { qualify, resultFor, toolDefs, type FakeServer } from "./servers";

/** Env gate — mirrors `apps/desktop/e2e` (root rule 4: real calls cost real money). */
export const EVAL_KEY = process.env.OPENMASQ_EVAL_API_KEY || process.env.OPENAI_API_KEY;
export const EVAL_PROVIDER = (process.env.OPENMASQ_EVAL_PROVIDER || "openai") as ProviderId;
export const EVAL_MODEL = process.env.OPENMASQ_EVAL_MODEL || "gpt-4o-mini";
/** Only for `openai-compat` — a local/self-hosted model, or the mock server the harness's
 *  own smoke test uses to exercise this wiring without spending a call. */
export const EVAL_BASE_URL = process.env.OPENMASQ_EVAL_BASE_URL;

export interface EvalRun {
  /** The REAL prompt, exactly as a user would type it — PII included. The harness
   *  redacted it here, so the eval exercises redaction → model → un-redaction, not just
   *  the model. Hand-writing a pre-redacted prompt tests half the chain. */
  prompt: string;
  servers: FakeServer[];
  /** Scripted answer to the write-confirm gate (there is no UI here). Default: refuse —
   *  fail-closed, so a scenario that forgets to opt in cannot dispatch a write. */
  approveWrites?: boolean;
  /** Categories the MODEL is allowed to see in clear (the reveal gate's job). */
  disabledKinds?: string[];
  provider?: ProviderId;
  modelId?: string;
  apiKey?: string;
  baseUrl?: string;
  /** 0 by default: the point is to reduce variance, not to sample creativity. */
  temperature?: number;
}

export interface EvalResult {
  transcript: Transcript;
  /** fake → real. `Object.values` are the REALS — what must never reach the model. */
  vault: Vault;
  /** The wire-form prompt the model actually received (fakes substituted). */
  wirePrompt: string;
}

/**
 * Run ONE turn. Returns the transcript plus the vault the redaction minted, so a scenario
 * can assert `leaked(Object.values(vault))` without hard-coding a fake it can't predict
 * (the fakes are allocated per run and are deliberately not stable).
 */
export async function runEval(r: EvalRun): Promise<EvalResult> {
  const provider = r.provider ?? EVAL_PROVIDER;
  const modelId = r.modelId ?? EVAL_MODEL;
  const apiKey = r.apiKey ?? EVAL_KEY;
  const baseUrl = r.baseUrl ?? EVAL_BASE_URL;
  if (!apiKey) throw new Error("runEval: no API key — gate the suite on `EVAL_KEY` before calling.");

  const vault: Vault = {};
  const disabledKinds = r.disabledKinds ?? [];

  // The REAL engine, patterns + deterministic detectors (no AI detector: it needs a host,
  // and a second model call would make the eval's variance impossible to attribute).
  const red = await pseudonymize(r.prompt, { vault, disabledKinds });
  const wirePrompt = red.text;

  const toWire = (s: string) => ({ text: s });
  const fromWire = (s: string) => unredact(s, vault);

  const history: ChatMessage[] = [
    { role: "system", content: buildSystemContent(toWire, undefined, false) },
    { role: "user", content: wirePrompt },
  ];

  const t = new Transcript();
  const servers = r.servers;

  const host = {
    // The model seam. `payload.messages` IS the model's inbox — recording it here is what
    // makes `leaked()` a fact about the real call rather than about our own bookkeeping.
    completeTools: async (payload: {
      messages: ChatMessage[];
      tools: ToolDef[];
      toolChoice?: "auto" | "required";
    }) => {
      t.push({ t: "model:in", messages: payload.messages.map((m) => ({ role: m.role, content: String(m.content ?? "") })) });
      const callT0 = Date.now();
      const res = await completeWithTools({
        provider,
        model: modelId,
        messages: payload.messages,
        tools: payload.tools,
        apiKey,
        baseUrl,
        temperature: r.temperature ?? 0,
        toolChoice: payload.toolChoice,
      });
      t.push({
        t: "model:out",
        text: res.text ?? "",
        calls: (res.toolCalls ?? []).map((c) => ({ name: c.name, args: (c.arguments ?? {}) as ToolArgs })),
        ms: Date.now() - callT0,
        kind: isRouterProbe(payload) ? "router" : "turn",
      });
      return res;
    },
    mcp: {
      list: async () => [],
      add: async () => {},
      remove: async () => {},
      connect: async () => ({ id: "eval", name: "eval", url: "", connected: true, authorized: true }),
      disconnect: async () => {},
      listTools: async () => toolDefs(servers),
      // ⚠️ This is BELOW the RedactingMcpClient, so `call.arguments` are already
      // UN-redacted — the real values. That asymmetry with `completeTools` above is the
      // whole trust boundary, captured at the two points it actually exists.
      callTool: async (call: { name: string; arguments?: ToolArgs }) => {
        const args = call.arguments ?? {};
        t.push({ t: "tool:out", name: call.name, args });
        const text = resultFor(servers, call.name, args);
        return { content: [{ type: "text" as const, text }] };
      },
    },
  } as unknown as Host;

  await runMcpAgentLoop({
    host,
    provider,
    modelId,
    apiKey,
    baseUrl,
    history,
    vault,
    secrets: [],
    disabledKinds,
    fromWire,
    onText: (content, pending) => {
      if (!pending && content.trim()) t.push({ t: "answer", text: content });
    },
    onToolCall: () => {},
    // Re-redacted a tool result before it re-enters the model's context — the same
    // engine, the same vault. Omitting it would fall back to the regex default and the
    // eval would silently measure a weaker pipeline than the product ships.
    redactResult: async (text, v) => (await pseudonymize(text, { vault: v, disabledKinds })).text,
    onToolResult: (res) => t.push({ t: "tool:in", name: res.tool, text: res.summary ?? "" }),
    confirmWrite: async (info) => {
      const approved = r.approveWrites === true;
      // ⚠️ `WriteConfirmInfo.tool` is the BARE name (`send_email`) + `server` separately,
      // while every other event carries the NAMESPACED name. Re-qualify here so the
      // transcript speaks ONE vocabulary: a scenario cross-referencing `confirms()` with
      // `asked()` on a bare name silently never matches, and scores an open gate as a
      // missing one. Pinned by `smoke.eval.ts`.
      t.push({ t: "confirm", tool: qualify(info.server, info.tool), reason: info.reason, approved });
      return approved;
    },
  });

  return { transcript: t, vault, wirePrompt };
}
