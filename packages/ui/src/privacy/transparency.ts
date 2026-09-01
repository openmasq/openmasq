import { applyVault } from "@openmasq/redact";
import { conversationProtectedCount, protectedEntries } from "../state/protectedCount";
import type { Conversation, Message } from "../types";

/**
 * TRANSPARENCY — « voyez ce que le modèle a vu ».
 *
 * The product already keeps its promise, but only SHOWS it to those who know where
 * to look: a mark on hover, a line under each message, and a message-by-message
 * comparison that only existed in the technical log, reserved for internal accounts.
 * An ordinary user therefore could not VERIFY — only believe. That is the
 * finding of the 27/07 audit: the feature existed, hidden inside « Développeur ».
 *
 * Nothing here needs to be recorded at send time: what the model received
 * is RE-DERIVED from the real text and the conversation's coffre, via the same
 * substitution as the send (`applyVault`). The comparison therefore cannot lie by
 * deriving from a copy taken aside — it replays the same function, on the same data.
 */

/** A message and its counterpart as it actually went out. */
export interface TransparencyPair {
  id: string;
  role: Message["role"];
  /** What the user wrote — real values. */
  real: string;
  /** What the model received — values replaced by their pseudonyms. */
  wire: string;
  /** Number of values actually replaced in THIS message. */
  swapped: number;
}

/**
 * The message text as it counts for transparency: `modelContent` when it
 * exists (it carries the expanded documents, i.e. what ACTUALLY went out), otherwise the
 * displayed content.
 */
function sourceText(m: Message): string {
  return m.modelContent ?? m.content ?? "";
}

/**
 * How many protected values actually appear in this text.
 *
 * ⚠️ Over `protectedEntries`, never over the raw coffre: the latter carries the ALIASES of a
 * single value (each word of a name, its cases, an address's domain), and counting them
 * used to announce "9 replacements" above two columns that show 4.
 */
function countSwapped(real: string, wire: string, entries: [string, string][]): number {
  let n = 0;
  for (const [token, value] of entries) if (real.includes(value) && wire.includes(token)) n++;
  return n;
}

/**
 * A conversation's comparison: one pair per message that actually has
 * something to show.
 *
 * ⚠️ Messages WITHOUT any substitution are discarded — an identical pair on both sides
 * teaches nothing and dilutes the ones that matter. This is also what makes the card
 * honest: if it announces "N infos protected", the N are visible.
 */
export function transparencyPairs(conv: Conversation): TransparencyPair[] {
  const vault = conv.redactionVault ?? {};
  if (!Object.keys(vault).length) return [];
  const entries = protectedEntries(conv);
  const out: TransparencyPair[] = [];
  for (const m of conv.messages ?? []) {
    const real = sourceText(m);
    if (!real.trim()) continue;
    // The substitution stays the send's: the WHOLE coffre, aliases included. Only the
    // COUNT is read on distinct values.
    const wire = applyVault(real, vault);
    if (wire === real) continue;
    out.push({ id: m.id, role: m.role, real, wire, swapped: countSwapped(real, wire, entries) });
  }
  return out;
}

/**
 * How many distinct values were protected in this conversation — the card's
 * N. Re-export of the single definition (`state/protectedCount.ts`): the card, the
 * rail's shield and the chat header are read side by side, two formulas there would read
 * as a bug on the user's own data.
 */
export const protectedValueCount = conversationProtectedCount;

/**
 * Should the card show?
 *
 * Four conditions, and the first is what makes it bearable: it shows
 * ONLY ONCE, never per conversation. A reassurance banner that comes back on every
 * new chat stops being read by the third time, and becomes the noise the user
 * learns to get rid of — the opposite of what the audit asks for.
 *
 * It ALSO waits for the first reply: before it, the user has not yet seen anything
 * go out, and "voyez ce que le modèle a vu" points at nothing.
 */
export function shouldShowTransparencyCard(
  conv: Conversation | null | undefined,
  alreadySeen: boolean | undefined,
): boolean {
  if (!conv || alreadySeen) return false;
  if (protectedValueCount(conv) === 0) return false;
  const settledReply = (conv.messages ?? []).some((m) => m.role === "assistant" && !m.pending);
  if (!settledReply) return false;
  return transparencyPairs(conv).length > 0;
}
