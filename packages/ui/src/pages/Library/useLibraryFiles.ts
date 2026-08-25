import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { useHost } from "../../host";
import type { Conversation } from "../../types";
import { libKindOf } from "./libraryKinds";
import type { LibFile } from "./libFile";

/**
 * Aggregate every stored file across all conversations (`host.db.listFiles`) — the
 * source BOTH the Bibliothèque grid and the ⌘K palette read (rule 9: one listing,
 * not two that drift). Files are keyed by the conversation's STORAGE id
 * (`sessionConversationId` when set, else the local id), so both are queried;
 * de-duped by id, newest first. `null` = still loading, `[]` = no DB / none.
 *
 * `enabled` gates the fetch: the Library page is always on when mounted (default
 * true), but the palette pays the N-lookup cost ONLY while it's open, not on every
 * shell render. `setFiles` is returned so a caller can apply an optimistic mutation
 * (the grid's delete) without a refetch.
 */
export function useLibraryFiles(
  conversations: Conversation[],
  enabled = true,
): { files: LibFile[] | null; setFiles: Dispatch<SetStateAction<LibFile[] | null>> } {
  const host = useHost();
  const [files, setFiles] = useState<LibFile[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const list = host.db?.listFiles;
    if (!list) {
      setFiles([]);
      return;
    }
    let alive = true;
    const lookups = conversations.flatMap((c) => {
      const ids = [c.id, c.sessionConversationId].filter(Boolean) as string[];
      return [...new Set(ids)].map((id) =>
        list(id)
          .then((metas) =>
            metas.map((m) => ({
              ...m,
              conversationId: id,
              conversationTitle: c.title || "Nouvelle conversation",
              kind: libKindOf(m.mime, m.name),
            })),
          )
          .catch(() => [] as LibFile[]),
      );
    });
    Promise.all(lookups).then((groups) => {
      if (!alive) return;
      const seen = new Set<string>();
      const flat = groups
        .flat()
        .filter((f) => (seen.has(f.id) ? false : (seen.add(f.id), true)))
        .sort((a, b) => b.createdAt - a.createdAt);
      setFiles(flat);
    });
    return () => {
      alive = false;
    };
  }, [host, conversations, enabled]);
  return { files, setFiles };
}
