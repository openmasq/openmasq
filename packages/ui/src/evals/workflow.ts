// The PROCESS harness: whole user workflows through the REAL `useChatStore`.
//
// This is the level above `loop.ts`: the real send pipeline (redaction → preflight →
// history → agent loop OR plain stream → persistence) with the real reducers, driven by
// typed prompts — so a scenario asserts what the USER would see in the conversation
// (bubbles, error turns, confirm cards, reveal offers, redaction pills) AND what
// crossed each boundary (the transcript). Requires jsdom: the store is a React hook.
//
// Gate cards have no UI here: `sendMessage`'s own `confirmToolWrite`/`reviewWebNav`
// callbacks — the exact seam ChatView uses — are answered by the scenario script and
// recorded. Fail-closed defaults: writes refused, nothing revealed.

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { CATEGORY_DEFAULTS } from "@openmasq/catalog/redaction";
import { HostProvider } from "../host";
import { useChatStore, type ChatStore } from "../state/store";
import type { VaultTerm, Conversation, Message, RedactCategoryKey, Settings } from "../types";
import type { ExtractedFile } from "../host";
import type { WriteConfirmInfo, McpAgentParams } from "../agent/mcpAgent";
import { Transcript } from "./transcript";
import { qualify, type FakeServer } from "./servers";
import { makeWorkflowHost, type WorkflowModel } from "./workflowHost";
import type { ToolArgs } from "./transcript";

// React 18.3 exports `act`; the flag opts jsdom into act-aware batching.
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
const act: (cb: () => Promise<void> | void) => Promise<void> = (
  React as unknown as { act: (cb: () => Promise<void> | void) => Promise<void> }
).act;

export interface WorkflowOpts {
  servers?: FakeServer[];
  model: WorkflowModel;
  /** Redaction rules for the run — merged over `CATEGORY_DEFAULTS` (a partial record
   *  would silently WIPE the deterministic defaults: the persisted blob replaces the
   *  whole record at load). */
  rules?: Partial<Record<RedactCategoryKey, boolean>>;
  settings?: Partial<Settings>;
  /** Entity dictionary for the "IA locale" detector. Present ⇒ `redactEngine:"local"`
   *  unless `settings` says otherwise. */
  ner?: Record<string, string>;
  /** Artificial NER latency (ms) — a testable pre-model window (`stopEarly.test.ts`). */
  nerDelayMs?: number;
  /** Scripted user at the write-confirm card. Default REFUSE (fail-closed). */
  approveWrites?: boolean | ((info: WriteConfirmInfo) => boolean);
  /** Scripted user at the pre-search reveal card. Default: reveal NOTHING. */
  webNavPick?: (offerable: RedactCategoryKey[]) => RedactCategoryKey[] | null;
  toolResult?: (name: string, args: ToolArgs) => string | undefined;
  /** Coffre terms (value + category token) — ALWAYS redacted, every send. */
  coffre?: { value: string; token: string }[];
  /** Code-interpreter fixture (threads to the host; enables `run_python`). */
  python?: Parameters<typeof makeWorkflowHost>[0]["python"];
  /** Canned pages for `web_fetch_many` (url → text) — wires `host.web`. */
  webPages?: Record<string, string>;
  /** Overrides the tool-routing/catalog thresholds for every send in this run —
   *  the bench's strategy axis (`evals/strategies.ts`). Absent ⇒ production defaults. */
  routingConfig?: McpAgentParams["routingConfig"];
}

export interface GateLog {
  writes: { tool: string; reason: string; approved: boolean; args: Record<string, unknown> }[];
  navOffers: { offerable: RedactCategoryKey[]; picked: RedactCategoryKey[] | null }[];
}

export class WorkflowRun {
  readonly transcript = new Transcript();
  readonly gates: GateLog = { writes: [], navOffers: [] };
  private store!: ChatStore;
  private root!: Root;
  private container!: HTMLElement;
  private convId: string | undefined;

  constructor(private readonly o: WorkflowOpts) {}

  /** Mount the real store under the mock host. */
  async start(): Promise<this> {
    localStorage.clear();
    const settings: Partial<Settings> = {
      onboarded: true,
      redactEngine: this.o.ner ? "local" : "patterns",
      openaiCompatBaseUrl: this.o.model.provider === "openai-compat" ? (this.o.model.baseUrl ?? "") : "",
      ...this.o.settings,
      redactCategories: { ...CATEGORY_DEFAULTS, ...(this.o.rules ?? {}) } as Settings["redactCategories"],
      ...(this.o.coffre?.length
        ? { coffre: this.o.coffre.map((c, i) => ({ id: `cf-${i}`, value: c.value, token: c.token, createdAt: 0 })) as VaultTerm[] }
        : {}),
    };
    localStorage.setItem("openmasq.settings", JSON.stringify(settings));

    const host = makeWorkflowHost({
      servers: this.o.servers ?? [],
      model: this.o.model,
      transcript: this.transcript,
      ner: this.o.ner,
      nerDelayMs: this.o.nerDelayMs,
      toolResult: this.o.toolResult,
      python: this.o.python,
      webPages: this.o.webPages,
    });

    // A probe component: run the hook, stash the latest snapshot on each render.
    const latest: { current: ChatStore | null } = { current: null };
    const Probe = () => {
      latest.current = useChatStore();
      return null;
    };
    this.container = document.createElement("div");
    document.body.appendChild(this.container);
    this.root = createRoot(this.container);
    await act(async () => {
      this.root.render(React.createElement(HostProvider, { value: host }, React.createElement(Probe)));
    });
    // Let the mount effects settle (auth-less → userId=null → per-account load).
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    if (!latest.current) throw new Error("workflow: store failed to mount");
    // Live proxy: every read goes through the latest render's snapshot.
    this.store = new Proxy({} as ChatStore, {
      get: (_t, p) => (latest.current as unknown as Record<string | symbol, unknown>)[p],
    }) as ChatStore;
    return this;
  }

