import { useCallback, useRef } from "react";
import { createStagedFiles } from "../files/stagedFiles";

/**
 * Per-conversation UNSENT composer drafts and staged attachments. Held in REFS, not
 * state: a draft survives navigation and tab switches (the store lives above the shell),
 * typing re-renders nothing, and nothing is ever persisted — a half-typed sensitive
 * message stays in memory only. Both are dropped when their conversation is deleted.
 */
export function useComposerScratch() {
  const draftsRef = useRef<Record<string, string>>({});
  const getDraft = useCallback((id: string) => draftsRef.current[id] ?? "", []);
  const setDraft = useCallback((id: string, text: string) => {
    if (text) draftsRef.current[id] = text;
    else delete draftsRef.current[id];
  }, []);

  const stagedRef = useRef(createStagedFiles());
  const getStagedAttachments = useCallback((id: string) => stagedRef.current.get(id), []);
  const setStagedAttachments = useCallback(
    (id: string, items: readonly unknown[]) => stagedRef.current.set(id, items),
    [],
  );
  const dropScratch = useCallback((id: string) => {
    delete draftsRef.current[id];
    stagedRef.current.drop(id);
  }, []);

  return { getDraft, setDraft, getStagedAttachments, setStagedAttachments, dropScratch };
}
