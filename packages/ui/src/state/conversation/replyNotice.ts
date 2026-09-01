/**
 * "Your reply has arrived" — the PURE logic of the system notification.
 *
 * Two decisions, and only one is obvious:
 *
 * 1. **WHEN**: a conversation that just settled (its last assistant message
 *    is no longer `pending`) and that isn't being WATCHED. "Watched" = the window has focus
 *    AND it's the active tab — turns run in parallel per tab, so staying
 *    in the app while ANOTHER thread replies counts as being elsewhere.
 * 2. **WHAT**: never the content, never the conversation's TITLE. A title is derived
 *    from the first message, hence from real un-redacted data — and a notification
 *    lands in the system's notification center, shows over whatever is
 *    on screen, sometimes on a locked or shared screen. The click leads to the right thread;
 *    that's what identifies it, not the banner.
 *
 * A FAILED turn also notifies: leaving to do something else and coming back to a dead
 * send without having known is exactly what the "a real failure gets said" rule forbids.
 */
import { BRAND } from "@openmasq/branding";

/** What the logic needs to know about a conversation — nothing more. */
export interface NoticeConv {
  id: string;
  messages: { role: string; pending?: boolean; error?: boolean }[];
}

/** The ids whose LAST assistant message is currently being generated. */
export function pendingReplyIds(convs: readonly NoticeConv[]): Set<string> {
  const out = new Set<string>();
  for (const c of convs) {
    const last = [...c.messages].reverse().find((m) => m.role === "assistant");
    if (last?.pending) out.add(c.id);
  }
  return out;
}

/** A conversation to announce: its id, and whether the turn ended in failure. */
export interface ReplyNotice {
  id: string;
  failed: boolean;
}

/**
 * The conversations that just settled AND aren't being watched.
 *
 * ⚠️ `prev` is the set from the PREVIOUS tick: the transition (`in progress` → `settled`)
 * is what triggers it, never the "not in progress" state — otherwise every already-finished
 * conversation would notify on every render, and opening the app would fire a volley.
 */
export function repliesToAnnounce(p: {
  prev: ReadonlySet<string>;
  convs: readonly NoticeConv[];
  /** The watched tab. `null` = none. */
  activeId: string | null;
  /** The window has system focus. */
  focused: boolean;
}): ReplyNotice[] {
  const now = pendingReplyIds(p.convs);
  const out: ReplyNotice[] = [];
  for (const id of p.prev) {
    if (now.has(id)) continue; // still in progress
    const conv = p.convs.find((c) => c.id === id);
    if (!conv) continue; // deleted during the turn: nothing left to open
    if (p.focused && id === p.activeId) continue; // right in front of them: the banner would be noise
    const last = [...conv.messages].reverse().find((m) => m.role === "assistant");
    out.push({ id, failed: !!last?.error });
  }
  return out;
}

/** The banner's text. No conversation content — see the file header. */
export function noticeText(n: ReplyNotice, modelLabel?: string): { title: string; body: string } {
  return {
    title: BRAND.name,
    body: n.failed
      ? "L'envoi a échoué — ouvrez la conversation pour réessayer."
      : modelLabel
        ? `Réponse prête · ${modelLabel}`
        : "Réponse prête.",
  };
}
