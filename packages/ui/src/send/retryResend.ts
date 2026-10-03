/** How a retry re-sends a failed user turn — never with only PART of its documents. */
export type RetryResend<F> =
  /** Every attached document came back from the library with its text → fold them as normal. */
  | { kind: "files"; files: F[] }
  /** The turn's persisted `modelContent` (typed text + EVERY folded document), re-sent verbatim. */
  | { kind: "wire"; resendWire: string }
  /** No document on this turn → the typed text alone. */
  | { kind: "text" }
  /** Some documents could not be reloaded and no full payload survives: send NOTHING. */
  | { kind: "blocked"; missing: string[] };

/**
 * Retry (regenerate) helper — decide how to re-send a failed user turn so an attached
 * DOCUMENT is never silently dropped.
 *
 * On the first send, a document's extracted text is folded into the MODEL payload and
 * persisted on the user message as `modelContent` (typed text + every document). The retry
 * first rebuilds the documents through the local file library, BY NAME (a message keeps
 * only its attachments' metadata). That round-trip can miss ANY of them: never stored
 * (redaction off), no Host DB, extraction failed, a name stored under another conversation.
 *
 * The rule (`retryResend.test.ts`): the file route is taken only when EVERY attached
 * document came back with text — one per attached name, so a library duplicate of the same
 * name cannot ride twice. Otherwise the persisted `modelContent` is the complete set and is
 * re-sent; without it the retry is BLOCKED and names what is missing, rather than leaving
 * with a partial set. Either route goes through the same redaction as a first send: the
 * wire is the engine INPUT (`buildFoldedPayload`), never a pre-masked or raw bypass.
 */
export function planRetryResend<F extends { name: string; text: string }>(
  text: string,
  modelContent: string | undefined,
  attachedNames: string[],
  rebuiltFiles: F[] | undefined,
): RetryResend<F> {
  // `modelContent` equal to the clean text means no document was ever folded into it.
  const wire = modelContent && modelContent.trim() !== text.trim() ? modelContent : undefined;
  if (!attachedNames.length) return wire ? { kind: "wire", resendWire: wire } : { kind: "text" };
  const pool = (rebuiltFiles ?? []).filter((f) => f.text.trim());
  const files: F[] = [];
  const missing: string[] = [];
  for (const name of attachedNames) {
    const i = pool.findIndex((f) => f.name === name);
    if (i < 0) missing.push(name);
    else files.push(...pool.splice(i, 1));
  }
  if (!missing.length) return { kind: "files", files };
  return wire ? { kind: "wire", resendWire: wire } : { kind: "blocked", missing };
}

/**
 * The compétence/workflow PROMPT a retry must re-supply. With a `resendWire` the
 * instruction is already inside it (the prior turn's `modelContent` carried the
 * prefix) — re-prefixing would send it twice, so return undefined. WITHOUT one
 * (the payload could not be recovered: `modelContent` is stripped from the
 * plaintext copy, and right after a reload the DB merge / debounced flush may
 * not have restored it), the retry would otherwise send the BARE text and the
 * model never sees the workflow/compétence at all — the reported « si retry,
 * gpt ne comprend pas qu'il y a un workflow ». Prefer the message's SNAPSHOT
 * (what that turn really sent), else fall back to today's version by id.
 */
export function retryTagPrompt(
  resendWire: string | undefined,
  snapshotPrompt: string | undefined,
  currentPrompt: string | undefined,
): string | undefined {
  if (resendWire) return undefined;
  return snapshotPrompt ?? currentPrompt;
}
