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
 * TEST-ONLY driver for the agentic loop: exposes the store's OWN `sendMessage` so a spec
 * fires N CONCURRENT turns into N conversations of ONE app (turns already run concurrently
 * per tab; this adds an entry point, not concurrency).
 *
 * ⚠️ The SAME pipeline, not a replica: redaction, wire assembly, `mcpAgent`, the real
 * connectors and BOTH write gates are untouched. It only substitutes the two UI callbacks
 * (`confirmToolWrite`, `reviewWebNav`) with a DECLARED answer, as a user clicking would;
 * main's un-spoofable window still gates every risky write.
 *
 * Gated on main's LAUNCH-TIME `OPENMASQ_E2E` (a renderer cannot set it). Inert in every
 * shipped build, and it grants no authority a renderer doesn't already have.
 */

import type { E2eApi } from "./e2eContract";

declare global {
  interface Window {
    __openmasqE2E?: E2eApi;
  }
}

/** An ORIGINAL that looks like a tool name rather than PII: what NER should never redact. */
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
        // Fire-and-forget: the spec polls `turn()`.
        void ref.current.sendMessage(text, undefined, {
          convId,
          // EXPLICIT model per turn (also lets a batch compare two models).
          ...(opts.modelId ? { modelId: opts.modelId } : {}),
          // Recorded FIRST so a double-ask is visible even when both are approved.
          confirmToolWrite: async (info, cid) => {
            // FAIL-CLOSED: a write is approved only if the turn explicitly ASKS for it
            // (a permissive default writes to the dev account's real accounts).
            const approved = opts.approveWrites === true;
            confirms.push({ tool: info.tool, convId: cid, approved, at: Date.now(), args: info.args });
            return approved;
          },
          // The reveal gate: `[]` (reveal nothing) is the product's fail-closed default.
          reviewWebNav: async (categories) => (opts.revealForWeb ? categories : []),
        });
        return convId;
      },

      modelReady: (id) => !!findModelAny(id),

      turn: (convId) => {
        const conv = ref.current.conversations.find((c) => c.id === convId);
        if (!conv) return null;
        const last = [...conv.messages].reverse().find((m) => m.role === "assistant");
        // `toolCalls` = the turn's persisted trace: the raw material for loop diagnostics.
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

      // Scoping is the PACKAGE's rule (`isEntryVisibleIn`), never a copy.
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

    // The flag comes from MAIN (the sandboxed preload has no `process.env`). Async: the
    // spec waits for the bridge to appear.
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
