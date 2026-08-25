import type { ChatMessage } from "@openmasq/llm";

/**
 * Turn checkpoints — surviving a restart mid-agentic-turn.
 *
 * The loop already resumes a FAILED attempt rather than restarting it
 * (`resumeTranscript` + the `writeLedger`), but the checkpoint lived in a RAM `Map`. A
 * crash, a quit or an auto-update in the middle of a twenty-call turn therefore lost
 * everything the turn had learned — and, worse, lost the record of which side effects had
 * already been dispatched, so the retry could repeat them.
 *
 * This module is the pure half of making that durable: what a checkpoint IS, when it is too
 * old to trust, and — the part that matters for correctness — how to hand a resumed
 * transcript back to the model **honestly**.
 *
 * ## The invariant: an unknown outcome must never read as a failure
 *
 * A tool call that was dispatched and never answered has an UNKNOWN outcome. It may have
 * fully succeeded (the e-mail left, the row was written) with only the acknowledgement lost.
 * Feeding the model a transcript where that call simply stops is a lie in the dangerous
 * direction: an assistant turn with an unanswered `toolCalls` entry reads as "it didn't
 * happen", and the model redoes it. So every unanswered call is SEALED with an explicit
 * interrupted marker telling the model to CHECK before redoing anything with side effects.
 *
 * It also matters mechanically: OpenAI-shaped APIs reject a request whose assistant message
 * carries a `tool_call` with no matching `tool` reply, so an unsealed transcript is not even
 * resumable.
 */

/** What a resumed turn is told about a call whose outcome nobody recorded. Deliberately
 *  instructional rather than descriptive — the model's next move is the whole point.
 *  Covers BOTH ways a dispatched call loses its answer: a restart mid-call AND a user
 *  Stop (the dispatch keeps running in the background; only its result is dropped). */
export const INTERRUPTED_TOOL_RESULT =
  "[interrompu — le tour s'est arrêté pendant cet appel et son résultat n'a pas été enregistré. " +
  "L'action a PEUT-ÊTRE abouti. Vérifie ce qui s'est réellement passé avant de refaire quoi que ce soit " +
  "qui a un effet (envoi, écriture, paiement) ; une simple lecture peut être relancée sans risque.]";

/** Same unknown-outcome contract for a WRITE whose dispatch TIMED OUT: the transport was
 *  never cancelled, so « délai dépassé » is not a proven failure — telling the model
 *  « échec » invites it to RE-EMIT the write in the very next response (the ledger only
 *  records confirmed successes, so idempotency cannot catch the duplicate). One home for
 *  both unknown-outcome texts, beside the sealing that relies on them. */
export const TIMED_OUT_WRITE_RESULT =
  "[délai dépassé — l'appel a été lancé mais sa réponse n'est pas arrivée. " +
  "L'action a PEUT-ÊTRE abouti. NE RELANCE PAS cette écriture : vérifie d'abord par une lecture " +
  "ce qui s'est réellement passé, et dis à l'utilisateur ce que tu as constaté.]";

export interface TurnCheckpoint {
  turnId: string;
  /** Wire (redacted) transcript — what the MODEL saw. Never real values. */
  messages: ChatMessage[];
  /** When the checkpoint was written, ms. */
  at: number;
}

/**
 * A checkpoint older than this is dropped rather than resumed. A stale transcript is worse
 * than none: the world has moved on, and the model would reason about a state that no longer
 * holds. Twelve hours covers "I closed the laptop and came back after lunch" and refuses
 * "this crashed last week".
 */
export const CHECKPOINT_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export function isCheckpointUsable(
  checkpoint: TurnCheckpoint | undefined,
  turnId: string,
  now: number,
): boolean {
  if (!checkpoint || checkpoint.turnId !== turnId) return false;
  if (!checkpoint.messages.length) return false;
  return now - checkpoint.at <= CHECKPOINT_MAX_AGE_MS;
}

/**
 * Append a synthetic `tool` reply for every tool call the transcript never answered.
 *
 * Order matters: the reply must sit immediately after the assistant message that made the
 * call, or a provider that validates the pairing positionally rejects it. Calls already
 * answered are left exactly as they are — this only fills holes.
 */
