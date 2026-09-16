import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import type { Host } from "../../host";
import type { Conversation, Settings } from "../../types";
import { sweepDeletions } from "../auth/dbWipeGuard";
import { dbFailure } from "../debug/dbReport";

export interface DbMirrorRefs {
  /** True once THIS account's DB load succeeded — the mirror writes only then. */
  dbActive: MutableRefObject<boolean>;
  /** Last-persisted `updatedAt` per conversation, so unchanged ones are not re-saved. */
  savedVersions: MutableRefObject<Map<string, number>>;
  /** Last-persisted identity of each conversation's REVERSIBILITY blob (see below). */
  revSnaps: MutableRefObject<Map<string, unknown[]>>;
}

/** Created by the store and RESET by the account switch — never carried across accounts. */
export function useDbMirrorRefs(): DbMirrorRefs {
  const dbActive = useRef(false);
  const savedVersions = useRef(new Map<string, number>());
  const revSnaps = useRef(new Map<string, unknown[]>());
  return useMemo(() => ({ dbActive, savedVersions, revSnaps }), []);
}

/**
 * Mirror conversations and settings to the Host DB, the durable copy on desktop.
 *
 * Message bodies are DEBOUNCED 700 ms: `conversations` changes on every streamed token
 * and serialising the whole set per token is O(n²). The reversibility blob (vault, salt,
 * kinds, checkpoint, ledger) flushes IMMEDIATELY instead — the debounce re-arms on every
 * token, so during a whole stream nothing would reach disk, and a crash would lose the
 * vault of a turn whose redacted text already LEFT the machine. Those fields are only ever
 * replaced wholesale by a patch, so a changed reference IS a changed blob.
 */
export function useDbMirror({
  host,
  conversations,
  settings,
  db,
}: {
  host: Host;
  conversations: Conversation[];
  settings: Settings;
  db: DbMirrorRefs;
}) {
  useEffect(() => {
    if (!host.db || !db.dbActive.current) return;
    for (const c of conversations) {
      const sig = [c.redactionVault, c.redactionSalt, c.redactionKinds, c.turnCheckpoint, c.writeLedger];
      const prev = db.revSnaps.current.get(c.id);
      db.revSnaps.current.set(c.id, sig);
      // First sight (boot hydration, creation) seeds the snapshot; the debounced pass saves.
      if (prev && sig.some((v, i) => v !== prev[i])) {
        host.db!.saveConversation(c).catch(dbFailure("save-conversation"));
        db.savedVersions.current.set(c.id, c.updatedAt);
      }
    }
    const t = setTimeout(() => {
      const current = new Map(conversations.map((c) => [c.id, c.updatedAt]));
      for (const c of conversations) {
        if (db.savedVersions.current.get(c.id) !== c.updatedAt) {
          host.db!.saveConversation(c).catch(dbFailure("save-conversation"));
        }
      }
      sweepDeletions(db.savedVersions.current, current, (id) =>
        host.db!.deleteConversation(id).catch(dbFailure("delete-conversation")),
      );
      db.savedVersions.current = current;
    }, 700);
    return () => clearTimeout(t);
  }, [host, conversations]);

  useEffect(() => {
    if (!host.db || !db.dbActive.current) return;
    const t = setTimeout(() => host.db!.saveSettings(settings).catch(dbFailure("save-settings")), 700);
    return () => clearTimeout(t);
  }, [host, settings]);
}