  /** Send one user prompt and wait for the whole turn (agent loop included). */
  async send(
    text: string,
    opts?: { modelId?: string; files?: ExtractedFile[]; plotTag?: "graphique" | "preciser" },
  ): Promise<void> {
    const o = this.o;
    await act(async () => {
      await this.store.sendMessage(text, opts?.files, {
        modelId: opts?.modelId ?? o.model.modelId,
        ...(opts?.plotTag ? { plotTag: opts.plotTag } : {}),
        ...(o.routingConfig ? { routingConfig: o.routingConfig } : {}),
        convId: this.convId,
        confirmToolWrite: async (info: WriteConfirmInfo, convId: string) => {
          this.convId ??= convId;
          const approved =
            typeof o.approveWrites === "function" ? o.approveWrites(info) : o.approveWrites === true;
          const tool = qualify(info.server, info.tool);
          this.gates.writes.push({ tool, reason: info.reason, approved, args: info.args });
          this.transcript.push({ t: "confirm", tool, reason: info.reason, approved });
          return approved;
        },
        reviewWebNav: async (offerable: RedactCategoryKey[], convId: string) => {
          this.convId ??= convId;
          const picked = o.webNavPick ? o.webNavPick(offerable) : [];
          this.gates.navOffers.push({ offerable, picked });
          return picked ?? [];
        },
      });
      // Flush the trailing setState timers (title, persistence) before asserting.
      await new Promise((r) => setTimeout(r, 10));
    });
    this.convId ??= this.store.activeId ?? this.store.conversations[0]?.id;
    const final = this.lastAssistant();
    if (final?.content && !final.pending) this.transcript.push({ t: "answer", text: final.content });
  }

  /** Schedules a USER Stop (the composer's button) during the in-flight send —
   *  call it BEFORE `await send(...)`; the timer presses the button mid-turn. */
  stopAfter(ms: number): void {
    setTimeout(() => this.store.stop(this.convId ?? undefined), ms);
  }

  /** The workflow's conversation, as persisted (what the user's copy holds). */
  conversation(): Conversation {
    const conv =
      this.store.conversations.find((c) => c.id === this.convId) ?? this.store.conversations[0];
    if (!conv) throw new Error("workflow: no conversation — send() first");
    return conv;
  }

  messages(): Message[] {
    return this.conversation().messages;
  }

  lastAssistant(): Message | undefined {
    return [...(this.storeConv()?.messages ?? [])].reverse().find((m) => m.role === "assistant");
  }

  lastUser(): Message | undefined {
    return [...(this.storeConv()?.messages ?? [])].reverse().find((m) => m.role === "user");
  }

  /** Per-conversation category override — the conversation info panel's toggles.
   *  Async ON PURPOSE: the toggle is a React state update, and the next `send()` must
   *  run against the RE-RENDERED store closure — un-acted, it reads the stale one and
   *  the override silently doesn't apply (a harness artifact, not the product). */
  async setConversationCategories(cats: Conversation["redactCategories"]): Promise<void> {
    const id = this.convId ?? this.store.activeId ?? this.store.conversations[0]?.id;
    if (!id) throw new Error("workflow: no conversation to override");
    await act(async () => {
      this.store.setConversationCategories(id, cats);
      await new Promise((r) => setTimeout(r, 0));
    });
  }

  /** The live store API — for tests that exercise store methods directly (fork…).
   *  A store METHOD call is a React state update: `await flush()` after it, or the
   *  next read sees the pre-render snapshot. */
  api(): ChatStore {
    return this.store;
  }

  /** Flush pending React state (act + a tick) after a direct store call. */
  async flush(): Promise<void> {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }

  /** Namespaced tools whose confirm card OPENED (for `expect.ts` specs). */
  confirmedTools(): string[] {
    return this.gates.writes.map((w) => w.tool);
  }

  /** The REAL values the run's vault protects (fake → real ⇒ values are the reals). */
  vaultReals(): string[] {
    return Object.values(this.storeConv()?.redactionVault ?? {});
  }

  /** The conversation's raw vault (fake → real) — what the memory-extraction pipeline
   *  needs (`wireSlice` re-applies it, `resolveExtraction` reverses it). */
  vault(): Record<string, string> {
    return this.storeConv()?.redactionVault ?? {};
  }

  private storeConv(): Conversation | undefined {
    return this.store.conversations.find((c) => c.id === this.convId) ?? this.store.conversations[0];
  }

  async dispose(): Promise<void> {
    await act(async () => this.root.unmount());
    this.container.remove();
  }
}

/** Start a workflow (mount the store) — `await runWorkflow(opts)` then `.send(...)`. */
export function runWorkflow(opts: WorkflowOpts): Promise<WorkflowRun> {
  return new WorkflowRun(opts).start();
}
