import { useMemo } from "react";
import type { Conversation } from "../../types";
import { FileViewerModal } from "../../containers/modals";
import { FileUsagePanel } from "./FileUsagePanel";
import { useFileUsage } from "./useFileUsage";
import type { LibFile } from "./libFile";
import type { ReattachSource } from "./reattach";

/**
 * The Bibliothèque's file viewer: the modal plus the usage data its Conversations
 * tab needs.
 *
 * Its own component (rather than inlined in LibraryView) because `useFileUsage` must
 * run for the OPEN file only — a hook cannot be called for a `viewing` that is null,
 * and the count has to be known before the tab is opened.
 */
export function LibraryFileModal({
  file,
  conversations,
  onClose,
  onOpenConversation,
  onReattach,
  onOpenInTab,
  panel,
}: {
  file: LibFile;
  conversations: Conversation[];
  onClose: () => void;
  onOpenConversation?: (id: string, msgId?: string) => void;
  onReattach?: (src: ReattachSource) => void;
  onOpenInTab?: (src: ReattachSource) => void;
  /** Kit: render as the library's inline right-side detail panel, not a modal. */
  panel?: boolean;
}) {
  const usageFile = useMemo(
    () => ({
      id: file.id,
      name: file.name,
      mime: file.mime,
      contentHash: file.contentHash,
      conversationId: file.conversationId,
    }),
    [file],
  );
  const { used, loading } = useFileUsage(usageFile, conversations);

  // The conversation that owns the file — its vault is the viewer's FALLBACK for rows
  // stored before the drop-time map was persisted (`extraction.redactions`, which the
  // modal now prefers: the conversation vault over-marks and re-tints this document).
  const conv = useMemo(
    () =>
      conversations.find(
        (c) => c.id === file.conversationId || c.sessionConversationId === file.conversationId,
      ) ?? null,
    [file.conversationId, conversations],
  );

  return (
    <FileViewerModal
      id={file.id}
      name={file.name}
      mime={file.mime}
      // An image/PDF has no scrubbed BYTES (redacted=false) but may still have redacted
      // content (redactedCount>0) — the masked-items note must reflect that, like the card.
      redacted={file.redacted || !!file.redactedCount}
      vault={conv?.redactionVault}
      kinds={conv?.redactionKinds}
      onClose={onClose}
      panel={panel}
      onAsk={
        onReattach
          ? () => {
              // « Demander » opens a FRESH conversation with the file staged
              // (that's what `onReattach` does). As the side PANEL, keep the
              // document open BESIDE the new conversation — the same split the
              // usage rows land in. As a MODAL it covers the chat, so it must
              // close first.
              if (!panel) onClose();
              onReattach({ id: file.id, name: file.name, mime: file.mime });
            }
          : undefined
      }
      extraTabs={[
        {
          id: "conversations",
          label: "Conversations",
          // Undefined while loading — the tab shows no badge rather than a "0" that
          // contradicts the panel it labels.
          count: loading ? undefined : used.length,
          node: (
            <FileUsagePanel
              file={usageFile}
              conversations={conversations}
              onOpenConversation={(id, msgId) => {
                // As a MODAL the viewer covers the chat, so it must close first.
                // As the side PANEL it must NOT: the point of the split is landing
                // on the conversation with the document still open beside it (the
                // shell decides whether to keep the panel item).
                if (!panel) onClose();
                onOpenConversation?.(id, msgId);
              }}
              onOpenInTab={onOpenInTab}
              onReattach={(src) => {
                onClose();
                onReattach?.(src);
              }}
            />
          ),
        },
      ]}
    />
  );
}
