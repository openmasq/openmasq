import { useEffect, useRef } from "react";
import type { Conversation, Settings } from "../../types";
import type { Host } from "../../host";
import { findModelAny } from "../../prompt/models";
import { noticeText, pendingReplyIds, repliesToAnnounce } from "../conversation/replyNotice";

/**
 * The system notification "your reply has arrived" — the OBSERVER.
 *
 * ⚠️ It watches the STATE, it doesn't hook into a send's completion. A turn settles
 * through half a dozen paths (finished stream, errored stream, tool loop, fail-closed
 * refusal, manual stop), all in `store.ts`: hooking each one means forgetting one on
 * the next path added, and nobody will notice the notification is gone. A single
 * observed transition (`pending` → no longer `pending`) covers all of them by construction.
 *
 * The WHEN and the WHAT are pure and tested (`state/replyNotice.ts`). Here: the window's
 * focus, the platform call, and the click that returns to the right thread.
 */
export function useReplyNotice(p: {
  conversations: Conversation[];
  activeId: string | null;
  settings: Settings;
  host: Host;
  /** Open the clicked conversation (the platform has already focused the window). */
  onOpen: (conversationId: string) => void;
}): void {
  const { conversations, activeId, settings, host, onOpen } = p;
  // Absent ⇒ the setting isn't offered either (see `AccountTab`): nothing to do.
  const on = !!host.notify && settings.notifyOnReply !== false;

  // The "in-progress" set from the previous tick. A ref, not state: comparing it must
  // not trigger the render that recomputes it.
  const pendingRef = useRef<Set<string>>(new Set());
  // System focus, read via event rather than an on-the-fly `document.hasFocus()`:
  // the transition arrives in an effect, so AFTER the render, and the one-off call
  // sometimes reads before the browser has handed focus back to the window.
  const focusedRef = useRef(typeof document === "undefined" || document.hasFocus());
  useEffect(() => {
    const set = (v: boolean) => () => {
      focusedRef.current = v;
    };
    const onFocus = set(true);
    const onBlur = set(false);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  // The click returns to the thread. Subscribed even when the setting is OFF: a
  // banner can survive in the notification centre past a deactivation, and clicking
  // it must still open the right conversation rather than do nothing.
  const openRef = useRef(onOpen);
  openRef.current = onOpen;
  useEffect(() => {
    return host.notify?.onActivate((id) => openRef.current(id)); // the unsubscribe, explicit
  }, [host]);

  useEffect(() => {
    const prev = pendingRef.current;
    pendingRef.current = pendingReplyIds(conversations);
    if (!on) return;
    const notices = repliesToAnnounce({
      prev,
      convs: conversations,
      activeId,
      focused: focusedRef.current,
    });
    for (const n of notices) {
      const conv = conversations.find((c) => c.id === n.id);
      const label = conv?.modelId ? findModelAny(conv.modelId)?.label : undefined;
      const { title, body } = noticeText(n, label);
      host.notify?.reply({ conversationId: n.id, title, body });
    }
  }, [conversations, activeId, on, host]);
}
