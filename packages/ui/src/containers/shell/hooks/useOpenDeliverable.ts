import { useEffect, useRef } from "react";
import { useHost } from "../../../host";
import { panelOpenFile, useAppDispatch, type Section } from "../../../state/redux";
import type { ChatStore } from "../../../state/store";
import { deliverablePayload, nextDelivery, type DeliveredSeen } from "./deliverable";

/**
 * Opens the document a turn just produced in the side panel, beside the reply — the
 * effect half of `deliverable.ts`, which owns every rule about WHEN (and above all when
 * not) and is where to look first if the behaviour surprises you.
 *
 * Mounted by `DesktopShell` ONLY: on mobile the panel is a full-screen sheet, so opening
 * would cover the answer the user is reading. That is the sanctioned platform seam —
 * never a `mobile ?` branch inside a shared component.
 *
 * What has already been delivered is a REF, not store state: it says what THIS SESSION
 * watched happen, which is exactly as durable as the panel itself (session-only, never
 * persisted). A remount is harmless — the first-sight rule makes a fresh record record
 * rather than open.
 */
export function useOpenDeliverable({ chat, section }: { chat: ChatStore; section: Section }): void {
  const dispatch = useAppDispatch();
  const host = useHost();
  const seen = useRef<DeliveredSeen>({});
  const conv = chat.conversations.find((c) => c.id === chat.activeId) ?? null;
  const convId = conv?.id ?? null;
  const messages = conv?.messages;
  const storageId = conv?.sessionConversationId;

  useEffect(() => {
    // The panel does not live in the other sections, so opening there would put a document
    // where the user cannot see it — and then ambush them on the way back to the chats.
    if (section !== "chats" || !convId || !messages) return;
    const step = nextDelivery(seen.current, convId, messages);
    seen.current = step.seen;
    const deliver = step.deliver;
    if (!deliver) return;

    // The attachment carries a NAME; the panel needs the stored row. The file is always
    // written BEFORE the message gains its attachment (`state/store.ts`, `onPythonFile`),
    // so there is nothing to wait for — a miss here means no DB (browser preview), and
    // the file card in the bubble stays the way in.
    let alive = true;
    void (async () => {
      const item = await deliverablePayload(
        deliver,
        [convId, storageId],
        host.db?.listFiles?.bind(host.db),
      );
      if (alive && item) dispatch(panelOpenFile(item));
    })();
    return () => {
      alive = false;
    };
  }, [section, convId, messages, storageId, host, dispatch]);
}
