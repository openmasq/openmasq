import { useEffect, useRef } from "react";
import type { Conversation, Settings } from "../../types";
import type { CompletePayload } from "../../host";
import { wireTurns } from "../../memory/extract";
import { findModelAny } from "../../prompt/models";
import {
  compactableTurns,
  compactionPrompt,
  nextCompactionTarget,
  parseSummary,
  type ContextSummary,
} from "../../send/contextSummary";
import { pushDebug } from "../debug/debug";

/**
 * Context compaction — the PASS + its trigger. Every rule it applies is pure and lives in
 * `send/contextSummary.ts`; this file is the scheduling and the one model call.
 *
 * Modelled on `useMemoryExtraction.ts` deliberately: same shape, same egress argument, and
 * the same reason for running out of band rather than inside `sendMessage` — a
 * summarisation before each send would put a model call on the critical path of every long
 * conversation.
 *
 * Egress: the pass reads `wireTurns` — the fakes the model already received, re-derived
 * from the conversation's OWN vault. Not one new real value leaves. The summary it stores
 * is therefore wire text, injectable as-is, and ⚠️ **bound to its conversation** (the same
 * fake means a different person elsewhere, per the per-conversation salt).
 */

/** Courtesy delay after a turn settles: the user is usually still reading, and a
 *  conversation that gains another turn immediately would have compacted for nothing. */
export const COMPACT_IDLE_MS = 90_000;

export interface ContextCompactionDeps {
  conversations: Conversation[];
  activeId: string | null;
  settings: Settings;
  complete: ((payload: CompletePayload) => Promise<string>) | undefined;
  patchConversation: (id: string, fn: (c: Conversation) => Conversation) => void;
}

/** One pass. Returns true when a summary was written. Never throws — a failed compaction
 *  leaves the previous summary in place and the window falls back to the honest marker. */
export async function runContextCompaction(
  conv: Conversation,
  deps: ContextCompactionDeps,
): Promise<boolean> {
  if (!deps.complete) return false;
  const previous = conv.contextSummary as ContextSummary | undefined;
  const turns = compactableTurns(conv.messages as never);
  const target = nextCompactionTarget(turns.length, previous);
  if (target === null) return false;

  const wire = wireTurns(turns.slice(0, target), conv.redactionVault ?? {});
  if (!wire.trim()) return false;

  // The conversation's OWN model: the summary is read back by that model, and it is the
  // one the user is already paying for on this thread.
  const modelId = conv.modelId || deps.settings.defaultModelId;
  const model = findModelAny(modelId);
  if (!model) return false;

  try {
    const reply = await deps.complete({
      provider: model.provider,
      model: model.id,
      messages: [{ role: "user", content: compactionPrompt(wire, previous?.text) }],
      temperature: 0,
    } as CompletePayload);
    const text = parseSummary(reply);
    if (!text) {
      pushDebug({ type: "phase", scope: "system", label: "compaction", detail: `réponse inutilisable (${turns.length} tours)`, ok: false }, conv.id);
      return false;
    }
    const summary: ContextSummary = { throughTurn: target, text, at: Date.now(), model: model.id };
    deps.patchConversation(conv.id, (c) => ({ ...c, contextSummary: summary }));
    pushDebug({ type: "phase", scope: "system", label: "compaction", detail: `${target} tours résumés (${text.length} car.)`, ok: true }, conv.id);
    return true;
  } catch {
    // Transient (model unreachable, no route): keep the previous summary, retry on a later
    // trigger. Never surfaced — the user did not ask for this and the fallback is honest.
    return false;
  }
}

export function useContextCompaction(deps: ContextCompactionDeps): void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const depsRef = useRef(deps);
  depsRef.current = deps;
  // Two triggers can aim at the same conversation before its summary lands.
  const inFlight = useRef(new Set<string>());

  const fire = (id: string | null) => {
    const conv = depsRef.current.conversations.find((c) => c.id === id);
    if (!conv || inFlight.current.has(conv.id)) return;
    if (conv.messages.some((m) => m.pending)) return; // never mid-turn
    inFlight.current.add(conv.id);
    void runContextCompaction(conv, depsRef.current)
      .catch(() => {})
      .finally(() => inFlight.current.delete(conv.id));
  };

  const active = deps.conversations.find((c) => c.id === deps.activeId);
  const settledTurns = active?.messages.filter((m) => !m.pending).length ?? 0;

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!deps.activeId || !deps.complete) return;
    // Re-armed by every new settled turn, so a conversation still being written to is
    // never compacted under the user.
    timer.current = setTimeout(() => fire(deps.activeId), COMPACT_IDLE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deps.activeId, settledTurns, !!deps.complete]);
}
