import { useRef, useState, useMemo } from "react";
import type { ChatMessage } from "@openmasq/llm";
import { useT } from "../../i18n";
import { useHost, type OrgProfileInfo } from "../../host";
import type { Conversation, Settings } from "../../types";
import { isSyncReady } from "../auth/dbWipeGuard";
import { useLocalPersistence, useOrgProfile, usePlatformEffects } from "../effects";
import { useMemoryStore } from "../memory/useMemory";
import { useSkills } from "../settings/useSkills";
import { loadDeviceTheme } from "../settings/theme";
import { DEFAULT_SETTINGS, SETTINGS_KEY, load, normalizeSettings } from "../storePersistence";
import { useComposerScratch } from "./composerScratch";
import { useDetectPii } from "./detectPii";
import { useAccountSwitch, useResolveAccountId, type UserId } from "./useAccountScope";
import { useApiKeys } from "./useApiKeys";
import { useBilling } from "./useBilling";
import { useConversationActions } from "./useConversationActions";
import { useDbMirror, useDbMirrorRefs } from "./useDbMirror";
import { useMemoryWiring } from "./useMemoryWiring";
import { useModelAvailability } from "./useModelAvailability";
import { useRedactionControls } from "./useRedactionControls";
import { useSendPipeline } from "./useSendPipeline";

/**
 * The chat store: every mutable fact the UI renders, composed from the slices in this
 * folder. Hook ORDER here is load-bearing for the effects (account adoption runs before
 * the DB mirror; see `useAccountScope.ts`). Where each fact may REST — memory, plaintext
 * localStorage, encrypted DB — is the rule set in `state/CLAUDE.md`.
 */
