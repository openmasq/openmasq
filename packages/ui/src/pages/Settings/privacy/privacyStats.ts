import { redactionCategory } from "@openmasq/redact";
import type { Conversation } from "../../../types";
import { protectedEntries } from "../../../state/redaction/protectedCount";
import { PRIVACY_KINDS } from "../../../privacy/redactCategories";

/** One by-type row: a PRIVACY_KINDS entry (key/colour/Icon) + its count — the label is
 *  `privacyKindLabel(row.key, t)`. */
export type PrivacyRow = (typeof PRIVACY_KINDS)[number] & { count: number };

export interface PrivacyBreakdown {
  /** Categories with a non-zero count, richest first. */
  rows: PrivacyRow[];
  /** Sum of all row counts (= the card's big number). */
  total: number;
  /** How many conversations contributed ≥1 value. */
  chats: number;
}

/**
 * A conversation's COMPLETE value→kind map: the persisted `redactionKinds` PLUS
 * every message's `redactedSpans`. The send path historically recorded a typed
 * value's fine category ONLY onto the message (`redactedSpans`), not into the
 * conversation `redactionKinds` — so reading `redactionKinds` alone made user-typed
 * names/companies fall back to "secret". Merging the spans (which persist in the
 * saved conversation) heals that; the message span wins (it's the fine kind).
 * Mirrors the merge `ChatView` already does for the chat highlight.
 */
export function conversationKinds(c: Conversation): Record<string, string> {
  const map: Record<string, string> = { ...(c.redactionKinds ?? {}) };
  for (const m of c.messages) for (const s of m.redactedSpans ?? []) map[s.value] = s.kind;
  return map;
}

// Kinds the engine splits into per-WORD vault ALIASES (`pseudonymize` writes
// `nameAliases`/`emailNameAliases` + path segments straight into the vault, NOT as
// `matches`). Their bare fragments ("Sabourdin", "julien", an email local-part, a
// path segment) therefore never land in `redactionKinds` — so an exact-case lookup
// misses and the audit defaulted them to "secret". Only these three are fragmented,
// so only these are word-indexed (never secret/id/card/number → no pollution).
const FRAGMENTED_KINDS = new Set(["name", "email", "path"]);

/**
 * A conversation's value→kind map made RESOLVABLE for the per-word/casing alias
 * entries the vault carries but `redactionKinds` doesn't: a case-insensitive index
 * plus, for the fragmented kinds, each WORD of an entity → the entity's kind. Built
 * once per conversation (the audit joins thousands of vault rows against it).
 */
export interface KindIndex {
  /** Exact-case value → kind (the authoritative map; wins on lookup). */
  direct: Record<string, string>;
  /** Lowercased value AND per-word fragments (fragmented kinds only) → kind. */
  lower: Record<string, string>;
}

export function conversationKindIndex(c: Conversation): KindIndex {
  const direct = conversationKinds(c);
  const lower: Record<string, string> = {};
  for (const [value, kind] of Object.entries(direct)) {
    const lc = value.toLowerCase();
    if (!(lc in lower)) lower[lc] = kind;
    if (FRAGMENTED_KINDS.has(kind)) {
      for (const w of lc.split(/[^\p{L}\p{N}]+/u))
        if (w.length >= 2 && !(w in lower)) lower[w] = kind;
    }
  }
  return { direct, lower };
}

/** Resolve a vaulted value's kind: exact case → case-insensitive/word-fragment index.
 *  Returns undefined when genuinely unknown (caller decides the fallback). */
export function kindOf(index: KindIndex, value: string): string | undefined {
  return index.direct[value] ?? index.lower[value.toLowerCase()];
}

/** Shape a raw `kind → count` map into the sorted, non-empty rows + totals both the
 *  card and its modal read, so the two ALWAYS agree (card number = Σ rows). */
function build(counts: Record<string, number>, chats: number): PrivacyBreakdown {
  const rows = PRIVACY_KINDS.map((k) => ({ ...k, count: counts[k.key] ?? 0 }))
    .filter((k) => k.count > 0)
    .sort((a, b) => b.count - a.count);
  return { rows, total: rows.reduce((s, k) => s + k.count, 0), chats };
}

/**
 * ALL interceptions — every value the engine ever vaulted for the account: user
 * messages AND MCP tool results AND document/file redaction AND exported files.
 * Read from the persisted `redactionVault` (fake→original) + `redactionKinds`
 * (original→kind) — the same reload-safe source as the Audit tab. One count per
 * distinct vaulted value per conversation.
 */
export function vaultBreakdown(conversations: Conversation[]): PrivacyBreakdown {
  const counts: Record<string, number> = {};
  let chats = 0;
  for (const c of conversations) {
    const index = conversationKindIndex(c);
    let hasAny = false;
    // `protectedEntries` is what "a protected item" MEANS product-wide (the sidebar
    // shield and the chat header count the same way), so this card's total is that
    // number by construction — not a formula that has to be kept in step.
    for (const [, original] of protectedEntries(c)) {
      const kind = redactionCategory(kindOf(index, original) ?? "secret");
      counts[kind] = (counts[kind] ?? 0) + 1;
      hasAny = true;
    }
    if (hasAny) chats += 1;
  }
  return build(counts, chats);
}

/**
 * Only what the USER TYPED into messages (excludes tool results & documents): the
 * vaulted sensitive values that appear in a user message's own displayed text,
 * bucketed by type. Reload-safe — scans the persisted message `content` (which
 * holds the REAL values) against the vault, since a message's `redactedSpans` are
 * in-memory only. One count per (user message, value) it appears in.
 */
export function messageBreakdown(conversations: Conversation[]): PrivacyBreakdown {
  const counts: Record<string, number> = {};
  let chats = 0;
  for (const c of conversations) {
    const index = conversationKindIndex(c);
    // Distinct originals in this conversation's vault (skip trivially short values
    // that would false-match as substrings).
    const originals = [...new Set(Object.values(c.redactionVault ?? {}))].filter(
      (o) => o && o.length >= 2,
    );
    if (!originals.length) continue;
    let hasAny = false;
    for (const m of c.messages) {
      if (m.role !== "user" || !m.content) continue;
      for (const original of originals) {
        if (!m.content.includes(original)) continue;
        const kind = redactionCategory(kindOf(index, original) ?? "secret");
        counts[kind] = (counts[kind] ?? 0) + 1;
        hasAny = true;
      }
    }
    if (hasAny) chats += 1;
  }
  return build(counts, chats);
}
