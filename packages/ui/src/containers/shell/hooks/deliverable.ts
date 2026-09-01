/**
 * « Le document apparaît tout seul » — the rule behind it, pure.
 *
 * When a turn ENDS with a document the app produced (a `run_python` deliverable, a file a
 * connector returned), that document opens itself in the side panel beside the reply. No
 * button, no chip to hunt for: the thing you asked for is simply there.
 *
 * ⚠️ Nothing here is about redaction. In this repo **« reveal » means un-redacting a
 * value** (`containers/modals/viewers/doc/docReveal.ts`) — a wire-affecting, leak-shaped
 * operation. This file only decides WHICH FILE to put on screen; it never touches a vault,
 * and its vocabulary stays « deliverable / delivered » so the two can't be misread.
 *
 * The whole design problem is knowing when NOT to open. A surface that opens itself is a
 * surface that can interrupt, so every rule below exists to make it predictable to the
 * point of being unnoticeable — it fires on the turn you just watched finish, and at no
 * other moment. They are pinned by `deliverable.test.ts`; the effect that runs them is
 * `useOpenDeliverable.ts`, DESKTOP-only (on mobile the panel is a full-screen sheet, so
 * opening would cover the answer the user is reading).
 */
import { findStoredFile, type StoredFileRef } from "../../../state/files/storedFiles";

/** The narrow shape the rule reads — `Message` satisfies it. */
export type DeliverableMessage = {
  id: string;
  role: string;
  pending?: boolean;
  error?: boolean;
  attachments?: readonly { name: string; kind: string }[];
};

/** The document to put on screen, identified by the message that DELIVERED it. */
export type Deliverable = { messageId: string; name: string };

/** Per conversation: the deliverable already accounted for (`""` = none). Session-only. */
export type DeliveredSeen = Readonly<Record<string, string>>;

/**
 * The LATEST COMPLETED assistant turn's final document, or null.
 *
 * Scanning stops at the first settled assistant message — that turn IS the answer on
 * screen, and an older turn's document was already accounted for. So a reply still
 * streaming keeps the previous turn's verdict (no mid-stream pop-in), and a failed turn
 * delivers nothing.
 *
 * Images are excluded: a chart already renders INLINE in the bubble, and stealing the
 * panel for it would hide the prose that explains it. The LAST document wins — a run that
 * writes `chart.png` then `rapport.pdf` delivered the PDF.
 */
export function pickDeliverable(messages: readonly DeliverableMessage[]): Deliverable | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m.role !== "assistant" || m.pending) continue;
    if (m.error) return null;
    const docs = (m.attachments ?? []).filter((a) => a.kind !== "image");
    const last = docs[docs.length - 1];
    return last ? { messageId: m.id, name: last.name } : null;
  }
  return null;
}

/**
 * Advance the session record and say whether THIS change earns opening a document.
 *
 * ⚠️ **First sight of a conversation only RECORDS.** Opening a thread whose last turn
 * produced a file — a reload, a tab switch, a background turn that finished elsewhere —
 * must not pop that file open: the user came to read, not to be handed a document they
 * already saw. A delivery is a TRANSITION, watched live.
 *
 * Opening once per delivering message is also what makes closing the tab stick: the
 * document the user dismissed is already accounted for, so nothing re-opens it. A
 * « Régénérer » mints a new message and legitimately delivers again — that is a new result.
 */
export function nextDelivery(
  seen: DeliveredSeen,
  convId: string,
  messages: readonly DeliverableMessage[],
): { seen: DeliveredSeen; deliver: Deliverable | null } {
  const found = pickDeliverable(messages);
  const key = found?.messageId ?? "";
  const known = seen[convId];
  if (known === key) return { seen, deliver: null };
  return { seen: { ...seen, [convId]: key }, deliver: known === undefined ? null : found };
}

/**
 * Turn a deliverable into the panel item to open, or null when the row can't be resolved
 * (no DB — the browser preview; the file card in the bubble stays the way in).
 *
 * ⚠️ `convId` is the STORAGE id the row was FOUND under, not the conversation the user is
 * in. The viewer resolves the file's meta and its redacted version through that id, so
 * handing it the conversation id would silently drop both for a keyless thread.
 */
export async function deliverablePayload<T extends StoredFileRef>(
  deliverable: Deliverable,
  storageIds: readonly (string | null | undefined)[],
  list: ((conversationId: string) => Promise<T[]>) | undefined,
): Promise<{ id: string; name: string; mime?: string; convId: string } | null> {
  const found = await findStoredFile(deliverable.name, storageIds, list);
  if (!found) return null;
  return { id: found.meta.id, name: found.meta.name, mime: found.meta.mime, convId: found.convId };
}
