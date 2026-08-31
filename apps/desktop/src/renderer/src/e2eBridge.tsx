import { useEffect, useRef } from "react";
import {
  findModelAny,
  getDebugLog,
  isEntryVisibleIn,
  setDebugCapture,
  type ChatStore,
  type DebugEntry,
} from "@openmasq/ui";

/**
 * TEST-ONLY driver for the agentic loop — the seam that makes real-connector
 * iteration practical.
 *
 * Why it exists: the interesting signal when tuning agentic reliability (tool
 * routing, retries, loops, PII on the wire) is produced by ONE app launch and N
 * turns; driving those turns through the composer is serial, slow and flaky, and
 * a per-test app launch costs ~40 s before a single token is spent. This exposes
 * the store's OWN `sendMessage` so a spec can fire N CONCURRENT turns into N
 * conversations of a SINGLE app — turns already run concurrently per tab (the
 * cancel/finish registries are keyed by `convId`; `isStreaming` is only a display
 * flag), so this adds no new concurrency, just a programmatic entry point.
 *
 * ⚠️ It is the SAME pipeline, not a replica: redaction, wire assembly, `mcpAgent`,
 * the real MCP connectors and BOTH write gates are untouched. The only thing it
 * substitutes is the two callbacks ChatView would supply from the UI —
 * `confirmToolWrite` (the in-conversation card) and `reviewWebNav` (the reveal
 * card) — with a DECLARED, deterministic answer, exactly as a user clicking would.
 * Main's un-spoofable window still gates every risky write on its own, so what a
 * test can approve here is bounded by the same policy a user faces.
 *
 * Gating: `window.openmasq.e2e`, which mirrors main's LAUNCH-TIME `OPENMASQ_E2E`
 * (a renderer cannot set main's env). Inert in every shipped build — and it grants
 * no authority a renderer doesn't already have (it can call the IPC directly).
 */

export interface E2eTurn {
  convId: string;
  done: boolean;
  /** Reply text as SHOWN (un-redacted) — what the user would read. */
  text: string;
  error: boolean;
  /** The persisted failure message ("SEND FAILED …") — THE diagnostic. */
  errorText: string;
  /** Tool calls seen on the turn's messages, in order (`connector__tool`). */
  tools: string[];
  /** THE conversation's REDACTION LOG: fake → real (`redactionVault`).
   *  Without it, a "the model replays the same tool" loop can HIDE a
   *  "NER redacted a TOOL NAME" loop (`execute-sql → jade-tom`) that breaks
   *  discovery: the bench must be able to tell the two apart. */
  redactions: Record<string, string>;
  ms: number;
}

declare global {
  interface Window {
    __openmasqE2E?: {
      /** Fire a turn WITHOUT awaiting it — returns the conversation id at once. */
      send: (
        text: string,
        opts?: { approveWrites?: boolean; revealForWeb?: boolean; modelId?: string },
      ) => string;
      /** Is a model id RESOLVABLE? A dynamic OpenRouter slug
       *  (`poolside/laguna-xs-2.1`) only enters the registry after the
       *  catalogue fetch on mount; sending before that means starting on the FACTORY
       *  default model (measured: "… tools request failed (401)"). The spec waits for this. */
      modelReady: (id: string) => boolean;
      /** Snapshot of a turn (poll this from the spec). */
      turn: (convId: string) => E2eTurn | null;
      /** Every write the loop asked to confirm, in order — the anti-double-send probe. */
      confirms: () => {
        tool: string;
        convId: string;
        approved: boolean;
        at: number;
        /** The REAL args (un-redacted) submitted for confirmation — what the
         *  connector will receive. Lets the spec verify a recipient. */
        args: Record<string, unknown>;
      }[];
      /** THE DEBUG LOG of a conversation: the wire/turn/tool/phase entries
       *  with their redacted↔original mappings — what the app's Debug Log
       *  displays. This is what enables ITERATION: seeing that a tool name was redacted,
       *  which turn looped, which wire went out. Bounded by the app's buffer (200). */
      journal: (convId: string) => DebugEntry[];
      /** Targeted diagnostic: mappings where the ORIGINAL looks like a TOOL
       *  NAME or a technical term (kebab-case, single-word PascalCase) redacted by
       *  mistake — the root cause of the posthog loops (`execute-sql → jade-tom`). */
      toolNameRedactions: (convId: string) => { fake: string; real: string }[];
    };
  }
}

/** An ORIGINAL that looks like an API/tool name rather than PII:
 *  kebab-case (`execute-sql`), a known technical term, or a command slug. These
 *  are the ones NER should never have redacted in a discovery result. */
