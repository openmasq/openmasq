/**
 * THE WORKING VAULT OF A CONVERSATION, for redaction AT ATTACHMENT DROP TIME.
 *
 * THE DEFAULT IT CLOSES (measured on 15/08/2026, two REAL documents from the same file —
 * a Kbis extract + a credit agreement in principle, attached to the same conversation): each
 * document was redacted into a NEW vault, so the same person received **two different
 * fakes**. The model, seeing only two strangers, replied "NO, these documents do not
 * designate the same person" — and the screen showed the same name twice while
 * asserting they differ. On a financing file, that is a FALSE conclusion
 * someone can act on.
 *
 * The engine's invariant is "one real value → ONE fake, at the conversation's
 * scale"; it could not hold, since nothing showed the two documents to the
 * same allocator. This module is what shows them to it.
 *
 * ⚠️ Ephemeral, like the write gate's allow-lists: it lives in the module,
 * survives a `ChatView` remount, dies with the app. It is NOT redaction's
 * memory — that is the conversation's PERSISTED vault (and that's what's used
 * to un-redact). It is in fact seeded from THAT one when it exists, so a document dropped
 * at turn 3 picks up the fakes from previous turns.
 */

/** Conversation → working vault (fake→real), mutated by each drop pass. */
const vaults = new Map<string, Record<string, string>>();
/** Bound: one vault per conversation, and only a reasonable number are kept — a
 *  long session opens dozens of conversations, and nothing here should grow without
 *  end. Eviction only loses drop-time COHERENCE, never data: the persisted
 *  vault remains the source of un-redaction. */
const MAX_CONVERSATIONS = 24;

/**
 * The working vault of `convId`, created as needed — seeded by `seed` (the conversation's
 * persisted vault) the FIRST time only: once it lives, it is what carries
 * the current turn's attributions.
 */
export function attachmentVault(
  convId: string,
  seed?: Record<string, string>,
): Record<string, string> {
  const existing = vaults.get(convId);
  if (existing) return existing;
  const fresh: Record<string, string> = { ...(seed ?? {}) };
  vaults.set(convId, fresh);
  if (vaults.size > MAX_CONVERSATIONS) {
    // Map iterates in insertion order: the oldest one comes out.
    const oldest = vaults.keys().next().value;
    if (oldest !== undefined) vaults.delete(oldest);
  }
  return fresh;
}

/** Forget a conversation (test, or a draft adopted under another id). */
export function forgetAttachmentVault(convId: string): void {
  vaults.delete(convId);
}
