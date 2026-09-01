import { redactionCategory } from "@openmasq/redact";
import type { Conversation } from "../../../types";
import { protectedEntries } from "../../../state/redaction/protectedCount";
import { conversationKindIndex, kindOf } from "./privacyStats";

/**
 * The redaction journal, as data — the view only renders what this decides.
 *
 * ⚠️ **The reversible vault is PER CONVERSATION, and the journal must read that way.**
 * Each conversation has its own salt: the SAME real value receives a different fake
 * from one conversation to the next, and a fake means nothing outside its own. Flattened into
 * a single list, the journal used to show "Julien Sabourdin" four times with four
 * different replacements without ever saying why — you'd read it as an engine inconsistency where
 * it's actually the guarantee: nothing links two conversations to each other.
 *
 * ⚠️ **The DATE belongs to the group, never to the row.** The vault doesn't timestamp its
 * entries; all we have is the conversation's `updatedAt`. Repeated on every
 * row, it promised the time THIS value was redacted — a precision no
 * data carries. On the group's header, it says what it actually is.
 */

export interface AuditRow {
  id: string;
  convId: string;
  /** The message where the real value appears — the jump's target, when found. */
  msgId?: string;
  original: string;
  fake: string;
  kind: string;
}

export interface AuditGroup {
  convId: string;
  convTitle: string;
  /** `Conversation.updatedAt` — the only date the vault allows (see above). */
  at: number;
  rows: AuditRow[];
}

/** The journal's groups, most recent conversation first. */
export function buildAuditGroups(conversations: readonly Conversation[]): AuditGroup[] {
  const out: AuditGroup[] = [];
  for (const c of conversations) {
    const index = conversationKindIndex(c);
    const rows: AuditRow[] = [];
    // Same definition as the shield and the « tout ce qui a été masqué » card, so that
    // this tab's count can never diverge from theirs.
    for (const [fake, original] of protectedEntries(c)) {
      // The real value appears as-is in a message's displayed `content` (or
      // in `modelContent` when a file was folded into it) — we locate it to anchor
      // the jump. The FIRST occurrence wins.
      const msg = c.messages.find(
        (m) => m.content?.includes(original) || m.modelContent?.includes(original),
      );
      rows.push({
        id: `${c.id}::${fake}`,
        convId: c.id,
        msgId: msg?.id,
        original,
        fake,
        kind: redactionCategory(kindOf(index, original) ?? "secret"),
      });
    }
    if (rows.length) {
      out.push({ convId: c.id, convTitle: c.title || "Nouvelle conversation", at: c.updatedAt, rows });
    }
  }
  return out.sort((a, b) => b.at - a.at);
}

/**
 * Filter without breaking the groups: a conversation where nothing matches anymore
 * DISAPPEARS (an empty header reads as a group with no result, not as one excluded).
 * The search text also covers the TITLE — searching a conversation keeps all its
 * redaction, which is the "show me this one" action.
 */
export function filterAuditGroups(
  groups: readonly AuditGroup[],
  opts: { query?: string; kind?: string | null },
): AuditGroup[] {
  const needle = (opts.query ?? "").trim().toLowerCase();
  const out: AuditGroup[] = [];
  for (const g of groups) {
    const byTitle = !!needle && g.convTitle.toLowerCase().includes(needle);
    const rows = g.rows.filter(
      (r) =>
        (!opts.kind || r.kind === opts.kind) &&
        (!needle || byTitle || r.original.toLowerCase().includes(needle)),
    );
    if (rows.length) out.push({ ...g, rows });
  }
  return out;
}

/** How many values, all groups combined. */
export const countAuditRows = (groups: readonly AuditGroup[]): number =>
  groups.reduce((n, g) => n + g.rows.length, 0);

/** The categories present, the most populated one first. */
export function auditKindCounts(groups: readonly AuditGroup[]): { key: string; n: number }[] {
  const counts: Record<string, number> = {};
  for (const g of groups) for (const r of g.rows) counts[r.kind] = (counts[r.kind] ?? 0) + 1;
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([key, n]) => ({ key, n }));
}

/**
 * The first N VALUES, groups preserved — what infinite scroll renders.
 * We count rows, not groups: a conversation with 500 entries must not
 * arrive all at once just because it fits under one header.
 */
export function takeAuditRows(groups: readonly AuditGroup[], limit: number): AuditGroup[] {
  const out: AuditGroup[] = [];
  let left = limit;
  for (const g of groups) {
    if (left <= 0) break;
    out.push(g.rows.length <= left ? g : { ...g, rows: g.rows.slice(0, left) });
    left -= g.rows.length;
  }
  return out;
}
