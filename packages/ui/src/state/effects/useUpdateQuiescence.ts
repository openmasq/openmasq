import { useEffect, useRef } from "react";
import type { Host } from "../../host";

/**
 * Is the app BUSY in the sense of an update's AUTO-INSTALL? Pure, tested.
 *
 * Busy = a send in flight (the global flag also covers agentic turns and their
 * `run_python`), OR a non-empty draft in any conversation — drafts
 * are memory-only ON PURPOSE (`state/CLAUDE.md`), so an automatic restart
 * would silently destroy them. Doubt costs at worst a missed
 * install window; the reverse costs the user's work.
 */
export function updateBusy(p: {
  isStreaming: boolean;
  conversations: readonly { id: string }[];
  getDraft: (convId: string) => string;
}): boolean {
  if (p.isStreaming) return true;
  return p.conversations.some((c) => (p.getDraft(c.id) ?? "").trim().length > 0);
}

/**
 * Answers main's quiescence probe (`updates/autoInstall.ts`): a downloaded build
 * only self-installs (app backgrounded/inactive) if the UI reports itself
 * free — silence = busy on main's side, so the absence of this hook (web preview, preload
 * not restarted) disables auto-install instead of making it blind.
 */
export function useUpdateQuiescence(p: {
  host: Host;
  isStreaming: boolean;
  conversations: readonly { id: string }[];
  getDraft: (convId: string) => string;
}): void {
  const ref = useRef(p);
  ref.current = p;
  useEffect(() => {
    const u = p.host.updates;
    if (!u?.onQuiescenceAsk || !u.replyQuiescence) return;
    return u.onQuiescenceAsk((askId) => {
      const { isStreaming, conversations, getDraft } = ref.current;
      u.replyQuiescence?.(askId, updateBusy({ isStreaming, conversations, getDraft }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- host stable per platform
  }, []);
}
