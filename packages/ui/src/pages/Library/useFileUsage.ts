import { useEffect, useState } from "react";
import { useHost } from "../../host";
import type { Conversation } from "../../types";
import type { ReattachSource } from "./reattach";

/** A library file enriched with what the usage panel needs. */
export interface UsageFile extends ReattachSource {
  contentHash?: string | null;
  /** Storage id of the conversation this row came from (fallback when no hash). */
  conversationId: string;
}

/**
 * Which conversations have used the SAME file, matched by content hash.
 *
 * Lifted out of FileUsagePanel because the viewer's tab shows the COUNT before the
 * tab is opened, and the count and the list must be the same number — a badge fed
 * by its own query could disagree with the panel it labels.
 *
 * `used` is empty while `loading` — the caller must not render "0 conversations"
 * during the query, since the file is in the library precisely because it was used
 * at least once.
 */
/**
 * A one-line taste of a conversation, for the usage row (the kit shows one under the
 * title). The LAST message with text — that is what "where did this file end up" is
 * asking about.
 *
 * Text only: an attachment-only message has nothing to quote, and we must never invent
 * one. Collapses newlines so a multi-line answer can't blow the row's height.
 */
/**
 * The message a file is ANCHORED to in a conversation: the first one carrying it
 * as an attachment, matched by NAME (messages don't store content hashes; within
 * one conversation the attachment's name is the identity the user sees).
 * Undefined → the caller opens the conversation without scrolling.
 */
export function fileAnchorIn(c: Conversation, fileName: string): string | undefined {
  return c.messages.find((m) => m.attachments?.some((a) => a.name === fileName))?.id;
}

export function conversationSnippet(c: Conversation): string {
  for (let i = c.messages.length - 1; i >= 0; i--) {
    const t = c.messages[i]?.content?.trim();
    if (t) return t.replace(/\s+/g, " ").slice(0, 140);
  }
  return "";
}

export function useFileUsage(
  file: UsageFile,
  conversations: Conversation[],
): { used: Conversation[]; loading: boolean } {
  const host = useHost();
  const [storageIds, setStorageIds] = useState<string[] | null>(null);

  useEffect(() => {
    let alive = true;
    const q = host.db?.conversationsForFile;
    // No hash / no host query ⇒ the row's own conversation is all we can claim.
    if (!q || !file.contentHash) {
      setStorageIds([file.conversationId]);
      return;
    }
    q(file.contentHash)
      .then((ids) => alive && setStorageIds(ids.length ? ids : [file.conversationId]))
      .catch(() => alive && setStorageIds([file.conversationId]));
    return () => {
      alive = false;
    };
  }, [host, file.contentHash, file.conversationId]);

  // Storage id → local conversation (match the local id OR the keyless
  // sessionConversationId), de-duplicated by local id.
  const used = (storageIds ?? [])
    .map((sid) => conversations.find((c) => c.id === sid || c.sessionConversationId === sid))
    .filter((c): c is Conversation => !!c)
    .filter((c, i, a) => a.findIndex((x) => x.id === c.id) === i);

  return { used, loading: storageIds === null };
}
