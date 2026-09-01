import { entityKey } from "@openmasq/redact";
import type { Conversation } from "../types";

/**
 * "How many values did the app protect" — the ONE definition every surface that shows
 * that number must use (rule 9): the sidebar shield, the chat header, the mobile
 * thread badge, the Réglages → Confidentialité « tout ce qui a été masqué » card,
 * the Transparence insert and its comparison, and the Journal tab. The user compares them
 * side by side, so a second formula reads as a bug about their data, not as a nuance.
 *
 * A protected item = **one distinct VALUE the engine recognised**, read off the
 * conversation's persisted vault (fake → original). That source is reload-safe and
 * covers every path a value can be redacted by — typed text, MCP tool results,
 * documents, exports.
 *
 * ⚠️ **The coffre carries MULTIPLE entries for a single value, and they must not be
 * counted.** For a name, the engine also writes each WORD there and its case
 * variants (« Claire », « claire », « Berliand », « berliand »); for an address, its DOMAIN.
 * They exist so substitution catches every spelling — they are aliases of the
 * same piece of information, not additional pieces of information. Counted, a
 * message carrying a name, an email, a phone number and an IBAN announced « 9
 * informations protégées » over a comparison that showed only 4: the number
 * contradicted the proof it introduces.
 *
 * `redactionKinds` (⊕ the messages' `redactedSpans`) contains ONLY the values
 * recognised as matches — never an alias — so it says which are
 * canonical. A non-canonical entry whose key is a fragment of a canonical one is
 * an alias; everything else is kept. A conversation from before `redactionKinds` has
 * nothing canonical: we don't guess, we render the coffre as-is (no under-count).
 *
 * The rail used to sum each message's `redactions` instead, which is a different
 * quantity twice over: it counts a send's match OCCURRENCES (a value typed twice
 * counts twice) and only the ones found in typed message text, so documents and tool
 * results were missing. `Settings/privacy/privacyStats.test.ts` pins the parity.
 */

/** The real values the engine RECOGNISED in this conversation — the union of the
 *  persisted `redactionKinds` and the `redactedSpans` still in memory. */
function canonicalValues(c: Conversation): Set<string> {
  const out = new Set<string>(Object.keys(c.redactionKinds ?? {}));
  for (const m of c.messages ?? []) for (const s of m.redactedSpans ?? []) out.add(s.value);
  return out;
}

/** The RAW entries of the coffre, aliases included — substitution uses all of them. */
export function vaultEntries(c: Conversation): [fake: string, original: string][] {
  return Object.entries(c.redactionVault ?? {}).filter(
    (e): e is [string, string] => !!e[0] && !!e[1],
  );
}

/** One entry per protected value: the coffre's aliases folded onto theirs. */
export function protectedEntries(c: Conversation): [fake: string, original: string][] {
  const all = vaultEntries(c);
  const canonKeys = [...canonicalValues(c)].map(entityKey).filter(Boolean);
  if (!canonKeys.length) return all;
  const canonical = new Set(canonKeys);
  const seen = new Set<string>();
  const out: [string, string][] = [];
  for (const [fake, original] of all) {
    const key = entityKey(original);
    if (!key) continue;
    // An alias: the value isn't recognised for itself, and its key is only a
    // fragment of a value that is. (The fragment test NEVER applies to a
    // canonical: « Claire Berliand » is contained in « claire.berliand@… » without being
    // an alias of the address — these are two distinct pieces of information.)
    if (!canonical.has(key) && canonKeys.some((ck) => ck.includes(key))) continue;
    if (seen.has(key)) continue; // case/punctuation variants of the same value
    seen.add(key);
    out.push([fake, original]);
  }
  return out;
}

/** Values protected in ONE conversation (the chat header's number). */
export function conversationProtectedCount(c: Conversation): number {
  return protectedEntries(c).length;
}

/** Values protected across the account (the sidebar shield's number). */
export function protectedCount(conversations: readonly Conversation[]): number {
  return conversations.reduce((n, c) => n + conversationProtectedCount(c), 0);
}