export function useChatStore() {
  const t = useT();
  const host = useHost();
  const [settings, setSettings] = useState<Settings>(() =>
    normalizeSettings({
      // Defaults first, so a blob persisted before a field existed still gets a value; the
      // theme is the DEVICE's (the same value the pre-paint script read: `settings/theme.test.ts`).
      ...DEFAULT_SETTINGS,
      ...load<Partial<Settings>>(SETTINGS_KEY, {}),
      ...(loadDeviceTheme() ? { theme: loadDeviceTheme() } : {}),
    }),
  );
  // Conversations start EMPTY and load per ACCOUNT once the signed-in id resolves — never
  // from an unscoped key, so account B never sees account A's chats on first paint.
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  /** True once the per-account load has SETTLED ("genuinely empty" vs "still loading"). */
  const [loaded, setLoaded] = useState(false);
  const [userId, setUserId] = useState<UserId>(undefined);
  const storageUidRef = useRef<UserId>(undefined);
  const [isStreaming, setIsStreaming] = useState(false);
  /** Bumped each time the agent starts a browser tool call; the shell only ever OPENS on it. */
  const [browserActivity, setBrowserActivity] = useState(0);
  // Cancel/finish handlers keyed BY CONVERSATION: tabs generate independently.
  const cancelRef = useRef<Map<string, () => void>>(new Map());
  const finishRef = useRef<Map<string, () => void>>(new Map());
  // Wire transcript of a partially-completed turn, by `turnId`, so a retry CONTINUES it.
  // In-memory only (redacted transcript); only `regenerate` reads it, for a FAILED bubble.
  const resumeTranscriptsRef = useRef<Map<string, ChatMessage[]>>(new Map());

  const keys = useApiKeys(host);
  const { keyConfigured, refreshKeys } = keys;

  // Org authorization (membership, allowed models, mandated redaction). `null` = solo.
  const [orgProfile, setOrgProfile] = useState<OrgProfileInfo | null>(null);
  const orgProfileRef = useRef<OrgProfileInfo | null>(null);
  orgProfileRef.current = orgProfile;
  useOrgProfile({ host, setOrgProfile, storageUidRef, userId });

  // Refs kept current each render so the render-STABLE callbacks read the latest state.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  const hostRef = useRef(host);
  hostRef.current = host;

  const scratch = useComposerScratch();
  useResolveAccountId(host, setUserId);
  const billing = useBilling(host, userId);
  useLocalPersistence({ conversations, settings, activeId, userId, host, storageUidRef, setSettings });
  const { keepListRef } = usePlatformEffects({ settings, host, hostRef, setSettings, orgProfile });

  const db = useDbMirrorRefs();
  useAccountSwitch({
    host,
    userId,
    storageUidRef,
    conversationsRef,
    activeIdRef,
    setSettings,
    setOrgProfile,
    setConversations,
    setActiveId,
    setLoaded,
    db,
    legacyKeys: keys.legacyKeys,
    legacyImportedRef: keys.legacyImportedRef,
    refreshKeys,
  });
  useDbMirror({ host, conversations, settings, db });

  const active = useMemo(() => conversations.find((c) => c.id === activeId) ?? null, [conversations, activeId]);

  const models = useModelAvailability({
    host,
    settings,
    keyConfigured,
    orgProfile,
    personalCredits: billing.personalCredits,
    personalSub: billing.personalSub,
    conversations,
    activeId,
  });
  const convs = useConversationActions({
    setConversations,
    setActiveId,
    conversationsRef,
    settingsRef,
    orgProfileRef,
    newChatModelRef: models.newChatModelRef,
    dropScratch: scratch.dropScratch,
  });
  const { patchConversation, createConversation } = convs;
  const redaction = useRedactionControls({
    active,
    activeId,
    patchConversation,
    orgProfileRef,
    coffre: settings.coffre,
    setSettings,
  });

  const skillsApi = useSkills(settings, setSettings);
  const memoryApi = useMemoryStore(settings, setSettings);
  useMemoryWiring({ host, settings, setSettings, keyConfigured, conversations, activeId, patchConversation });

  const detectPii = useDetectPii({ settingsRef, hostRef, conversationsRef, activeIdRef, orgProfileRef, keepListRef });
  const { sendMessage, regenerate, stop } = useSendPipeline({
    t,
    host,
    settings,
    activeId,
    conversations,
    activeIdRef,
    keyConfigured,
    patchConversation,
    createConversation,
    forceRedact: redaction.forceRedact,
    setIsStreaming,
    setBrowserActivity,
    conversationsRef,
    cancelRef,
    finishRef,
    resumeTranscriptsRef,
    orgProfileRef,
    personalSubRef: billing.personalSubRef,
    personalCreditsRef: billing.personalCreditsRef,
    keepListRef,
    localEndpointReachableRef: models.localEndpointReachableRef,
    claudeCliReadyRef: models.claudeCliReadyRef,
    codexCliReadyRef: models.codexCliReadyRef,
    antigravityCliReadyRef: models.antigravityCliReadyRef,
  });

  return {
    settings,
    setSettings,
    keyConfigured,
    setApiKey: keys.setApiKey,
    clearApiKey: keys.clearApiKey,
    /** Re-read WHICH ids hold a key: one can be minted outside this store (PKCE flow). */
    refreshKeys,
    orgProfile,
    personalCredits: billing.personalCredits,
    personalSub: billing.personalSub,
    /** Model id → why it can't send; the send gate refuses for the SAME reason. */
    unavailableModels: models.unavailableModels,
    claudeCliDetected: models.claudeCliDetected,
    codexCliDetected: models.codexCliDetected,
    antigravityCliDetected: models.antigravityCliDetected,
    conversations,
    loaded,
    /** Gates the SYNC channels: false when the DB load failed, even though `loaded` is true. */
    syncReady: isSyncReady(loaded, !!host.db, db.dbActive.current),
    active,
    activeId,
    setActiveId,
    scrollTarget: convs.scrollTarget,
    openConversationAt: convs.openConversationAt,
    clearScrollTarget: convs.clearScrollTarget,
    isStreaming,
    browserActivity,
    createConversation,
    forkConversation: convs.forkConversation,
    importConversations: convs.importConversations,
    deleteConversation: convs.deleteConversation,
    renameConversation: convs.renameConversation,
    getDraft: scratch.getDraft,
    getStagedAttachments: scratch.getStagedAttachments,
    setStagedAttachments: scratch.setStagedAttachments,
    setDraft: scratch.setDraft,
    setModel: convs.setModel,
    editDocument: convs.editDocument,
    mergeVaultInto: convs.mergeVaultInto,
    applySyncedConversation: convs.applySyncedConversation,
    setConversationCategories: convs.setConversationCategories,
    setConversationMemoryOff: convs.setConversationMemoryOff,
    revealRedaction: redaction.revealRedaction,
    reRedact: redaction.reRedact,
    forceRedact: redaction.forceRedact,
    unforceRedact: redaction.unforceRedact,
    isRevealForced: redaction.isRevealForced,
    addVaultTerm: redaction.addVaultTerm,
    removeVaultTerm: redaction.removeVaultTerm,
    updateVaultTerm: redaction.updateVaultTerm,
    vaultHas: redaction.vaultHas,
    ...skillsApi,
    ...memoryApi,
    sendMessage,
    /** Read-only live PII preview; the send re-redacts and fail-closes. */
    detectPii,
    regenerate,
    stop,
  };
}

export type ChatStore = ReturnType<typeof useChatStore>;