const TOOLISH = /^[a-z][a-z0-9]*(-[a-z0-9]+)+$|^(ClickHouse|HogQL|MCP|SQL|OAuth|API|SDK|JSON|HTTP)$/;

export function E2eBridge({ store }: { store: ChatStore }) {
  const ref = useRef(store);
  ref.current = store;

  useEffect(() => {
    let disposed = false;
    const started = new Map<string, number>();
    const confirms: {
      tool: string;
      convId: string;
      approved: boolean;
      at: number;
      args: Record<string, unknown>;
    }[] = [];

    const bridge: NonNullable<Window["__openmasqE2E"]> = {
      send: (text, opts = {}) => {
        const convId = ref.current.createConversation();
        started.set(convId, Date.now());
        // Fire-and-forget: the spec polls `turn()`. Awaiting here would serialise
        // the very concurrency this bridge exists to provide.
        void ref.current.sendMessage(text, undefined, {
          convId,
          // EXPLICIT model per turn: `createConversation` would fall back to the
          // factory default if `defaultModelId` isn't resolvable. Also lets
          // you compare two models in the SAME batch.
          ...(opts.modelId ? { modelId: opts.modelId } : {}),
          // The in-conversation confirmation card's answer, declared up front.
          // Recorded FIRST so a double-ask is visible even when both are approved.
          confirmToolWrite: async (info, cid) => {
            // FAIL-CLOSED, like the reveal gate just below: a write
            // is approved only if the turn explicitly ASKS for it. The reverse default
            // (`!== false`) approved anything the model decided to write on the
            // dev account's real accounts, including on a READ scenario — a
            // phantom event really did land in the real calendar (log 27/07/2026),
            // and the bench counted it as a success.
            const approved = opts.approveWrites === true;
            confirms.push({ tool: info.tool, convId: cid, approved, at: Date.now(), args: info.args });
            return approved;
          },
          // The pre-search reveal gate: `[]` (reveal nothing) is the product's
          // fail-closed default, so that is this bridge's default too.
          reviewWebNav: async (categories) => (opts.revealForWeb ? categories : []),
        });
        return convId;
      },

      modelReady: (id) => !!findModelAny(id),

      turn: (convId) => {
        const conv = ref.current.conversations.find((c) => c.id === convId);
        if (!conv) return null;
        const last = [...conv.messages].reverse().find((m) => m.role === "assistant");
        // `toolCalls` = the turn's persisted trace (schema `Message`): the tool,
        // its server and its outcome — the raw material for loop diagnostics.
        const tools = conv.messages.flatMap((m) => (m.toolCalls ?? []).map((t) => t.tool));
        return {
          convId,
          done: !!last && !last.pending,
          text: last?.content ?? "",
          error: !!last?.error,
          errorText: last?.errorText ?? "",
          tools,
          // The full fake→real log accumulated over the conversation (vault).
          redactions: { ...(conv.redactionVault ?? {}) },
          ms: Date.now() - (started.get(convId) ?? Date.now()),
        };
      },

      confirms: () => [...confirms],

      // Scoping is the PACKAGE's rule (`isEntryVisibleIn`), not a copy: the one that
      // used to live here accepted `conv === undefined`, so one conversation's log
      // carried another one's entries — the very bug the bench must be able to see.
      journal: (convId) => getDebugLog().filter((e) => isEntryVisibleIn(e, convId)) as DebugEntry[],

      toolNameRedactions: (convId) => {
        const seen = new Map<string, string>();
        for (const e of getDebugLog()) {
          if (!isEntryVisibleIn(e, convId)) continue;
          // The `pairs` (tool) and the `vault` (wire/turn) carry the fake→real mapping.
          const vault = "vault" in e ? e.vault : undefined;
          if (vault) for (const [fake, real] of Object.entries(vault)) if (TOOLISH.test(real)) seen.set(fake, real);
          const pairs = "pairs" in e ? e.pairs : undefined;
          if (pairs) for (const p of pairs) if (TOOLISH.test(p.original)) seen.set(p.token, p.original);
        }
        return [...seen].map(([fake, real]) => ({ fake, real }));
      },
    };

    // The flag comes from MAIN (launch env): the preload is sandboxed, it has
    // no `process.env`. Asynchronous, so the spec waits for the bridge to appear.
    void window.openmasq.env.isE2e().then((on) => {
      if (on && !disposed) {
        setDebugCapture(true); // the journal feeds the bench; inert outside e2e
        window.__openmasqE2E = bridge;
      }
    });

    return () => {
      disposed = true;
      delete window.__openmasqE2E;
    };
  }, []);

  return null;
}
