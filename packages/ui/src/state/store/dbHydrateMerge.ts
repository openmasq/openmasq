import type { Conversation, Message } from "../../types";

/**
 * "DB wins" merge of the hydrated DB conversations over the localStorage copy — except
 * for the fields the DB row may lack, restored from the richer local copy (matched by
 * message id): file chips, usage, the answering model, tool calls, the compétence /
 * workflow tag, the completion status, and the per-conversation redaction config.
 * `enriched` lists the ids that took something from local, so the mirror re-saves them.
 */
export function mergeDbConversations(
  dbConvs: Conversation[],
  local: Conversation[],
): { merged: Conversation[]; enriched: Set<string> } {
  const localById = new Map(local.map((c) => [c.id, c]));
  const enriched = new Set<string>();
  const merged = dbConvs.map((c) => {
    const lc = localById.get(c.id);
    if (!lc) return c;
    const lmById = new Map(lc.messages.map((m) => [m.id, m]));
    let changed = false;
    const messages = c.messages.map((m) => {
      const next = restoreMessage(m, lmById.get(m.id));
      if (next !== m) changed = true;
      return next;
    });
    let out = changed ? { ...c, messages } : c;
    out = restoreRedactionConfig(out, lc);
    if (out === c) return c;
    enriched.add(c.id);
    return out;
  });
  return { merged, enriched };
}

function restoreMessage(m: Message, lm: Message | undefined): Message {
  let next = m;
  if (lm) {
    if (!m.attachments?.length && lm.attachments?.length) next = { ...next, attachments: lm.attachments };
    if (!m.usage && lm.usage) next = { ...next, usage: lm.usage };
    if (!m.model && lm.model) next = { ...next, model: lm.model };
    if (!m.toolStruggle && lm.toolStruggle) next = { ...next, toolStruggle: lm.toolStruggle };
    if (!m.toolCalls?.length && lm.toolCalls?.length) next = { ...next, toolCalls: lm.toolCalls };
    // The tag's `prompt` is real user text, stripped from the local copy; the DB owns it. A
    // message persisted before the column existed still has its id/name locally — that IS
    // the tag, and the accordion then says the instruction is unavailable.
    if (!m.competence && lm.competence) next = { ...next, competence: lm.competence };
    // The retired "workflow" tag is no longer written but exists in persisted history.
    if (!m.workflow && lm.workflow) next = { ...next, workflow: lm.workflow };
    // localStorage is the freshest same-device copy (written every chunk), so it decides
    // whether the reply finished: clear a stale DB `incomplete`, or carry local's.
    const localDone = !lm.incomplete && !lm.pending && !!lm.content?.trim();
    if (m.incomplete && localDone) next = { ...next, incomplete: undefined, content: lm.content };
    else if (!m.incomplete && !m.error && (lm.incomplete || lm.pending)) next = { ...next, incomplete: true };
  }
  // Older replies carry the answering model only inside `usage.model`.
  if (!next.model && next.usage?.model) next = { ...next, model: next.usage.model };
  return next;
}

/** Per-conversation redaction config lives in localStorage too (not stripped), so an
 *  override set inside the save-debounce window must not revert to the global defaults. */
function restoreRedactionConfig(out: Conversation, lc: Conversation): Conversation {
  const restore =
    (!out.redactCategories && !!lc.redactCategories) ||
    (!out.revealedValues?.length && !!lc.revealedValues?.length) ||
    (!out.forcedRedactions?.length && !!lc.forcedRedactions?.length);
  if (!restore) return out;
  return {
    ...out,
    redactCategories: out.redactCategories ?? lc.redactCategories,
    revealedValues: out.revealedValues?.length ? out.revealedValues : lc.revealedValues,
    forcedRedactions: out.forcedRedactions?.length ? out.forcedRedactions : lc.forcedRedactions,
  };
}
