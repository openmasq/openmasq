import { useCallback, useMemo, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { OrgProfileInfo } from "../../host";
import type { Conversation, Settings } from "../../types";
import { levelOf, notorietyForLevel } from "../../privacy/privacyLevel";
import { disabledKindsOf, effectiveRedactCategories } from "../../send/redactionOptions";
import { replaceDocumentInContent } from "../conversation/documentEdit";
import { makeRenameConversation } from "../conversation/renameConversation";
import { redactEditedText } from "../redaction/editRedaction";
import { newConversation, uid } from "../storePersistence";

export interface ConversationActionDeps {
  setConversations: Dispatch<SetStateAction<Conversation[]>>;
  setActiveId: Dispatch<SetStateAction<string | null>>;
  conversationsRef: MutableRefObject<Conversation[]>;
  settingsRef: MutableRefObject<Settings>;
  orgProfileRef: MutableRefObject<OrgProfileInfo | null>;
  newChatModelRef: MutableRefObject<string>;
  /** Drops a deleted conversation's unsent draft + staged files. */
  dropScratch: (id: string) => void;
}

/** Create / fork / import / delete conversations and patch their content. */
export function useConversationActions(d: ConversationActionDeps) {
  const { setConversations, setActiveId, conversationsRef, settingsRef, orgProfileRef, newChatModelRef } = d;

  const patchConversation = useCallback((id: string, patch: (c: Conversation) => Conversation) => {
    setConversations((prev) => prev.map((c) => (c.id === id ? patch(c) : c)));
  }, []);
  const renameConversation = useMemo(() => makeRenameConversation(patchConversation), [patchConversation]);

  /** The ref first, the state second: creating THEN sending happens in ONE handler, and
   *  the ref lagging by a render made the send answer on the default model. Every
   *  creation goes through here (`conversation/liveConversations.test.tsx`). */
  const addConversations = useCallback((fresh: Conversation[]) => {
    if (!fresh.length) return;
    conversationsRef.current = [...fresh, ...conversationsRef.current];
    setConversations((prev) => [...fresh, ...prev]);
  }, []);

  const createConversation = useCallback(() => {
    const conv = newConversation(newChatModelRef.current);
    addConversations([conv]);
    setActiveId(conv.id);
    return conv.id;
  }, [addConversations]);

  /** Merge conversations parsed from another assistant's export. Parsers mint STABLE
   *  ids, so dedup by id makes a re-import idempotent; persistence rides the normal
   *  conversation effects. */
  const importConversations = useCallback(
    (incoming: Conversation[]) => {
      const existing = new Set(conversationsRef.current.map((c) => c.id));
      const fresh = incoming.filter((c) => !existing.has(c.id));
      addConversations(fresh);
      return { added: fresh.length, skipped: incoming.length - fresh.length };
    },
    [addConversations],
  );

  // "Scroll to this message" (the audit page): `nonce` lets the SAME target retrigger.
  const [scrollTarget, setScrollTarget] = useState<{ convId: string; msgId: string; nonce: number } | null>(null);
  const openConversationAt = useCallback((convId: string, msgId: string) => {
    setActiveId(convId);
    setScrollTarget((prev) => ({ convId, msgId, nonce: (prev?.nonce ?? 0) + 1 }));
  }, []);
  const clearScrollTarget = useCallback(() => setScrollTarget(null), []);

  /** Fork FROM a message: the messages up to AND INCLUDING it. The redaction lineage
   *  rides along ON PURPOSE — same vault, kinds and SALT — so the copied turns stay
   *  reversible and keep ONE fake per value. The memory watermark is clamped to the cut. */
  const forkConversation = useCallback(
    (sourceId: string, messageId: string): string | null => {
      const src = conversationsRef.current.find((c) => c.id === sourceId);
      if (!src) return null;
      const idx = src.messages.findIndex((m) => m.id === messageId);
      if (idx < 0) return null;
      const id = uid();
      const now = Date.now();
      const fork: Conversation = {
        ...src,
        id,
        title: `${src.title || "Conversation"} (fork)`,
        messages: src.messages.slice(0, idx + 1).map((m) => ({ ...m })),
        redactionVault: { ...(src.redactionVault ?? {}) },
        redactionKinds: { ...(src.redactionKinds ?? {}) },
        memoryWatermark: Math.min(src.memoryWatermark ?? 0, idx + 1),
        createdAt: now,
        updatedAt: now,
      };
      addConversations([fork]);
      setActiveId(id);
      return id;
    },
    [addConversations],
  );

  const deleteConversation = useCallback((id: string) => {
    d.dropScratch(id);
    setConversations((prev) => {
      const next = prev.filter((c) => c.id !== id);
      setActiveId((cur) => (cur === id ? (next[0]?.id ?? null) : cur));
      return next;
    });
  }, []);

  const setModel = useCallback(
    (id: string, modelId: string) => patchConversation(id, (c) => ({ ...c, modelId })),
    [patchConversation],
  );

  /** Edit a generated DOCUMENT (a ```document fence) inside an assistant message. The
   *  stored content is the un-redacted text, and past turns are only ever REPLAYED from
   *  the vault (rules 7/11), so the edit-time redaction pass puts any NEW hand-typed value
   *  into the vault BEFORE persisting. The pass failing, or no fence matching, REFUSES the
   *  save — never a partial write, never an un-vaulted edit. */
  const editDocument = useCallback(
    async (conversationId: string, messageId: string, oldText: string, newText: string): Promise<boolean> => {
      const conv = conversationsRef.current.find((c) => c.id === conversationId);
      if (!conv) return false;
      let vaultPatch: Awaited<ReturnType<typeof redactEditedText>>;
      try {
        const effective = effectiveRedactCategories(
          settingsRef.current.redactCategories,
          conv.redactCategories,
          orgProfileRef.current?.forcedCategories,
        );
        vaultPatch = await redactEditedText(
          conv,
          newText,
          disabledKindsOf(effective),
          notorietyForLevel(levelOf(effective, orgProfileRef.current?.forcedCategories)),
        );
      } catch {
        return false; // fail closed — no save without the redaction pass
      }
      let done = false;
      patchConversation(conversationId, (c) => {
        const idx = c.messages.findIndex((m) => m.id === messageId);
        if (idx === -1) return c;
        const next = replaceDocumentInContent(c.messages[idx]!.content, oldText, newText);
        if (next === null) return c;
        done = true;
        const messages = c.messages.map((m, i) => (i === idx ? { ...m, content: next } : m));
        return { ...c, messages, ...vaultPatch, updatedAt: Date.now() };
      });
      return done;
    },
    [patchConversation],
  );

  /** Record-sync entry point: upsert a conversation merged from another device, or
   *  remove one deleted there (`null`). Persistence follows from the effects. */
  const applySyncedConversation = useCallback((convId: string, conv: Conversation | null) => {
    setConversations((prev) => {
      if (!conv) {
        setActiveId((cur) => (cur === convId ? null : cur));
        return prev.filter((c) => c.id !== convId);
      }
      const i = prev.findIndex((c) => c.id === convId);
      if (i < 0) return [conv, ...prev];
      const next = [...prev];
      next[i] = conv;
      return next;
    });
  }, []);

  /** Merge an EXTERNAL vault (another device's) into a conversation. Additive; the LOCAL
   *  mapping wins so an in-flight local edit stays authoritative. */
  const mergeVaultInto = useCallback(
    (id: string, vault: Record<string, string>, kinds: Record<string, string> = {}) => {
      if (!Object.keys(vault).length && !Object.keys(kinds).length) return;
      patchConversation(id, (c) => ({
        ...c,
        redactionVault: { ...vault, ...c.redactionVault },
        redactionKinds: { ...kinds, ...c.redactionKinds },
      }));
    },
    [patchConversation],
  );

  /** Sparse per-conversation category override; `{}` clears it (inherit everything). */
  const setConversationCategories = useCallback(
    (id: string, redactCategories: Conversation["redactCategories"]) => {
      patchConversation(id, (c) => ({
        ...c,
        redactCategories: redactCategories && Object.keys(redactCategories).length ? redactCategories : undefined,
        updatedAt: Date.now(),
      }));
    },
    [patchConversation],
  );

  /** « Sans mémoire dans cette conversation »: cuts injection, the memory-search tool and
   *  the silent extraction. An explicit « retiens que… » is still honoured. */
  const setConversationMemoryOff = useCallback(
    (id: string, off: boolean) => {
      patchConversation(id, (c) => ({ ...c, memoryOff: off || undefined, updatedAt: Date.now() }));
    },
    [patchConversation],
  );

  return {
    patchConversation,
    renameConversation,
    createConversation,
    importConversations,
    scrollTarget,
    openConversationAt,
    clearScrollTarget,
    forkConversation,
    deleteConversation,
    setModel,
    editDocument,
    applySyncedConversation,
    mergeVaultInto,
    setConversationCategories,
    setConversationMemoryOff,
  };
}