export function sealInterruptedCalls(messages: ChatMessage[]): ChatMessage[] {
  const answered = new Set<string>();
  for (const m of messages) {
    if (m.role === "tool" && m.toolCallId) answered.add(m.toolCallId);
  }

  const out: ChatMessage[] = [];
  for (const m of messages) {
    out.push(m);
    if (m.role !== "assistant" || !m.toolCalls?.length) continue;
    for (const call of m.toolCalls) {
      if (answered.has(call.id)) continue;
      answered.add(call.id); // a duplicated id must not produce two replies
      out.push({ role: "tool", content: INTERRUPTED_TOOL_RESULT, toolCallId: call.id });
    }
  }
  return out;
}

/** True when the transcript has at least one call nobody answered — i.e. the turn really
 *  was cut off rather than ending cleanly. Lets a caller tell the user so. */
export function hasInterruptedCalls(messages: ChatMessage[]): boolean {
  const answered = new Set<string>();
  for (const m of messages) {
    if (m.role === "tool" && m.toolCallId) answered.add(m.toolCallId);
  }
  return messages.some(
    (m) => m.role === "assistant" && m.toolCalls?.some((c) => !answered.has(c.id)),
  );
}

/** Bound the RAM map: 20 turns of transcripts is already generous, and the durable
 *  checkpoint is what makes eviction harmless. */
const RESUME_CAP = 20;

/** ~200k wire chars ≈ what a long research turn accumulates; beyond that the checkpoint
 *  would be bloating the conversation row for a resume nobody will use. */
const CHECKPOINT_MAX_CHARS = 200_000;

/**
 * What to hand the loop as `resumeTranscript`.
 *
 * The RAM map wins when it has the turn: it is this session's own, and it is at least as
 * fresh as the last persisted checkpoint. BOTH paths are sealed: a RAM entry used to come
 * only from a loop that finished its own attempt, but a user Stop now checkpoints the
 * cut transcript too (`finalizeAborted`), so an unanswered call can sit in either copy —
 * and an unsealed one reads as "it didn't happen", which is what makes a retry re-emit a
 * write whose outcome is unknown. Sealing only fills holes, so it is idempotent.
 */
export function resumeMessagesFor(
  ram: Map<string, ChatMessage[]>,
  checkpoint: TurnCheckpoint | undefined,
  turnId: string,
  now: number,
): ChatMessage[] | undefined {
  const inMemory = ram.get(turnId);
  if (inMemory?.length) return sealInterruptedCalls(inMemory);
  if (!isCheckpointUsable(checkpoint, turnId, now)) return undefined;
  return sealInterruptedCalls(checkpoint!.messages);
}

/**
 * Record a turn's accumulated transcript in RAM and return the checkpoint to persist.
 * Re-inserting LAST is what makes the size cap evict the least-recently-checkpointed turn
 * rather than the least-recently-created one.
 */
export function rememberTranscript(
  ram: Map<string, ChatMessage[]>,
  turnId: string,
  messages: ChatMessage[],
  now: number,
): TurnCheckpoint {
  ram.delete(turnId);
  ram.set(turnId, messages);
  while (ram.size > RESUME_CAP) {
    const oldest = ram.keys().next().value;
    if (oldest === undefined) break;
    ram.delete(oldest);
  }
  return { turnId, at: now, messages: trimCheckpoint(messages, CHECKPOINT_MAX_CHARS) };
}

/**
 * Cap what is persisted. The checkpoint rides the conversation row, and a research turn can
 * accumulate megabytes of page text; a checkpoint that bloats the DB would be a worse bug
 * than the one it fixes. Trimming from the FRONT keeps the recent state, which is what a
 * resume needs — and the trim never splits a call from its reply.
 */
export function trimCheckpoint(messages: ChatMessage[], maxChars: number): ChatMessage[] {
  let total = 0;
  for (const m of messages) total += m.content?.length ?? 0;
  if (total <= maxChars) return messages;

  let cut = 0;
  while (cut < messages.length && total > maxChars) {
    total -= messages[cut]!.content?.length ?? 0;
    cut++;
  }
  // Never START on an orphan `tool` reply: its assistant call would be gone, which is the
  // same provider-side rejection sealing exists to avoid. Walk forward to a clean boundary.
  while (cut < messages.length && messages[cut]!.role === "tool") cut++;
  return messages.slice(cut);
}
