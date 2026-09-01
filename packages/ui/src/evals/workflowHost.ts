// The mock `Host` behind the PROCESS harness (`workflow.ts`).
//
// Everything the store touches is real except the endpoints: the model is reached
// through the REAL provider clients (`streamChat`/`completeWithTools` — real HTTP, so
// pointing them at `mockModel.ts` or at a live small model is the same wiring), the MCP
// tools are the fixture fleet, and the "IA locale" detector is a DICTIONARY NER — which
// is what lets a free deterministic run redact names/companies/places exactly like
// the shipped local engine would (the regex `patterns` engine alone cannot detect a
// free-form name, so without this the redaction-rules workflows would test nothing).

import { completeWithTools, streamChat } from "@openmasq/llm";
import type { ProviderId } from "@openmasq/llm";
import type { Detection } from "@openmasq/redact";
import type { CompleteToolsPayload, ChatHandlers, StartChatPayload, Host } from "../host";
import { isRouterProbe, type Transcript, type ToolArgs } from "./transcript";
import { resultFor, toolDefs, type FakeServer } from "./servers";
import { lastRealPy, realFetchMany, realPyEnabled, realWebEnabled, runRealPython } from "./realWorld";

/** Which model the workflow talks to. Free mode = `openai-compat` + `mockModel().url`;
 *  eval mode = a real provider + key. The store only injects `baseUrl` for
 *  `openai-compat`, so for a real provider the HOST injects the key/baseUrl here —
 *  mirroring desktop main, where the encrypted store does it. */
export interface WorkflowModel {
  provider: ProviderId;
  modelId: string;
  apiKey?: string;
  baseUrl?: string;
}

/** A deterministic "IA locale" detector: verbatim spans from a fixed entity list.
 *  Case-insensitive, word-ish boundaries, longest-first (so "Karl Studio" wins over a
 *  hypothetical "Karl"). Categories use the engine vocabulary (name/company/location…). */
export function dictionaryNer(entities: Record<string, string>): (text: string) => Detection[] {
  const entries = Object.entries(entities).sort((a, b) => b[0].length - a[0].length);
  return (text: string) => {
    const found: Detection[] = [];
    const taken: [number, number][] = [];
    for (const [value, category] of entries) {
      const re = new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      for (const m of text.matchAll(re)) {
        const s = m.index ?? 0;
        const e = s + m[0].length;
        if (taken.some(([ts, te]) => s < te && e > ts)) continue;
        taken.push([s, e]);
        found.push({ value: m[0], category });
      }
    }
    return found;
  };
}

export interface WorkflowHostOpts {
  servers: FakeServer[];
  model: WorkflowModel;
  transcript: Transcript;
  /** Code-interpreter fixture. Present ⇒ the loop offers `run_python`; the CODE it
   *  receives is recorded as a `tool:out` (it is intercepted, never dispatched via
   *  `mcp.callTool`, so the transcript would otherwise miss it entirely). */
  python?: (code: string) => { ok: boolean; stdout: string; stderr: string; images: { name: string; base64: string }[]; files: { name: string; base64: string; mime: string }[] };
  /** Entity dictionary for the local NER (absent ⇒ no `detectLocalPii`, regex only). */
  ner?: Record<string, string>;
  /** Artificial NER latency (ms) — opens a testable pre-model window. */
  nerDelayMs?: number;
  /** Overrides a fixture's canned answer for one namespaced tool (scenario-local). */
  toolResult?: (name: string, args: ToolArgs) => string | undefined;
  /** Canned pages for the `web_fetch_many` intercepted tool (url → page text).
   *  Present ⇒ `host.web` is wired and the tool is offered. */
  webPages?: Record<string, string>;
}

