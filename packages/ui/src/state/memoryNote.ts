import type { Conversation } from "../types";

/**
 * Pin the « retiens ça » feedback on the turn's assistant reply — the pure patch (root
 * convention: logic in `.ts`), split out of `memoryExtractionRun.ts` (rule 1). `failed`
 * is the honest « réessayez », distinct from a count of 0; a later success clears it by
 * writing `undefined`.
 */
export function pinMemoryNote(
  c: Conversation,
  count: number,
  createdIds?: string[],
  failed?: boolean,
  updatedIds?: string[],
): Conversation {
  const last = [...c.messages].reverse().find((m) => m.role === "assistant" && !m.pending);
  if (!last) return c;
  return {
    ...c,
    messages: c.messages.map((m) =>
      m.id === last.id
        ? {
            ...m,
            memoryNoted: count,
            memoryNotedIds: createdIds?.length ? createdIds : undefined,
            memoryUpdatedIds: updatedIds?.length ? updatedIds : undefined,
            memoryNotedFailed: failed || undefined,
            // The result replaces the « en cours » state — never both at once.
            memoryNotedPending: undefined,
          }
        : m,
    ),
  };
}

/** « Mise en mémoire… » — set as soon as the explicit extraction STARTS, on the same turn
 *  that `pinMemoryNote` will fill. Without it, the seconds of model call after a
 *  « retiens que… » are total silence that reads as a dead feature. */
export function pinMemoryPending(c: Conversation): Conversation {
  const last = [...c.messages].reverse().find((m) => m.role === "assistant" && !m.pending);
  if (!last) return c;
  return {
    ...c,
    messages: c.messages.map((m) =>
      m.id === last.id ? { ...m, memoryNotedPending: true } : m,
    ),
  };
}
