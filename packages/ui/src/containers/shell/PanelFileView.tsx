import { useEffect, useState } from "react";
import { useHost, type FileMeta } from "../../host";
import type { Conversation } from "../../types";
import { LibraryFileModal } from "../../pages/Library/LibraryFileModal";
import { libKindOf } from "../../pages/Library/libraryKinds";
import type { ReattachSource } from "../../pages/Library/reattach";
import { FileSkeleton } from "../modals/viewers/FileSkeleton";
import { fileSkelVariant } from "../modals/viewers/fileKind";

/**
 * The side panel's FILE content: resolves the stored file's meta (redacted flag,
 * content hash) from its owning conversation's storage, then renders the SAME rich
 * detail panel as the bibliothèque (`LibraryFileModal panel` — redacted/original,
 * Conversations, « Demander »). One viewer for every file, wherever it was opened.
 * Degrades to defaults when the lookup can't run (no DB / unknown conversation) —
 * the preview still renders, only the usage/redacted extras are conservative.
 */
export function PanelFileView({
  id,
  name,
  mime,
  convId,
  conversations,
  onClose,
  onReattach,
  onOpenConversation,
}: {
  id: string;
  name: string;
  mime?: string;
  /** Storage id of the conversation that owns the file (resolves vault + meta). */
  convId?: string;
  conversations: Conversation[];
  onClose: () => void;
  onReattach?: (src: ReattachSource) => void;
  onOpenConversation?: (id: string, msgId?: string) => void;
}) {
  const host = useHost();
  const [meta, setMeta] = useState<FileMeta | "pending" | "none">("pending");
  useEffect(() => {
    let alive = true;
    setMeta("pending");
    const list = host.db?.listFiles;
    if (!convId || !list) {
      setMeta("none");
      return;
    }
    list(convId)
      .then((ms) => alive && setMeta(ms.find((m) => m.id === id) ?? "none"))
      .catch(() => alive && setMeta("none"));
    return () => {
      alive = false;
    };
  }, [host, id, convId]);

  if (meta === "pending") return <FileSkeleton variant={fileSkelVariant(mime ?? "", name)} />;
  const m = meta === "none" ? undefined : meta;
  return (
    <LibraryFileModal
      panel
      file={{
        id,
        name,
        mime: m?.mime ?? mime ?? "",
        redacted: m?.redacted ?? false,
        // Without it, a PDF/image (bytes not redactable in place → redacted=false,
        // only the COUNT states the masking) would lose its « Données masquées » line + toggle.
        redactedCount: m?.redactedCount,
        createdAt: m?.createdAt ?? 0,
        contentHash: m?.contentHash,
        conversationId: convId ?? "",
        conversationTitle: "",
        kind: libKindOf(m?.mime ?? mime ?? "", name),
      }}
      conversations={conversations}
      onClose={onClose}
      onReattach={onReattach}
      onOpenConversation={onOpenConversation}
    />
  );
}