/** Build the mock Host. Pure assembly — no jsdom/React here. */
export function makeWorkflowHost(o: WorkflowHostOpts): Host {
  const { transcript: t, model } = o;
  const record = (messages: { role: string; content: unknown }[]) =>
    t.push({
      t: "model:in",
      messages: messages.map((m) => ({ role: m.role, content: typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? "") })),
    });

  const host: Partial<Host> = {
    ...(o.webPages
      ? {
          web: {
            // REAL WORLD opt-in (OPENMASQ_EVAL_REAL_WEB=1): real GETs, sanitized
            // by the PRODUCT pipeline (`htmlToText`) — the `webPages` fixtures then
            // only serve to offer the tool and for mock mode (satisfiability).
            fetchMany: async (urls: string[]) => {
              for (const url of urls) t.push({ t: "tool:out", name: "web_fetch_many", args: { url } });
              if (realWebEnabled()) return realFetchMany(urls);
              return urls.map((url) => {
                const text = o.webPages![url];
                return text != null
                  ? { url, ok: true, text }
                  : { url, ok: false, error: "404" };
              });
            },
          },
        }
      : {}),
    // Plain (non-agent) streaming — the REAL provider stream client.
    startChat(payload: StartChatPayload, handlers: ChatHandlers): () => void {
      record(payload.messages);
      let cancelled = false;
      void (async () => {
        try {
          const gen = streamChat({
            provider: payload.provider,
            model: payload.model,
            messages: payload.messages,
            apiKey: payload.apiKey ?? model.apiKey ?? "mock-key",
            baseUrl: payload.baseUrl ?? model.baseUrl,
            temperature: payload.temperature ?? 0,
          });
          let acc = "";
          // MANUAL iteration (not for-await) to capture the generator's RETURN
          // value — the token usage — the same way the desktop main does.
          let r = await gen.next();
          while (!r.done) {
            if (cancelled) return;
            acc += r.value;
            handlers.onChunk(r.value);
            r = await gen.next();
          }
          t.usage.modelTurns += 1;
          const u = r.value as { usage?: { inputTokens?: number; outputTokens?: number; cachedInputTokens?: number } } | undefined;
          t.usage.inputTokens += u?.usage?.inputTokens ?? 0;
          t.usage.outputTokens += u?.usage?.outputTokens ?? 0;
          t.usage.cachedTokens += u?.usage?.cachedInputTokens ?? 0;
          t.push({ t: "model:out", text: acc, calls: [] });
          handlers.onDone();
        } catch (e) {
          handlers.onError(e instanceof Error ? e.message : String(e));
        }
      })();
      return () => {
        cancelled = true;
      };
    },

    // Agentic tool turn — the REAL non-streaming tools client.
    async completeTools(payload: CompleteToolsPayload) {
      record(payload.messages);
      const callT0 = Date.now();
      const res = await completeWithTools({
        provider: payload.provider,
        model: payload.model,
        messages: payload.messages,
        tools: payload.tools,
        apiKey: payload.apiKey ?? model.apiKey ?? "mock-key",
        baseUrl: payload.baseUrl ?? model.baseUrl,
        temperature: payload.temperature ?? 0,
        toolChoice: payload.toolChoice,
      });
      t.usage.modelTurns += 1;
      t.usage.inputTokens += res.usage?.inputTokens ?? 0;
      t.usage.outputTokens += res.usage?.outputTokens ?? 0;
      t.usage.cachedTokens += res.usage?.cachedInputTokens ?? 0;
      t.push({
        t: "model:out",
        text: res.text ?? "",
        calls: (res.toolCalls ?? []).map((c) => ({ name: c.name, args: (c.arguments ?? {}) as ToolArgs })),
        ms: Date.now() - callT0,
        kind: isRouterProbe(payload) ? "router" : "turn",
      });
      return res;
    },

    // Renderer-side key registry: every provider "configured", so preflight never
    // blocks a scenario on a missing key (the harness injects the real one above).
    keys: {
      configured: async () => [model.provider],
      set: async () => {},
      clear: async () => {},
      importLegacy: async () => {},
    },

    // The fixture MCP. ⚠️ `callTool` sits BELOW the loop's RedactingMcpClient, so the
    // args recorded here are the UN-redacted REAL values — one half of rule 11; the
    // other half is `record()` above (the model's inbox).
    mcp: {
      list: async () =>
        o.servers.map((s) => ({ id: s.id, name: s.id, url: "", connected: true, authorized: true })),
      catalog: async () => [],
      broker: async () => null,
      add: async () => {},
      addStdio: async () => {},
      pickDir: async () => undefined,
      remove: async () => {},
      connect: async (id: string) => ({ id, name: id, url: "", connected: true, authorized: true }),
      disconnect: async () => {},
      listTools: async () => toolDefs(o.servers).map((d) => ({ ...d, serverId: d.serverId })),
      callTool: async (call: { name: string; arguments?: ToolArgs }) => {
        const args = call.arguments ?? {};
        t.push({ t: "tool:out", name: call.name, args });
        const text = o.toolResult?.(call.name, args) ?? resultFor(o.servers, call.name, args);
        return { content: [{ type: "text" as const, text }] };
      },
      onChanged: () => () => {},
    } as unknown as Host["mcp"],
  };

  if (o.ner) {
    const detect = dictionaryNer(o.ner);
    host.detectLocalPii = async ({ text }) => {
      // `nerDelayMs` opens an observable WINDOW onto the pre-model phases (the real
      // NER takes seconds on a document) — that's what lets a Stop be tested
      // during redaction (`stopEarly.test.ts`) without a timing race.
      if (o.nerDelayMs) await new Promise((r) => setTimeout(r, o.nerDelayMs));
      return detect(text);
    };
  }

  if (o.python) {
    lastRealPy.all = []; // one host = one run — the figure assert inspects ALL its runs
    host.python = {
      run: async (code: string) => {
        t.push({ t: "tool:out", name: "run_python", args: { code } });
        // REAL WORLD opt-in (OPENMASQ_EVAL_REAL_PY=1): REAL execution just like in
        // the app — `buildScript` (brand theme + *_prices), seatbelt,
        // network LIMITED to the yfinance egress proxy — the `python` fixture = mock mode.
        if (realPyEnabled()) return runRealPython(code);
        return o.python!(code);
      },
    };
  }

  return host as Host;
}
