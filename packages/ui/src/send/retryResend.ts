/**
 * Retry (regenerate) helper — decide how to re-send a failed user turn so an
 * attached DOCUMENT is never silently dropped.
 *
 * On the first send, a document's extracted text is folded into the MODEL payload
 * and persisted on the user message as `modelContent` (typed text + document). The
 * retry path deletes the failed turn and re-sends it; it first tries to rebuild the
 * document by round-tripping through the local file library. That round-trip FAILS
 * to recover the text when the file was never stored (redaction off), there's no
 * Host DB, extraction fails, or the stored name doesn't match — and then the
 * document dropped out of the retry entirely (the model answered "I have no data").
 *
 * `retryResendWire` picks the reliable fallback: when the rebuilt files carry no
 * usable text, re-send the persisted `modelContent` verbatim as the wire (same
 * source a normal follow-up turn re-includes). Returns the string to pass as
 * `sendMessage`'s `opts.resendWire`, or `undefined` to keep the file-based resend.
 */
export function retryResendWire(
  text: string,
  modelContent: string | undefined,
  rebuiltFiles: { text: string }[] | undefined,
): string | undefined {
  // The library round-trip recovered the document text → fold it as normal.
  if (rebuiltFiles?.some((f) => f.text.trim())) return undefined;
  // No persisted payload (a plain text turn with no document) → nothing to resend.
  if (!modelContent) return undefined;
  // `modelContent` equals the clean text (no document was ever folded) → nothing extra.
  return modelContent.trim() !== text.trim() ? modelContent : undefined;
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
