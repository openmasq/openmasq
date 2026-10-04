import { isImportedMessageId } from "../../import/ids";
import type { Message } from "../../types";
import { makeRedactFn } from "../redactionEngine";
import { deriveRedactedSpans } from "../sendAnalytics";
import type { FailClosed } from "./failClosed";
import type { RedactionSetup } from "./redactionSetup";
import type { TurnContext } from "./turnSetup";

/**
 * The on-device detector over an imported conversation's history, the first time it goes
 * back to a model. The import itself stays fast (pattern rules only, `import/redact.ts`), so
 * its messages are UNMARKED and `replayable.ts` keeps them off every wire; here they are
 * detected with the send's own engine, into the send's vault, and marked. Both roles: the
 * other assistant's replies quote the real values it was given.
 *
 * FAIL CLOSED like every pass: a detector that did not run blocks the send. Returns the
 * messages the history is built from (marked), or null when the user stopped.
 */
export async function detectImportedTurns(
  ctx: TurnContext,
  r: RedactionSetup,
  failClosed: FailClosed,
): Promise<Message[] | null> {
  const { d, conv, convId, sendAbort, stoppedEarly } = ctx;
  const pending = conv.messages.filter(
    (m) => isImportedMessageId(m.id) && typeof m.redactions !== "number",
  );
  if (!pending.length) return conv.messages;

  const redact = makeRedactFn(d.host, d.settings, d.orgProfileRef.current?.forcedCategories);
  const counts = new Map<string, number>();
  const kinds: Record<string, string> = {};
  for (const m of pending) {
    if (!m.content?.trim()) {
      counts.set(m.id, 0);
      continue;
    }
    let res: Awaited<ReturnType<typeof redact>>;
    try {
      res = await redact(m.content, sendAbort.signal, r.vault, conv.redactCategories, {
        salt: r.redactionSalt,
        key: r.redactionKey,
        mode: r.redactionMode,
      });
    } catch (e) {
      if (stoppedEarly()) return null;
      failClosed(e instanceof Error ? e.message : String(e));
    }
    if (res.modelError) failClosed(res.modelError);
    counts.set(m.id, res.matches.length);
    for (const sp of deriveRedactedSpans(res.matches)) kinds[sp.value] = sp.kind;
  }

  const mark = (m: Message): Message =>
    counts.has(m.id) ? { ...m, redactions: counts.get(m.id) } : m;
  d.patchConversation(convId, (c) => ({
    ...c,
    messages: c.messages.map(mark),
    redactionVault: { ...c.redactionVault, ...r.vault },
    redactionKinds: { ...c.redactionKinds, ...kinds },
  }));
  return conv.messages.map(mark);
}
