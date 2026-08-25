import type { Conversation } from "../types";

/**
 * Where a memory card actually SERVED — computed from the traces the send already
 * persists on user messages (`memoryUsed` ids + `memorySkipped` diagnoses, both
 * opaque ids, never content). This is what turns the page from a database into
 * something whose value is visible: « rappelée dans N conversations », and the
 * surprising non-recall explained. Pure scan, one pass over the conversations,
 * memoized by the caller.
 */

export interface MemoryCardUsage {
  /** Distinct conversations whose sends carried this card. */
  convCount: number;
  /** Most recent injection (message `at`, else the conversation's `updatedAt`). */
  lastAt: number;
  /** The most recent SURPRISING non-recall, when it is NEWER than `lastAt` — the
   *  only case worth explaining (an old skip superseded by a real recall is noise). */
  lastSkip?: { reason: "budget" | "homographe"; at: number };
}

export function memoryUsageIndex(
  conversations: readonly Pick<Conversation, "id" | "updatedAt" | "messages">[],
): Map<string, MemoryCardUsage> {
  const used = new Map<string, { convs: Set<string>; lastAt: number }>();
  const skips = new Map<string, { reason: "budget" | "homographe"; at: number }>();
  for (const conv of conversations) {
    for (const m of conv.messages) {
      const at = m.at ?? conv.updatedAt ?? 0;
      for (const id of m.memoryUsed ?? []) {
        if (id === "profile") continue; // the profile is always-on, not a card
        const u = used.get(id) ?? { convs: new Set<string>(), lastAt: 0 };
        u.convs.add(conv.id);
        if (at > u.lastAt) u.lastAt = at;
        used.set(id, u);
      }
      for (const s of m.memorySkipped ?? []) {
        const prev = skips.get(s.id);
        if (!prev || at > prev.at) skips.set(s.id, { reason: s.reason, at });
      }
    }
  }
  const out = new Map<string, MemoryCardUsage>();
  for (const [id, u] of used) out.set(id, { convCount: u.convs.size, lastAt: u.lastAt });
  for (const [id, skip] of skips) {
    const cur = out.get(id);
    if (cur) {
      if (skip.at > cur.lastAt) cur.lastSkip = skip;
    } else {
      out.set(id, { convCount: 0, lastAt: 0, lastSkip: skip });
    }
  }
  return out;
}
