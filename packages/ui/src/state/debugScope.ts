import { DRAFT_CONV, type DebugEntry } from "./debug";

/**
 * Who can see which journal entry — the debug journal's ONE confidentiality
 * question, hence its own module (rule 10: a trust-boundary check reads as
 * one block, it doesn't dilute into the ring buffer that stores it).
 *
 * **This is THE rule, and there is only one**: the modal, the export attached to feedback
 * (`journalExportFor`) and the e2e bridge all go through here. The three used to carry their own
 * copy of the predicate, and the last two stayed on the pre-11/08 version —
 * a confidentiality rule copied in three places only gets fixed at the first
 * (rule 9). Don't rewrite a fourth one: call this one.
 *
 * The DRAFT (`DRAFT_CONV`, debug.ts) is part of it: a document redacted before a
 * conversation exists is stamped with a sentinel, visible only on a chat still
 * blank, then ADOPTED by the conversation the first send creates — the entries
 * reach their conversation instead of being lost.
 */

/**
 * The entries a conversation's journal is allowed to display.
 *
 *  • stamped with a conversation → only its own;
 *  • stamped DRAFT → only a chat with no conversation (before adoption);
 *  • no `conv` → NOWHERE.
 *
 * ⚠️ This last branch was REVERSED (12/08). It used to show an unattributed
 * entry everywhere, provided it carried no real values: an "application-level
 * event" (lifecycle step, startup error) has nothing to leak, and
 * showing it was better than losing it. Two things did away with that compromise:
 *
 *  1. **The journal is PER CONVERSATION, no exception** — the modal says so in plain
 *     words (« pour cette conversation »). A line present in all five tabs casts
 *     doubt on the other four: you no longer know if it came from here.
 *  2. **No emitter produces an unattributed entry any more.** They all stamp, and
 *     "no conversation yet" is not "no conversation" — it's `DRAFT_CONV`
 *     (`ocrDebug.ts` even refuses `undefined`). So the branch no longer served the
 *     app events it protected: it only served the PERSISTED entries
 *     from before 11/08, unstamped, that the encrypted ring brings back on every startup —
 *     in every conversation, indefinitely. That's the reported symptom (« en changeant de
 *     conversation le journal reste le même »). `attachDebugStore` drops them at
 *     hydration, and this makes them invisible if they arrive by another path.
 *
 * The accepted corollary: the day a legitimate app emitter appears (a startup
 * diagnostic), it will have no conversation to name and its entry won't display.
 * It will need a surface of its own, not a borrowed spot in a thread's journal.
 */
export function isEntryVisibleIn(e: DebugEntry, convId?: string | null): boolean {
  if (e.conv === DRAFT_CONV) return convId == null;
  return e.conv != null && e.conv === convId;
}
