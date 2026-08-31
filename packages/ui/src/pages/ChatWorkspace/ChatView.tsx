import { useEffect, useMemo, useRef, useCallback, useState } from "react";
import { PROVIDERS, type LlmAttachment, type ProviderId } from "@openmasq/llm";
import { redact, pseudonymize, toneForKind, redactionCategory, vaultDisplayTokens } from "@openmasq/redact";
import { AnimatePresence } from "framer-motion";
import type { ReviewWire } from "../../send/redactionPreview";
import type { WriteConfirmInfo } from "../../agent/mcpAgent";
import type { UnavailableReason } from "../../send/modelAvailability";
import { ALL_MODELS, findModelAny } from "../../prompt/models";
import { AUTO_MODEL_ID, isAutoModelId } from "../../send/autoRoute";
import { SendModeDialog } from "./SendModeDialog";
import { useHost, type CreditBalance, type ExtractedFile, type OrgProfileInfo, type PdfDocument } from "../../host";
import { sendErrorReason } from "../../state/errors";
import { httpStatus, requestIdOf, retriesOf } from "../../state/errors/fields";
import { useRedaction } from "../../send/redaction";
import { effectiveRedactCategories, disabledKindsOf } from "../../send/redactionOptions";
import { coffreToForced, combinedCoffre } from "../../send/coffre";
import { pushDebug, DRAFT_CONV } from "../../state/debug";
import { logOcrDebug } from "./ocrDebug";
import { conversationProtectedCount } from "../../state/protectedCount";
import { captureEvent } from "../../analytics";
import type { Conversation, Message, RedactCategoryKey, Settings } from "../../types";
import { DropZone } from "./DropZone";
import { MessageBubble } from "../../components/message/MessageBubble";
import { ApiKeyModal, ModelAccessModal } from "../../containers/modals";
import { useAvisOpen } from "../../containers/providers/avisOpen";
import { useOpenConnector } from "../../containers/providers/connectors";
import { redactionProblemDraft } from "../../avis/avis";
import {
  sessionAllowedWriteTools,
  conversationAllowedWriteTools,
  convWriteToolKey,
  pendingGateToRelease,
  writeToolKey,
  isWriteAutoApproveAll,
  writeConfirmDecision,
  applyWriteAllowLists,
  getConfirmationModeMirror,
  setConfirmationModeMirror,
} from "./writeConfirm";
import { webSearchCount, confirmationsShownCount, recordConfirmationShown } from "../../agent/confirmationFacts";
import { redactEngineSig } from "./redactEngineSig";
import { timeGreeting } from "./greeting";
import { inactiveCategoryLabels } from "./docCategoryNotice";
import { useChatSelector, shallowEqual } from "../../containers/providers/chatStore";
import type { AskTarget, Competence } from "../../types";
import { useOpenCompetence } from "../../competences/competenceOpen";
import { useAddProposedSkill, useIsProposedSkillAdded } from "../../suggestions/useAddProposedSkill";
import { competenceLaunchText, competenceServers, promptSlots } from "../../competences/launch";
import { askTargetLabel, askTargetLaunchText } from "../../send/askTarget";
import { protectedValueCount, shouldShowTransparencyCard } from "../../privacy/transparency";
import { TransparencyCard } from "./TransparencyCard";
import { ocrAllAttachment } from "./ocrAll";
import { shouldShowRedactionIntro } from "../../privacy/redactionIntro";
import { RedactionIntroCard } from "./RedactionIntroCard";
import { TransparencyModal } from "../../containers/modals/TransparencyModal";
import { reusableDocReplacements } from "./reusableDocReplacements";
import { forcedVaultPatch } from "./forcedFake";
import { buildFileImages } from "./buildFileImages";
import { MAX_REDACT_CHARS, redactAttachment } from "./redactAttachment";
import { stageDeferredFile } from "./deferredAttach";
import { makeStaging } from "./attachmentStaging";
import { isDeferredFile, type DeferredFile } from "../../state/deferredFile";
import { ChatHeader } from "./ChatHeader";
import { ConversationTokens } from "./ConversationTokens";
import { Composer, type Attachment } from "./Composer";
import { isSendTool } from "../../agent/mcpAgentClassify";
import { WelcomeScreen } from "./WelcomeScreen";
import { useMcpConnectedIds } from "../../hooks/useMcpConnectedIds";
import { ChatBanners } from "./ChatBanners";
import { Banner } from "../../components/feedback/Banner";
import { VirtualMessageList, type VirtualListHandle } from "../../components/VirtualMessageList";
import type { ConvTab } from "./ConvTabs";
import { useTextSelection } from "../../hooks/useTextSelection";
import { SelectionMenu } from "../../components/SelectionMenu";
import { toggleFavoriteModel } from "../../components/ModelSelector/simpleList";
import { MemoryProposalCard } from "./MemoryProposalCard";
import { memoryNoteTitle } from "../../memory";
import { isExplicitMemoryAsk, worthExtracting, type ConvSlice } from "../../memory/extract";
import { MemoryIcon } from "../../components/brand";
import { useAppDispatch, setMemoryFresh } from "../../state/redux";
import { useChatGates } from "./chatGates";
import { buildRedactLevelApi } from "./redactLevelApi";
import type { MemoryCard } from "../../types";
import { useT } from "../../i18n";
import { DocPrepCard, type DocPrepState } from "./DocPrepCard";

/** Pull the HTTP status out of a provider error message (`… request failed (400): …`)
 *  so send_error carries the concrete code — safe metadata, never the raw body. */
// httpStatus/requestIdOf/retriesOf : une seule maison — `state/errors/fields.ts`.


// The metered gateway's /chat/completions body is capped ~8 MB; leave headroom below it
// for the JSON envelope + text. A PLATFORM (Scaleway/OpenRouter) image send over this fails.
const PLATFORM_MAX_B64 = 7_000_000;

/** Human size for the send-mode dialog: base64 payload length ≈ the bytes that leave. */
function formatSendSize(base64Len: number): string {
  const mb = base64Len / 1_000_000;
  if (mb >= 1) return `${mb.toFixed(mb >= 10 ? 0 : 1)} Mo`;
  return `${Math.max(1, Math.round(base64Len / 1000))} Ko`;
}

/** Rough token estimate for the extracted-text option (≈ 4 chars / token). */
function estimateTokens(chars: number): string {
  const t = Math.ceil(chars / 4);
  return t >= 1000 ? `${(t / 1000).toFixed(t >= 10_000 ? 0 : 1)} k` : `${t}`;
}

/** Synchronous chip match-count, BOUNDED so a giant file doesn't block the UI thread.
 *  Takes the conversation's `disabledKinds` for the same reason the composer's live
 *  preview does: without them the « 🛡 N valeurs » badge counts categories the user
 *  switched off, and `store.ts` persists that number as the file's `redactedCount`. */
function redactMatchCount(text: string | undefined, disabledKinds: string[]): number {
  if (!text) return 0;
  const scan = text.length > MAX_REDACT_CHARS ? text.slice(0, MAX_REDACT_CHARS) : text;
  return redact(scan, disabledKinds.length ? { disabledKinds } : undefined).matches.length;
}

interface Props {
  conversation: Conversation | null;
  /** First name for the home greeting ("Bonsoir Julien"); undefined ⇒ nameless. */
  userName?: string;
  isStreaming: boolean;
  onSend: (
    text: string,
    attachments?: ExtractedFile[],
    opts?: {
      imageAttachments?: LlmAttachment[];
      imageNames?: string[];
      modelId?: string;
      fileVault?: Record<string, string>;
      /** A text-folded document's drop-time redaction (real→fake+tone), reused at send
       *  instead of re-detecting the whole document. See `store.sendMessage`. */
      docReplacements?: Record<string, { real: string; fake: string; tone?: string }[]>;
      keepValues?: string[];
      reviewWire?: ReviewWire;
      confirmToolWrite?: (info: WriteConfirmInfo, convId: string) => Promise<boolean>;
      /** Pre-search reveal gate: pick which categories to STOP redacting for the
       *  conversation, so the model reads the web answer's real substance. */
      reviewWebNav?: (
        categories: RedactCategoryKey[],
        convId: string,
      ) => Promise<RedactCategoryKey[]>;
      /** Text-selection menu tag: "graphique" forces a run_python plot for this send. */
      plotTag?: "graphique" | "preciser";
      /** A compétence used for this send: its prompt rides the MODEL payload only, so
       *  the bubble shows a tag instead of the instruction. `servers`, quand elle en
       *  porte, fait bâtir la ligne de consigne et ouvre la portée d'outils du tour.
       *  See `store.sendMessage`. */
      competence?: { id: string; name: string; prompt?: string; servers?: string[] };
      /** The folder/file this send is ABOUT (« Demander » in the right rail) — staged
       *  like a compétence; its context line (`prompt`) rides the model payload only. */
      askTarget?: AskTarget;
      /** Manual (user-forced) redactions for THIS send — only for the first message,
       *  before the conversation exists; afterwards they live on the conversation. */
      forcedRedactions?: { value: string; category: string }[];
    },
  ) => Promise<void>;
  /** Read-only live PII detection for the composer preview (runs the same engine as
   *  the send but never mutates the vault). Absent → regex-only live highlight. */
  onDetectPii?: (
    text: string,
    signal?: AbortSignal,
  ) => Promise<{ matches: { value: string; category: string; uncertain?: boolean }[]; engine: string; error?: string }>;
  onStop: () => void;
  onChangeModel: (convId: string, modelId: string) => void;
  /** Retry a failed assistant turn in place (regenerate, no duplicate send). */
  onRegenerate?: (assistantId: string) => void;
  /** Fork the conversation from a message (kit). */
  onFork?: (messageId: string) => void;
  /** Persist a DocumentCard edit into a message's ```document fence (store). */
  onEditDocument?: (messageId: string, oldText: string, newText: string) => Promise<boolean>;
  /** Open a message's document as a workspace FILE TAB (unified tabs). */
  onOpenFileTab?: (file: { id: string; name: string; mime?: string; convId?: string }) => void;
  onNew: () => void;
  onOpenSettings: (tab?: string, connectorId?: string, returnToConvId?: string) => void;
  onToggleSidebar?: () => void;
  /** MOBILE: pop back to the chat list (threaded to ChatHeader's back chevron). */
  onBack?: () => void;
  /** Toggle the split-screen agent-browser panel (desktop only). */
  /** Open conversation TABS, rendered in the chat top bar. In the TILING workspace
   *  each pane's tab strip is rendered OUTSIDE ChatView (by `WorkspaceView`), so
   *  these are optional and `showTabs={false}` hides the in-header strip (the bar
   *  then only carries the per-conversation actions). `onNew` = the "new tab" action. */
  tabs?: ConvTab[];
  activeId?: string | null;
  onSelectTab?: (id: string) => void;
  onCloseTab?: (id: string) => void;
  /** Show the in-header conversation tab strip. Default true — the workspace shows
   *  the PANE's tabs here too (one bar per pane). */
  showTabs?: boolean;
  /** Workspace: pointerdown on a tab starts the pointer-based move/split drag. */
  onTabPointerDown?: (id: string, e: import("react").PointerEvent) => void;
  /** Split this pane, putting the tab in a new pane left/right (workspace only). */
  onSplitTab?: (id: string, side: "left" | "right") => void;
  /** Per-conversation UNSENT composer draft (kept in the store, in-memory) so a
   *  half-typed message survives navigating away + switching tabs. */
  getDraft?: (id: string) => string;
  onDraftChange?: (id: string, text: string) => void;
  /** The files staged on the composer, parked per conversation ABOVE this screen — see
   *  `state/store.ts`. Absent ⇒ they live and die with the screen (browser preview). */
  getStagedFiles?: (id: string) => readonly Attachment[];
  onStagedFilesChange?: (id: string, items: readonly Attachment[]) => void;
  onDelete?: () => void;
  settings?: Settings;
  onChangeSettings?: (s: Settings) => void;
  /** Ouvre le guide (Aide) sur un chapitre — porté par le shell. Absent (aperçu, test) ⇒
   *  le conteneur « Comprendre mon redaction » ne se rend pas : une porte sans salle
   *  derrière est pire qu'aucune porte. */
  onOpenGuideChapter?: (id: string) => void;
  /** Per-conversation redaction category override (sparse). */
  onChangeConversation?: (id: string, cats: Conversation["redactCategories"]) => void;
  /** « Sans mémoire dans cette conversation » (rang de la modale de règles). */
  onSetMemoryOff?: (id: string, off: boolean) => void;
  /** Toggle the conversation's NEUTRAL-MARKS display mode (badge + hover highlight). */
  onToggleNeutralMarks?: (id: string) => void;
  /** Un-redact a value for this conversation ("suspend" reversible / "delete"
   *  drops the vault entry). Returns false when the org forces that category. */
  onReveal?: (value: string, mode: "suspend" | "delete") => boolean;
  /** Undo a suspend — re-redact the value next send. */
  onReRedact?: (value: string) => void;
  /** Is a value's category org-forced (→ un-redaction blocked, show a lock)? */
  isRevealForced?: (value: string) => boolean;
  /** Manually FORCE a value to be redacted for this conversation, AS `category`
   *  (the composer "Redact" menu). Persisted on the conversation by the store. */
  onForceRedact?: (value: string, category: string) => void;
  /** Add the selected span to the global COFFRE (always redacted, every conversation).
   *  Enables the "Redact" menu's Cette conversation / Coffre scope toggle. */
  onAddToCoffre?: (value: string, token: string) => void;
  /** Add a MÉMOIRE card — the selection menu's « Retenir » gesture (local + instant,
   *  never a model call: the selection is REAL text and re-sending it would be new
   *  egress). Absent ⇒ the gesture is hidden. */
  onAddMemoryCard?: (input: { entity: string; facts: string; cat?: string }) => MemoryCard | null;
  /** Explicit « retiens que… » capture runs on this platform (a completer exists) —
   *  shows the composer's « sera noté en mémoire » hint chip. */
  memoryHint?: boolean;
  /** Set an API key inline (encrypted in main) — powers the missing-key modal. */
  onSetApiKey?: (id: string, value: string) => void | Promise<void>;
  /** Which provider keys are configured; a change here fires the auto-retry. */
  keyConfigured?: Set<string>;
  /** A file to drop into the composer (library "re-attach"); consumed once. */
  pendingAttachment?: { file: ExtractedFile | DeferredFile; convId: string } | null;
  /** Called after `pendingAttachment` has been staged, to clear it. */
  onPendingConsumed?: () => void;
  /** A compétence the user chose to USE, from the Compétences page or the sidebar's
   *  pinned list. Staged the same way as `pendingAttachment`: the shell hands it over,
   *  we consume it and call back. It stages a TAG — its prompt never enters the draft. */
  pendingCompetence?: Competence | null;
  /** Called after `pendingCompetence` has been staged, to clear it. */
  onCompetenceConsumed?: () => void;
  /** The folder/file the user clicked « Demander » on (right rail) — staged like a
   *  compétence: a TAG the send carries, never draft text. */
  pendingTarget?: AskTarget | null;
  /** Called after `pendingTarget` has been staged, to clear it. */
  onTargetConsumed?: () => void;
  /** The signed-in member's org authorization (null = solo user). Filters the
   *  model picker + drives the suspended-member banner. */
  orgProfile?: OrgProfileInfo | null;
  /** The account's REAL prepaid credit budget (store.personalCredits) — the credit-blocked
   *  card shows its figures. Null/absent ⇒ the card shows no numbers, never invented ones. */
  credits?: CreditBalance | null;
  /** The subscription's `currentPeriodEnd` — when the credit budget resets. */
  creditsResetIso?: string;
  /** May we pitch a subscription here? `state/billing.ts` `canPitchSubscription` — false
   *  for a paying account, an org member, and while the subscription is still unknown, so
   *  the « modèles gratuits » explainer never tells a subscriber to subscribe. */
  canPitchSubscription?: boolean;
  /** Model id → why it can't send — flagged in the picker; only a `pickerBlocks` reason disables the row (`store.unavailableModels`). */
  unavailableModels?: ReadonlyMap<string, UnavailableReason>;
  /** A request to reveal a specific message (e.g. from the redaction-audit page).
   *  When its `convId` matches the open conversation, the view scrolls to `msgId`
   *  and flashes it. `nonce` lets the same target retrigger. */
  scrollTarget?: { convId: string; msgId: string; nonce: number } | null;
  /** Called once the scroll request has been honoured (clears it upstream). */
  onScrolled?: () => void;
}

export function ChatView({
  conversation,
  userName,
  // `isStreaming` (global) is intentionally NOT destructured — the composer/submit gate
  // on the per-conversation `activeStreaming` (below) so an idle tab stays sendable.
  onSend,
  onDetectPii,
  onStop,
  onChangeModel,
  onRegenerate,
  onFork,
  onEditDocument,
  onOpenFileTab,
  onNew,
  onOpenSettings,
  onToggleSidebar,
  onBack,
  tabs,
  activeId,
  onSelectTab,
  onCloseTab,
  showTabs = true,
  onTabPointerDown,
  onSplitTab,
  getDraft,
  onDraftChange,
  getStagedFiles,
  onStagedFilesChange,
  onDelete,
  settings,
  onChangeSettings,
  onOpenGuideChapter,
  onChangeConversation,
  onSetMemoryOff,
  onToggleNeutralMarks,
  onReveal,
  onReRedact,
  isRevealForced,
  onForceRedact,
  onAddToCoffre,
  onAddMemoryCard,
  memoryHint,
  onSetApiKey,
  keyConfigured,
  pendingAttachment,
  onPendingConsumed,
  pendingCompetence,
  onCompetenceConsumed,
  pendingTarget,
  onTargetConsumed,
  orgProfile,
  credits,
  creditsResetIso,
  canPitchSubscription,
  unavailableModels,
  scrollTarget,
  onScrolled,
}: Props) {
  const t = useT();
  const host = useHost();
  // A generated document's PDF is typeset by the platform (real brand fonts, tables,
  // Unicode) when the slot exists — `components/` must not read the host itself, so the
  // capability is threaded down. Absent ⇒ the card's own pdf-lib exporter.
  const renderPdf = host.pdf ? (doc: PdfDocument) => host.pdf!.renderHtml(doc) : undefined;
  // « Signaler un redaction incorrect » on a mark's popover → « Votre avis »
  // prefilled (category bug + surface phrasing; the KIND label only, never the value).
  // No `host.avis` ⇒ `openAvis` undefined ⇒ the popover hides the report row.
  const { openAvis } = useAvisOpen();
  const openConnector = useOpenConnector();
  const reportRedaction = openAvis
    ? (surface: "message" | "reponse", kind: string) => openAvis(redactionProblemDraft(surface, t, kind))
    : undefined;
  const redactAsync = useRedaction();
  /**
   * The redaction rules IN FORCE for this conversation, from the SAME single source the
   * send uses (`send/redactionOptions.ts`) — global defaults ⊕ this conversation's sparse
   * override ⊕ the org's mandated categories ⊕ retired ones off.
   *
   * ⚠️ This is what makes « Règles de redaction » visible in the composer at all. The
   * live preview used to run its regex layer with NO rules, so a category the user had
   * switched off still lit up and still counted in « N à redact » — and on the
   * `patterns` engine that layer is the only one there is. `key` changes whenever the
   * policy does, which is what re-runs the detection on a rule toggle instead of leaving
   * the previous analysis on screen until the next keystroke.
   */
  const redactPolicy = useMemo(() => {
    const disabledKinds = disabledKindsOf(
      effectiveRedactCategories(
        settings?.redactCategories,
        conversation?.redactCategories,
        orgProfile?.forcedCategories,
      ),
    );
    return { disabledKinds, key: disabledKinds.slice().sort().join(",") };
  }, [settings?.redactCategories, conversation?.redactCategories, orgProfile?.forcedCategories]);
  // Le niveau réglable depuis le composeur — construction + invariants : `redactLevelApi.ts`.
  const forcedCategories = orgProfile?.forcedCategories;
  const redactLevel = useMemo(
    () => buildRedactLevelApi({ settings, onChangeSettings, conversation, onChangeConversation, forcedCategories }),
    [settings, onChangeSettings, conversation, onChangeConversation, forcedCategories],
  );
  const [input, setInput] = useState("");
  // Composer draft is saved PER CONVERSATION as the user types (so it survives a
  // tab switch or navigating to Library/Settings), and cleared on send. `getDraft`
  // restores it (see the conversation-change effect below).
  const handleInput = (text: string) => {
    setInput(text);
    onDraftChange?.(conversation?.id ?? "", text);
  };
  const clearInput = () => {
    setInput("");
    onDraftChange?.(conversation?.id ?? "", "");
  };
  // Staged files are the CONVERSATION's, not the screen's: `ChatView` keeps a local mirror
  // for rendering and writes every change through to the store, which is what makes them
  // survive a trip to Bibliothèque (this screen unmounts) and stops them following the
  // user into the NEXT conversation (this screen does NOT remount on a switch).
  const [attachments, setAttachmentsState] = useState<Attachment[]>(
    () => [...(getStagedFiles?.(conversation?.id ?? "") ?? [])],
  );
  // The mirror's latest value, so the updater form can be resolved OUTSIDE `setState` —
  // calling a prop from inside a state updater would fire it twice under StrictMode.
  const attachmentsRef = useRef<Attachment[]>(attachments);
  const convIdRef = useRef(conversation?.id ?? "");
  convIdRef.current = conversation?.id ?? "";
  const setAttachments = useCallback(
    (next: Attachment[] | ((prev: Attachment[]) => Attachment[])) => {
      const value = typeof next === "function" ? next(attachmentsRef.current) : next;
      attachmentsRef.current = value;
      setAttachmentsState(value);
      onStagedFilesChange?.(convIdRef.current, value);
    },
    [onStagedFilesChange],
  );
  const [attachWarning, setAttachWarning] = useState<string | null>(null);
  const [keyModalOpen, setKeyModalOpen] = useState(false);
  // The « Modèles gratuits » explainer, opened from the picker's badge.
  // Which access route the user bumped into (null = closed). Carries the provider so
  // the « votre clé » card can name it.
  const [accessInfo, setAccessInfo] = useState<
    { focus: "free" | "credits" | "key"; providerLabel?: string } | null
  >(null);
  // Target provider for the inline "missing key" CTA → drives the key modal (this
  // is NOT a banner: send failures now live inline on the message bubble).
  const [keyTarget, setKeyTarget] = useState<{ provider: ProviderId; label: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Growing content wrapper — observed so the auto-follow tracks the markdown
  // reflow AFTER it settles (not a per-chunk jump to a stale height = the jank).
  const innerRef = useRef<HTMLDivElement>(null);
  // Whether to keep the view pinned to the bottom as the reply streams. Stays true
  // while the user is at/near the bottom; a manual scroll UP detaches it (so
  // re-reading isn't yanked back down); a NEW turn re-pins it.
  const stickBottom = useRef(true);
  // Values the user chose to KEEP IN CLEAR via the composer's un-redact chips.
  // Read at send time by `reviewWire` to restore their tokens (replaces the popup).
  const keepListRef = useRef<string[]>([]);
  // Send-time document redaction progress (rendering the redacted PDF pages to
  // images before the send) — so a big file isn't an opaque wait, and can be
  // cancelled. Null when no document is being prepared.
  const [docPrep, setDocPrep] = useState<DocPrepState | null>(null);
  const docPrepCtrl = useRef<AbortController | null>(null);
  // Per-attachment redaction controllers, so a LONG document redaction (remote
  // GPT-OSS / local NER) can be CANCELLED — removing the chip aborts it.
  const attachRedactCtrls = useRef<Map<string, AbortController>>(new Map());

  // Text-selection action menu: selecting text in a message pops the SAME menu the
  // composer pops on a draft selection — Redact (force-redact the span) + Préciser
  // (quote it into the composer and tag the send).
  const { sel, onMouseUp: onMessagesMouseUp, clear: clearSel } = useTextSelection(scrollRef, { within: "[data-user-text]" });
  const [activeTag, setActiveTag] = useState<{
    /** Only the text-selection tag drives a send behaviour (`plotTag`); a compétence
     *  tag has none — it's a display chip that clears on send like the others. */
    tag?: "preciser";
    label: string;
    tone: string;
  } | null>(null);
  const { skillsUsable, memoryOpen, activeCompetence, setActiveCompetence } = useChatGates();
  // The « Demander » target staged for the NEXT send — held the SAME way (entity, not
  // text): its context line rides the model payload at send, the composer shows a tag.
  const [activeTarget, setActiveTarget] = useState<AskTarget | null>(null);
  // Editing the STAGED compétence, from its chip — the same deep-link a sent bubble's tag
  // offers, so the affordance reads the same before and after the send.
  const openCompetence = useOpenCompetence();
  // The user's compétences, read straight from the store slice (like ChatHeader) so the
  // composer's picker can list them without threading through AppShell.
  const competences = useChatSelector((s) => s.competences, shallowEqual);
  const markCompetenceUsed = useChatSelector((s) => s.markCompetenceUsed);
  // Adopter ce que le modèle vient de fabriquer (`SkillCard`) — l'aiguillage vit dans
  // le domaine de la proposition, pas dans cette vue.
  const addProposedSkill = useAddProposedSkill();
  const isProposedSkillAdded = useIsProposedSkillAdded();
  const mergeVaultInto = useChatSelector((s) => s.mergeVaultInto);
  // Manual redactions made in the composer BEFORE a conversation exists (the first
  // message). Once a conversation is active they persist on it (`store.forceRedact`),
  // so this only holds the pre-conversation case, threaded via `opts.forcedRedactions`.
  const [pendingForced, setPendingForced] = useState<{ value: string; category: string }[]>([]);
  useEffect(() => {
    // A conversation now owns the forced list — drop the transient buffer.
    if (conversation) setPendingForced([]);
  }, [conversation?.id]);
  const handleForceRedact = (value: string, category: string) => {
    if (conversation) onForceRedact?.(value, category);
    else setPendingForced((prev) => [...prev.filter((f) => f.value !== value), { value, category }]);
  };
  // Forcing from a MESSAGE must also SHOW: a message paints its pills from the vault
  // (`toSegments`), never from `forcedRedactions` — which only the send path reads. So
  // `handleForceRedact` alone recorded the gesture and changed nothing on screen, which
  // reads as a dead button. Seed the vault to make the pill appear now.
  // Deliberately NOT folded into `handleForceRedact`: the DOCUMENT path calls that too and
  // mints its own fake against an EMPTY vault, so seeding there could hand the same value
  // a second, different fake (`packages/redact/src/model/CLAUDE.md`).
  const seedForcedFake = (value: string, token: string) => {
    if (!conversation) return;
    const { id, redactionVault, redactionMode } = conversation;
    void forcedVaultPatch(value, token, redactionVault, redactionMode)
      .then((p) => p && mergeVaultInto(id, p.vault, p.kinds))
      .catch(() => {
        /* fake generation failed — the forced redaction still keeps it off the wire */
      });
  };
  // Manually redact a SELECTED zone of a not-yet-sent DOCUMENT as a chosen type —
  // the doc-preview analogue of the composer's "Redact" menu. Two effects, so the
  // value is protected whichever send path runs: (1) add a believable fake to the
  // attachment's `replacements` so the preview shows it redacted NOW and the drop-time
  // reuse path (`docReplacements`) sends it faked; (2) persist it as a forced redaction
  // (`handleForceRedact`) so even a re-detecting send (reuse withheld) redacted it.
  const handleDocForceRedact = (cid: string, rawValue: string, token: string) => {
    const value = rawValue.trim();
    if (!value) return;
    handleForceRedact(value, token);
    // A same-kind fake for the exact selection (`forced` bypasses detection gates).
    void pseudonymize(value, { forced: [{ value, category: token }], vault: {}, numbers: false })
      .then(({ matches }) => {
        const m = matches.find((x) => x.value === value) ?? matches[0];
        if (!m?.placeholder) return;
        const kind = redactionCategory(m.category ?? token);
        const rep = { real: value, fake: m.placeholder, tone: toneForKind(kind), kind };
        setAttachments((prev) =>
          prev.map((a) => {
            if (a.cid !== cid) return a;
            // Replace any prior mapping of this value; keep longest-first (paint order).
            const reps = (a.replacements ?? []).filter((r) => r.real !== value);
            reps.push(rep);
            reps.sort((x, y) => y.real.length - x.real.length);
            return { ...a, replacements: reps, reveal: (a.reveal ?? []).filter((v) => v !== value) };
          }),
        );
      })
      .catch(() => {
        /* fake generation failed — the forced redaction (step 1) still protects it */
      });
  };
  // DELETE a document redaction entirely (a false positive): (1) drop it from the
  // attachment's replacements + reveal (no box, no tag; the reuse path sends it in
  // clear); (2) conversation-side `onReveal(value, "delete")` drops any vault entry
  // + forced entry and records the reveal (a RE-DETECTING send keeps it clear via
  // the keep list); (3) `docDeletedRef` belts the pre-conversation first send, where
  // (2) has nothing to persist onto yet.
  const docDeletedRef = useRef<Set<string>>(new Set());
  const handleDocDeleteRedaction = (cid: string, rawValue: string) => {
    const value = rawValue.trim();
    if (!value) return;
    setAttachments((prev) =>
      prev.map((a) => {
        if (a.cid !== cid) return a;
        return {
          ...a,
          replacements: (a.replacements ?? []).filter((r) => r.real !== value),
          reveal: (a.reveal ?? []).filter((v) => v !== value),
        };
      }),
    );
    docDeletedRef.current.add(value);
    onReveal?.(value, "delete");
  };
  const dropSelection = () => {
    window.getSelection()?.removeAllRanges();
    clearSel();
  };
  // "Préciser": quote the selection into the composer + tag the send.
  const onPreciserSelection = () => {
    if (!sel) return;
    setActiveTag({ tag: "preciser", label: t.conversation.clarify, tone: "forest" });
    const quote = `« ${sel.text} »`;
    handleInput(input ? `${input}\n\n${quote}` : quote);
    dropSelection();
  };
  const dispatch = useAppDispatch();
  // « Retenir »: the selection becomes a MÉMOIRE note — deterministic and local (no
  // model call: the selection is REAL text; sending it anywhere would be new egress).
  // Feedback = a transient « Noté » toast at the selection + the rail's dot.
  const [memToast, setMemToast] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!memToast) return;
    const t = setTimeout(() => setMemToast(null), 1600);
    return () => clearTimeout(t);
  }, [memToast]);
  const onRetenirSelection = () => {
    if (!sel || !onAddMemoryCard) return;
    const text = sel.text.trim();
    if (!text) return;
    const card = onAddMemoryCard({ entity: memoryNoteTitle(text), facts: text, cat: "autre" });
    if (card) {
      dispatch(setMemoryFresh(true));
      setMemToast({ x: sel.x, y: sel.y });
    }
    dropSelection();
  };
  // Compétence picked from the composer's picker. It does NOT touch the draft: the
  // prompt rides the MODEL payload at send (`opts.competence`, like the plot directive),
  // so the composer shows a tag and the user's own text stays their own. Picking a second
  // one REPLACES the first — a send carries at most one compétence, and the chip is the
  // whole truth about what will be prepended.
  const handlePickCompetence = (c: Competence) => {
    setActiveCompetence(c);
    // Drop a selection tag ("Préciser") and the « Demander » target: a send carries ONE
    // intent chip, and the compétence chip is DERIVED from the entity below — never
    // set as a second state.
    setActiveTag(null);
    setActiveTarget(null);
    markCompetenceUsed?.(c.id);
  };
  // The compétence chip is DERIVED from the staged entity — one state, not two.
  // The former hand-paired `setActiveTag` twin died of exactly the failure class this
  // removes: a clear that misses the entity leaves NO visible trace while the prompt
  // still rides the next send. Derivation makes that unrepresentable.
  //
  // ⚠️ UN SEUL chip, depuis la fusion : celle qui pilote des connecteurs les montre à
  // côté de son nom et prévisualise la ligne de consigne, celle qui n'en a pas rend
  // exactement ce que rendait l'ancien chip de compétence. L'aperçu est le texte EXACT
  // qui sera préfixé — le chip dit toute la vérité de l'envoi.
  const drivesTools = !!activeCompetence?.servers?.length;
  const competenceTag = activeCompetence
    ? {
        label: `${drivesTools ? "Routine" : "Compétence"} : ${activeCompetence.name}`,
        tone: drivesTools ? "violet" : "sky",
        preview: competenceLaunchText(activeCompetence),
        servers: drivesTools ? competenceServers(activeCompetence) : undefined,
        // Les `{accolades}` du prompt : le chip les MONTRE parce que rien ne les
        // remplit — elles se précisent dans le message écrit à côté. Sans ce rappel,
        // « Prépare ma journée du {date}. » part tel quel sur un « go » (journal
        // du 27/07/2026).
        slots: promptSlots(activeCompetence.prompt),
      }
    : null;
  // The « Demander » target chip — same derivation rule (one state, the chip derives).
  // The preview is the EXACT context line the payload will carry.
  const targetTag = activeTarget
    ? {
        label: askTargetLabel(activeTarget),
        tone: "forest",
        glyph: activeTarget.kind,
        preview: askTargetLaunchText(activeTarget),
      }
    : null;

  const messages = conversation?.messages ?? [];
  // The `isStreaming` prop is GLOBAL — true whenever ANY conversation is generating.
  // Gating the composer on it blocked sending to a DIFFERENT (idle) conversation while
  // another streamed (the app runs concurrent per-tab turns). `activeStreaming` is true
  // ONLY when the CURRENTLY-VIEWED conversation is generating (it has a pending assistant
  // bubble), so the send/stop toggle + the submit guard are per-conversation.
  const activeStreaming = messages.some((m) => m.pending);

  // The one-time « activer la mémoire auto ? » proposal: offered when THIS settled
  // conversation carries durable-fact signals (the extraction's own zero-cost gate)
  // while the silent extraction is off. An EXPLICIT « retiens que… » is excluded —
  // it works by itself now, and the fast path is about to consume the slice anyway.
  const memorySlice = useMemo<ConvSlice | null>(() => {
    if (!conversation) return null;
    const msgs = conversation.messages.slice(conversation.memoryWatermark ?? 0);
    if (!msgs.length) return null;
    return {
      userTexts: msgs.filter((m) => m.role === "user").map((m) => m.content).filter(Boolean),
      kinds: Object.fromEntries(
        msgs.flatMap((m) => (m.redactedSpans ?? []).map((s) => [s.value, s.kind] as const)),
      ),
    };
  }, [conversation]);
  // La décision vit dans `privacy/transparency.ts` (pure + testée) : coffre non vide,
  // au moins une réponse aboutie, au moins un message dont le comparatif montre quelque
  // chose, et jamais deux fois.
  const [showComparison, setShowComparison] = useState(false);
  const showTransparency =
    !activeStreaming && shouldShowTransparencyCard(conversation, settings?.transparencySeen);
  // « Comprendre mon redaction » — même famille d'encarts, décision pure dans
  // `privacy/redactionIntro.ts`. JAMAIS en même temps que l'encart de transparence :
  // deux invitations empilées se lisent comme de la réclame, et la transparence — qui ne
  // se montre qu'une fois — passe d'abord.
  const showRedactionIntro =
    !activeStreaming &&
    !showTransparency &&
    !!onOpenGuideChapter &&
    shouldShowRedactionIntro(conversation, settings?.redactionIntroSeen);
  const showMemoryProposal =
    !!settings &&
    settings.memoryAuto !== true &&
    settings.memoryProposalSeen !== true &&
    !activeStreaming &&
    !!memorySlice &&
    memorySlice.userTexts.length > 0 &&
    !isExplicitMemoryAsk(memorySlice.userTexts.join("\n")) &&
    worthExtracting(memorySlice);

  // value -> kind, gathered from every message, so a redacted span is coloured
  // by its real category (name / email / phone / company / number) in both the
  // user's message and the assistant's restored reply.
  // A STABLE identity while the value→kind mapping is unchanged. Streaming grows
  // the assistant's content each chunk → `messages` gets a fresh array ref → this
  // memo recomputes, but the redaction mapping itself doesn't change per token.
  // Returning the SAME object when it's shallow-equal keeps `kinds` referentially
  // stable, so the memoized `MessageBubble`s DON'T all re-render + re-highlight on
  // every chunk (the reported "the whole DOM reloads as chunks arrive").
  const spanKindsRef = useRef<Record<string, string>>({});
  const spanKinds = useMemo(() => {
    const map: Record<string, string> = { ...(conversation?.redactionKinds ?? {}) };
    for (const m of messages)
      for (const s of m.redactedSpans ?? []) map[s.value] = s.kind;
    const prev = spanKindsRef.current;
    const mk = Object.keys(map);
    if (mk.length === Object.keys(prev).length && mk.every((k) => prev[k] === map[k])) {
      return prev;
    }
    spanKindsRef.current = map;
    return map;
  }, [messages, conversation?.redactionKinds]);

  // Jetons display (ON by default): ONE real→`[PERSON1]` map for the whole conversation,
  // threaded to every bubble's hover card. Computed here — beside the vault it reads —
  // so the numbering is conversation-wide (vault insertion order), not per bubble: the
  // same person is `[PERSON1]` in every message. Keyed on `spanKinds` (referentially
  // stable, above) so it doesn't rebuild per streamed chunk.
  const displayTokens = useMemo(
    () =>
      settings?.redactTokenDisplay && conversation?.redactionVault
        ? vaultDisplayTokens(conversation.redactionVault, spanKinds)
        : undefined,
    [settings?.redactTokenDisplay, conversation?.redactionVault, spanKinds],
  );

  // Track whether the user is parked at the bottom. A manual scroll UP detaches
  // the auto-follow so re-reading mid-stream isn't yanked back; returning to the
  // bottom re-attaches it. (Our own follow sets scrollTop to the max, which clamps
  // to distance 0, so it never fights itself.)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      stickBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 72;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Smooth auto-follow: while pinned, keep the bottom in view as the reply streams.
  // Driven by a ResizeObserver on the growing content, so we snap AFTER the markdown
  // reflow settles (each token grows the height by a little → a small, smooth delta)
  // instead of jumping to a stale scrollHeight on every chunk (the old saccade).
  useEffect(() => {
    const el = scrollRef.current;
    const inner = innerRef.current;
    if (!el || !inner) return;
    const follow = () => {
      if (stickBottom.current) el.scrollTop = el.scrollHeight;
    };
    const ro = new ResizeObserver(follow);
    ro.observe(inner);
    return () => ro.disconnect();
    // Re-bind when the content wrapper mounts/unmounts (welcome ⇄ thread).
  }, [messages.length === 0]);

  // A NEW turn (send or regenerate → message count grows) re-pins to the bottom and
  // jumps there once the bubbles have mounted, even if the user had scrolled up.
  const prevLen = useRef(messages.length);
  useEffect(() => {
    if (messages.length > prevLen.current) {
      stickBottom.current = true;
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
    }
    prevLen.current = messages.length;
  }, [messages.length]);

  // Opening a conversation lands at the bottom (its latest message). The specific
  // jump-to-message effect below runs in a later rAF, so it still wins when set.
  useEffect(() => {
    stickBottom.current = true;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conversation?.id]);

  // Restore this conversation's UNSENT draft when switching/opening it — AND on
  // remount (ChatView unmounts when navigating to Library/Settings), which is what
  // stops a half-typed message from vanishing. Saving happens in `handleInput` as
  // the user types; this only LOADS.
  useEffect(() => {
    setInput(getDraft ? getDraft(conversation?.id ?? "") : "");
    // The staged files follow the same rule as the draft — restored for the conversation
    // being opened, so they neither vanish nor bleed into the next thread. Bypasses the
    // write-through setter on purpose: this is a READ of what the store already holds.
    const staged = [...(getStagedFiles?.(conversation?.id ?? "") ?? [])];
    attachmentsRef.current = staged;
    setAttachmentsState(staged);
    // Resume a redaction that never finished on this screen: a file parked by the shell's
    // hand-off (staged before this conversation was rendered), or one whose conversation
    // the user left mid-run. Without this the chip stays « en cours » for ever and the
    // send refuses it — the patch it was waiting for targeted a list that is no longer
    // the one on screen. Only for a file that has nothing to show for itself yet.
    for (const a of staged) {
      if (a.redacting && !a.replacements?.length && !a.redactError) redactAttachment(a, redactDeps);
      // Une EXTRACTION laissée en vol par un changement d'onglet ne PEUT pas reprendre
      // (les octets n'existent qu'au moment du dépôt ; le patch de fin visait la liste
      // d'un autre écran). La déclarer échouée — chip rouge, consigne claire — plutôt
      // que l'ancien duo : pulsation éternelle + exclusion SILENCIEUSE de l'envoi
      // (`usable` ne garde que les fichiers avec du texte). Si la promesse d'origine
      // aboutit finalement (aller-retour d'onglet rapide), son patch ÉCRASE cette
      // erreur avec le vrai texte — l'état final reste juste.
      if (a.extracting && !a.text?.trim() && !a.error) {
        updateAttachment(a.cid, { extracting: false, error: "extraction interrompue — redéposez le fichier" });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation?.id]);

  // Jump-to-message (from the redaction-audit page): scroll the target into view
  // and flash it. Handled through the virtual list's imperative handle so it works
  // even when the row is windowed off-screen. Runs after paint (rAF) so the newly
  // active conversation's list has rendered before we drive its scroll.
  const listApi = useRef<VirtualListHandle | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  useEffect(() => {
    if (!scrollTarget || !conversation || scrollTarget.convId !== conversation.id) return;
    if (!messages.some((m) => m.id === scrollTarget.msgId)) {
      onScrolled?.();
      return;
    }
    const raf = requestAnimationFrame(() => {
      listApi.current?.scrollToKey(scrollTarget.msgId);
      setHighlightId(scrollTarget.msgId);
      onScrolled?.();
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollTarget?.nonce, conversation?.id]);

  // The flash is transient — clear it a moment after it lands.
  useEffect(() => {
    if (!highlightId) return;
    const t = setTimeout(() => setHighlightId(null), 1800);
    return () => clearTimeout(t);
  }, [highlightId]);


  // After the user saves a missing key, regenerate the SPECIFIC failed turn once
  // the key is reflected in `keyConfigured` (single re-send, no duplicate).
  const pendingRetryRef = useRef(false);
  const keyRetryMsgIdRef = useRef<string | null>(null);

  // Pending send that has document attachments: parked until the user picks
  // "texte" vs "fichier" in the SendModeDialog. Kept as `Attachment` (not just
  // ExtractedFile) so the file's OWN drop-time `replacements` are available.
  const [sendMode, setSendMode] = useState<{ text: string; usable: Attachment[] } | null>(null);
  // Live payload SIZE shown in the SendModeDialog for the "fichier" (images) option: probed
  // by rendering the redacted pages in the background when the dialog opens. `filePrepRef`
  // caches that render so `sendAsFile` reuses it (no double render).
  const [fileSize, setFileSize] = useState<{ loading: boolean; totalB64?: number; tooBig?: boolean } | null>(null);
  const filePrepRef = useRef<{
    text: string;
    modelId?: string;
    result: NonNullable<Awaited<ReturnType<typeof buildFileImages>>>;
  } | null>(null);
  // Tool calls awaiting the user's go-ahead (the agentic loop blocks on the promise
  // stored here until Autoriser/Annuler resolves it). `info.reason` says WHY it opened —
  // a write is only one of the four (see `WriteConfirmInfo`).
  // Keyed BY CONVERSATION, because turns run concurrently per tab: two threads can each
  // be parked on a card at once. A single slot let the second overwrite the first and
  // strand its loop on a promise nobody could resolve any more.
  const [pendingWrites, setPendingWrites] = useState<
    Record<string, { info: WriteConfirmInfo; resolve: (ok: boolean) => void }>
  >({});
  // The card for the conversation ON SCREEN — the only one this view may render or decide.
  const pendingWrite = conversation ? (pendingWrites[conversation.id] ?? null) : null;

  // The BLOCKING pre-search reveal gate (mirrors pendingWrites, and is keyed the same way
  // for the same reason): the loop pauses on the first web-search tool; the card resolves
  // which categories to stop redacting for the conversation.
  const [pendingWebNavs, setPendingWebNavs] = useState<
    Record<string, { categories: RedactCategoryKey[]; resolve: (r: RedactCategoryKey[]) => void }>
  >({});
  const pendingWebNav = conversation ? (pendingWebNavs[conversation.id] ?? null) : null;

  const releasePendingWebNav = (convId: string, reveal: RedactCategoryKey[]) => {
    const p = pendingWebNavs[convId];
    if (!p) return;
    p.resolve(reveal);
    setPendingWebNavs((m) => {
      const { [convId]: _dropped, ...rest } = m;
      return rest;
    });
  };

  // Resolve OUTSIDE the state updater: React may re-run an updater (StrictMode), and a
  // reducer that settles a promise is not one.
  const releasePendingWrite = (convId: string, approved: boolean) => {
    const p = pendingWrites[convId];
    if (!p) return;
    p.resolve(approved);
    setPendingWrites((m) => {
      const { [convId]: _dropped, ...rest } = m;
      return rest;
    });
  };

  // Stop pressed while a write-confirm card is open: the agentic loop aborts its await,
  // so the card would otherwise linger with a dangling promise. Once THAT turn is no
  // longer streaming, resolve it as "refused" and dismiss it. `pendingGateToRelease`
  // owns the rule (and says why it takes the two ids apart); this only applies it.
  useEffect(() => {
    const release = pendingGateToRelease({
      pendingConvIds: Object.keys(pendingWrites),
      viewedConvId: conversation?.id,
      viewedIsStreaming: activeStreaming,
    });
    if (release) releasePendingWrite(release, false);
  }, [activeStreaming, conversation?.id, pendingWrites]);

  // Same for the reveal gate — same rule, same fail-closed default (`[]` = reveal nothing).
  useEffect(() => {
    const release = pendingGateToRelease({
      pendingConvIds: Object.keys(pendingWebNavs),
      viewedConvId: conversation?.id,
      viewedIsStreaming: activeStreaming,
    });
    if (release) releasePendingWebNav(release, []);
  }, [activeStreaming, conversation?.id, pendingWebNavs]);

  // Refresh the renderer's confirmation-mode mirror from MAIN (the owner of the persisted
  // mode) so the card decision reflects reality, not the boot default. Absent host slot
  // (browser preview) ⇒ the mirror stays "standard", whose rules never defer to a window.
  useEffect(() => {
    host.mcp?.getConfirmationMode?.().then(setConfirmationModeMirror).catch(() => {});
  }, [host]);


  const runSend = async (
    text: string,
    usable: Attachment[],
    opts?: { imageAttachments?: LlmAttachment[]; imageNames?: string[]; modelId?: string; fileVault?: Record<string, string>; docReplacements?: Record<string, { real: string; fake: string; tone?: string }[]>; plotTag?: "graphique" | "preciser"; competence?: { id: string; name: string; prompt?: string; servers?: string[] }; askTarget?: AskTarget; forcedRedactions?: { value: string; category: string }[] },
  ) => {
    setAttachWarning(null);
    try {
      // No popup: resolve the review IMMEDIATELY, un-redacting exactly the values
      // the user kept in clear — via the composer chips (`keepListRef`) OR by
      // clicking a value in a DOCUMENT preview (each usable file's `reveal`). Their
      // tokens are restored in the folded file text; everything else stays redacted.
      // (Files sent as IMAGES aren't folded, so their reveal is handled at paint
      // time in `sendAsImage`; this only reaches text-folded files.)
      // Case-INSENSITIVE: a value the user un-redact ("france") must be restored
      // whatever casing the wire span carries ("France"/"FRANCE") — the engine's
      // `isKept` matches case-insensitively, so `reviewWire`'s restore must too.
      const keptLower = new Set(
        [...keepListRef.current, ...usable.flatMap((a) => a.reveal ?? [])].map((v) =>
          v.toLowerCase(),
        ),
      );
      const keptInClear = (v: string): boolean => keptLower.has(v.toLowerCase());
      const reviewWire: ReviewWire = (p) =>
        Promise.resolve({
          restoreTokens: p.matches.filter((m) => keptInClear(m.value)).map((m) => m.placeholder),
        });
      // Also pass the composer chips into the redaction `keep` allow-list so a
      // deselected span is NEVER redacted in the first place (case-insensitive) —
      // reviewWire's exact-value restore alone missed casing/whitespace variants.
      const keepValues = [...keepListRef.current, ...docDeletedRef.current];
      // Write-confirmation gate — WHEN it appears and on WHICH surface is decided by
      // `CONFIRMATION_POLICY` (`@openmasq/catalog/mcp`), evaluated by
      // `writeConfirmDecision` with this conversation's facts (web searches dispatched,
      // cards already shown, this call's exfil/attachment signals) and the main-owned
      // mode mirror. ⚠️ POLICY FIRST: an allow-list exempts only a NON-floor verdict —
      // short-circuiting first let one « Autoriser » skip every later send/exfil/PJ floor.
      // `convId` is the turn's OWN conversation (threaded by the store), NOT the one on
      // screen — the user may be reading another thread by the time the loop asks.
      const confirmToolWrite = (info: WriteConfirmInfo, convId: string) => {
        const allowedByUser =
          isWriteAutoApproveAll() ||
          sessionAllowedWriteTools.has(writeToolKey(info.server, info.tool)) ||
          // A tool the user already authorised ONCE in THIS conversation never re-asks —
          // the default scope of an « Autoriser » click (the session list is the opt-in).
          conversationAllowedWriteTools.has(convWriteToolKey(convId, info.server, info.tool));
        const verdict = writeConfirmDecision({
          mode: getConfirmationModeMirror(),
          tool: info.tool,
          server: info.server,
          exfilFlags: info.flags.length,
          attachments: info.attachments?.length ?? 0,
          searchToolCalls: webSearchCount(convId),
          // Un envoi ne se rattrape pas : il déclenche le plancher `send-floor`, quel que
          // soit le mode et quel que soit le nombre de cartes déjà montrées.
          sends: isSendTool(info.tool),
          confirmationsShown: confirmationsShownCount(convId),
          mainWriteGate: !!host.mcp?.mainWriteGate,
        });
        const decision = applyWriteAllowLists(verdict, allowedByUser);
        // "defer-to-main": main's un-spoofable window is the single confirmation (mode
        // renforcé, risky write) — drawing the card too would double-prompt. "auto": the
        // policy requires nothing for this call.
        if (decision !== "card") return Promise.resolve(true);
        recordConfirmationShown(convId); // feeds the policy's `maxPerConversation` cap
        return new Promise<boolean>((resolve) =>
          setPendingWrites((m) => ({ ...m, [convId]: { info, resolve } })),
        );
      };
      // Pre-search reveal gate: pause on the first web search and let the user pick which
      // categories to reveal (the store no-ops it when nothing's offerable / the user
      // already answered — so the promise resolves at once in those cases).
      const reviewWebNav = (categories: RedactCategoryKey[], convId: string) =>
        new Promise<RedactCategoryKey[]>((resolve) =>
          setPendingWebNavs((m) => ({ ...m, [convId]: { categories, resolve } })),
        );
      await onSend(text, usable, {
        ...opts,
        keepValues,
        reviewWire,
        confirmToolWrite,
        reviewWebNav,
      });
    } catch (e) {
      // Report the failure to analytics as a BOUNDED reason code (never the raw
      // message) with the provider/model that failed.
      const m = conversation ? findModelAny(conversation.modelId) : undefined;
      captureEvent({
        name: "send_error",
        provider: m?.provider ?? "unknown",
        model: conversation?.modelId ?? "unknown",
        reason: sendErrorReason(e),
        status: httpStatus(e),
        requestId: requestIdOf(e),
        retries: retriesOf(e),
      });
      // The store now persists every send failure INLINE on the assistant bubble
      // (with a "Réessayer" that regenerates in place, plus any CTA like a missing
      // key), so there's no banner to raise here. This catch is a safety net for an
      // unexpected throw: a Debug-Log breadcrumb only, nothing user-facing.
      pushDebug({ type: "error", scope: "send", message: e instanceof Error ? e.message : String(e) }, conversation?.id ?? DRAFT_CONV);
    }
  };

  function submit() {
    const text = input.trim();
    const usable = attachments.filter((a) => a.text.trim());
    if ((!text && usable.length === 0) || activeStreaming) return;
    // Gate: never send while a file's redaction is unfinished or failed.
    if (attachments.some((a) => a.redacting)) {
      setAttachWarning("Redaction du fichier en cours — patientez avant d'envoyer.");
      return;
    }
    const failed = attachments.find((a) => a.redactError);
    if (failed) {
      setAttachWarning(failed.redactError!);
      return;
    }
    // Document send-mode is TEMPORARILY forced to the extracted-TEXT path: the
    // "Document redacted (fichier)" option (send redacted pages as images) is disabled
    // for now, so we always send the text version and skip the SendModeDialog.
    // (`SendModeDialog` + `sendAsFile` stay wired to re-enable later — restore
    // `setSendMode({ text, usable })` here.) Reuse each file's drop-time redaction so
    // the send doesn't re-detect the whole document (mirrors `sendAsText`).
    // The staged compétence rides the MODEL payload (the store prefixes it and folds it
    // into `modelContent`); the bubble gets the tag. Read BEFORE the state resets below,
    // and threaded into BOTH send paths — "use a compétence ON this document" is the
    // main way one gets used, so the attachment path must not drop it.
    // `servers` part avec : c'est lui qui fait bâtir la ligne de consigne côté store ET
    // qui ouvre la portée d'outils du tour (et du suivant, par reprise sur le message).
    const competence = activeCompetence
      ? {
          id: activeCompetence.id,
          name: activeCompetence.name,
          prompt: activeCompetence.prompt,
          servers: activeCompetence.servers,
        }
      : undefined;
    // The staged « Demander » target rides the same way: its context line is minted
    // HERE (the snapshot the store prepends + persists on the message).
    const askTarget = activeTarget
      ? { ...activeTarget, prompt: askTargetLaunchText(activeTarget) }
      : undefined;
    if (usable.length > 0) {
      clearInput();
      setActiveTag(null);
      setActiveCompetence(null);
        setActiveTarget(null);
      setAttachments([]);
      void runSend(text, usable, {
        competence,
        askTarget,
        docReplacements: reuseDocReplacements(usable),
      });
      return;
    }
    const plotTag = activeTag?.tag;
    // Pre-conversation manual redactions ride the send opts; once a conversation
    // exists they already live on it (store.forceRedact), so pass none.
    const forcedRedactions = conversation || !pendingForced.length ? undefined : pendingForced;
    clearInput();
    setActiveTag(null);
    setActiveCompetence(null);
    setActiveTarget(null);
    setPendingForced([]);
    setAttachments([]);
    void runSend(text, usable, { plotTag, competence, askTarget, forcedRedactions });
  }

  // A vision model to offer when the current one can't take files: prefer one from
  // the SAME provider, else the first vision-capable model overall.
  const suggestedVision = useMemo(() => {
    const cur = conversation ? findModelAny(conversation.modelId) : undefined;
    const vis = ALL_MODELS.filter((m) => m.vision);
    return vis.find((m) => m.provider === cur?.provider) ?? vis[0] ?? null;
  }, [conversation]);


  async function sendAsFile(modelId?: string) {
    const mode = sendMode;
    if (!mode) return;
    setSendMode(null);
    if (modelId && conversation) onChangeModel(conversation.id, modelId);
    const targetModelId = modelId ?? conversation?.modelId ?? settings?.defaultModelId;

    // Reuse the dialog's size-PROBE render when it matches (same docs + target model) so we
    // never render twice; otherwise render now, with the progress UI.
    const cached = filePrepRef.current;
    let result: Awaited<ReturnType<typeof buildFileImages>>;
    if (cached && cached.text === mode.text && cached.modelId === targetModelId) {
      result = cached.result;
    } else {
      const ctrl = new AbortController();
      docPrepCtrl.current = ctrl;
      result = await buildFileImages(mode, targetModelId, ctrl, false, host, setDocPrep);
      setDocPrep(null);
      if (ctrl.signal.aborted) return; // cancelled mid-redaction → composer intact
    }
    filePrepRef.current = null;
    if (!result) return;
    const { images, imageNames, fileVault, totalB64, platform } = result;

    // Metered gateway body cap: fail LOUDLY (composer intact) rather than firing a doomed
    // request the gateway 400s — tell the user to send as text or use a direct-key model.
    if (platform && totalB64 > PLATFORM_MAX_B64) {
      setAttachWarning(
        "Document trop volumineux en images pour ce modèle. Envoyez-le en texte, ou changez de modèle.",
      );
      return;
    }

    clearInput();
    setAttachments([]);
    void runSend(mode.text, mode.usable, {
      imageAttachments: images,
      imageNames,
      modelId,
      fileVault,
      // Non-renderable files still go as TEXT here — reuse their drop-time redaction too
      // (image files are excluded from folding by their name, so this is a no-op for them).
      docReplacements: reuseDocReplacements(mode.usable),
    });
  }

  function sendAsText() {
    const mode = sendMode;
    if (!mode) return;
    setSendMode(null);
    clearInput();
    setAttachments([]);
    // Reuse each file's drop-time redaction → the send doesn't re-detect the whole
    // document (the double pass that delayed the reply).
    void runSend(mode.text, mode.usable, { docReplacements: reuseDocReplacements(mode.usable) });
  }

  // The inline "Renseigner la clé" CTA on a failed bubble: open the key modal for
  // that provider and remember WHICH failed turn to regenerate once the key lands.
  function handleErrorAction(assistantId: string, action: NonNullable<Message["errorAction"]>) {
    if (action.kind === "missing_key") {
      keyRetryMsgIdRef.current = assistantId;
      setKeyTarget({ provider: action.provider as ProviderId, label: action.label ?? action.provider });
      setKeyModalOpen(true);
    } else if (action.kind === "upgrade_plan") {
      // Credit budget exhausted (individual) → open Réglages → Paiement to upgrade.
      onOpenSettings("billing");
    }
  }

  // La modale s'ouvre PAR-DESSUS la conversation : rien à quitter, donc rien d'où
  // revenir. Sans hôte monté (aperçu) ⇒ Réglages, l'id de conversation l'y ramène.
  const handleConnectIntegration = (id: string) =>
    openConnector ? openConnector(id) : onOpenSettings("mcp", id, conversation?.id);

  // After the key is saved, `keyConfigured` refreshes asynchronously; once it
  // changes, regenerate the specific failed turn in place (the provider now has a
  // key). Regenerate removes the failed pair first → single re-send, no duplicate.
  useEffect(() => {
    if (!pendingRetryRef.current) return;
    pendingRetryRef.current = false;
    const msgId = keyRetryMsgIdRef.current;
    keyRetryMsgIdRef.current = null;
    if (msgId && onRegenerate) onRegenerate(msgId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyConfigured]);

  async function saveKey(value: string) {
    if (!keyTarget || !onSetApiKey) return;
    await onSetApiKey(keyTarget.provider, value);
    setKeyModalOpen(false);
    setKeyTarget(null);
    pendingRetryRef.current = true; // regenerate the failed turn once keyConfigured updates
  }

  const updateAttachment = (cid: string, patch: Partial<Attachment>) =>
    setAttachments((prev) => prev.map((a) => (a.cid === cid ? { ...a, ...patch } : a)));
  // Component captures threaded into the extracted `redactAttachment` (fresh per render so
  // it always sees the current settings/engine).
  // Live connected connectors — flips a suggestion card to Connecté once the user links it
  // in Réglages and comes back (honest signal; the kit's timer is a demo).
  const connectedMcpIds = useMcpConnectedIds();

  const redactDeps = {
    settings,
    orgForcedCategories: orgProfile?.forcedCategories,
    redactAsync,
    ctrls: attachRedactCtrls.current,
    updateAttachment,
    // Jamais indéfini — voir `ocrDebug.ts` : sans conversation encore créée, le
    // brouillon, que le premier envoi adopte.
    convId: conversation?.id ?? DRAFT_CONV,
    convCategories: conversation?.redactCategories,
    convVault: conversation?.redactionVault, // amorce du coffre de dépôt (`attachmentVault.ts`)
  };

  // Every value the user FORCES redacted — the three sources `sendForcedList` merges (Coffre
  // ⊕ the conversation's persisted set ⊕ this send's buffered ones). A document containing
  // one must NOT be reused: the drop-time pass applies no `forced` list (reusableDocReplacements).
  const forcedValues = [
    ...coffreToForced(combinedCoffre(settings)),
    ...(conversation?.forcedRedactions ?? pendingForced),
  ];

  // The drop-time redaction the send can REUSE (pure — see reusableDocReplacements). Bound
  // here to the conversation's category override + settings + the org's mandated categories
  // + the forced values, so a call site just passes a list.
  const reuseDocReplacements = (list: Attachment[]) =>
    reusableDocReplacements(
      list,
      conversation?.redactCategories,
      settings,
      forcedValues,
      orgProfile?.forcedCategories,
    );

  // La cible de journal d'un travail de dépôt : l'id NOMMÉ par « Demander » (sa
  // conversation n'est pas celle à l'écran), sinon la conversation ouverte, sinon le
  // BROUILLON — jamais indéfini. Le pourquoi : `ocrDebug.ts`.
  const journalConv = (forConvId?: string) => forConvId ?? conversation?.id ?? DRAFT_CONV;

  const { stage: stageAttachments, patch: patchStaged } = makeStaging({
    currentConvId: () => convIdRef.current,
    setLocal: setAttachments,
    getParked: getStagedFiles,
    setParked: onStagedFilesChange,
  });

  // Add extracted files to the composer and kick off redaction for each (used by
  // both the attach picker and the library "re-attach into a new conversation").
  /** Stage files on the composer. `forConvId` overrides the target — used by the shell's
   *  hand-off, whose conversation is not on screen yet; everything else stages here. */
  function addExtractedFiles(picked: ExtractedFile[], forConvId?: string) {
    const added: Attachment[] = picked.map((f) => ({
      ...f,
      cid: Math.random().toString(36).slice(2),
      redactPreview: redactMatchCount(f.text, redactPolicy.disabledKinds),
      // Redaction (AI model) runs NOW, on drop — not lazily at preview.
      redacting: !!f.text.trim(),
    }));
    stageAttachments(added, forConvId);
    const failed = picked.filter((f) => f.error);
    if (failed.length) {
      setAttachWarning(failed.map((f) => `${f.name}: ${f.error}`).join(" · "));
    }
    // Le journal suit la conversation NOMMÉE quand il y en a une : « Demander » stage pour
    // un fil qui n'est pas à l'écran, et estampiller `conversation?.id` filait ses entrées
    // à la conversation que l'utilisateur QUITTE.
    for (const f of picked) logOcrDebug(f, journalConv(forConvId));
    const deps = forConvId ? { ...redactDeps, convId: forConvId } : redactDeps;
    for (const a of added) redactAttachment(a, deps);
  }

  // Re-run redaction for a failed attachment chip (the "Réessayer" affordance).
  function retryAttachment(cid: string) {
    const a = attachments.find((x) => x.cid === cid);
    if (a) redactAttachment(a, redactDeps);
  }

  // « Lire tout » (chip « N/M pages lues ») — la logique vit dans `ocrAll.ts`.
  const canOcrAll = !!host.files?.extractAll;
  function handleOcrAll(cid: string) {
    const a = attachments.find((x) => x.cid === cid);
    if (!a || !host.files?.extractAll) return;
    void ocrAllAttachment(
      {
        files: { extractAll: host.files.extractAll.bind(host.files) },
        patch: (c, patch) => patchStaged(c, patch),
        countMatches: (t) => redactMatchCount(t, redactPolicy.disabledKinds),
        onExtracted: (f, merged) => {
          logOcrDebug(f, journalConv(conversation?.id));
          if (f.text.trim()) redactAttachment(merged, redactDeps);
        },
      },
      a,
    );
  }

  // Les dépendances de la mise en scène DIFFÉRÉE (chip d'abord, contenu ensuite) —
  // partagées entre la remise du shell (`pendingAttachment`) et le drag-and-drop,
  // pour qu'une route ne dérive jamais de l'autre.
  const deferredDeps = (convId?: string) => ({
    stage: stageAttachments,
    patch: patchStaged,
    countMatches: (t: string) => redactMatchCount(t, redactPolicy.disabledKinds),
    onExtracted: (f: ExtractedFile, a: Attachment) => {
      logOcrDebug(f, journalConv(convId));
      if (f.text.trim()) redactAttachment(a, convId ? { ...redactDeps, convId } : redactDeps);
    },
  });

  // Fichiers DÉPOSÉS : la même promesse différée que le shell — le chip paraît dès le
  // drop, l'OCR (et sa progression) le remplit, l'échec reste porté par le chip.
  function addDroppedFiles(files: DeferredFile[]) {
    for (const d of files) void stageDeferredFile(d, undefined, deferredDeps());
  }

  async function attach() {
    if (!host.files) return;
    try {
      // Fast path: pick paths only → show placeholder chips INSTANTLY, extract async,
      // so a slow extraction (a scanned PDF's OCR) doesn't delay the file's appearance.
      if (host.files.pickPaths) {
        const picked = await host.files.pickPaths();
        if (!picked.length) return;
        const placeholders: Attachment[] = picked.map((p) => ({
          name: p.name,
          path: p.path,
          kind: "",
          text: "",
          chars: 0,
          cid: Math.random().toString(36).slice(2),
          redactPreview: 0,
          extracting: true,
        }));
        setAttachments((prev) => [...prev, ...placeholders]);
        host.files
          .extract(picked.map((p) => p.path), (p) => {
            // Progression OCR par fichier (le canal porte le NOM — plusieurs fichiers
            // choisis d'un coup s'attribuent chacun leurs pages).
            const ph = placeholders.find((x) => x.name === p.name);
            if (ph) updateAttachment(ph.cid, { extractProgress: { done: p.page, total: p.pages } });
          })
          .then((extracted) => {
            placeholders.forEach((ph, i) => {
              const f = extracted[i];
              if (!f) {
                updateAttachment(ph.cid, { extracting: false, error: "extraction échouée" });
                return;
              }
              const merged: Attachment = {
                ...ph,
                ...f,
                extracting: false,
                redactPreview: redactMatchCount(f.text, redactPolicy.disabledKinds),
              };
              updateAttachment(ph.cid, {
                ...f,
                extracting: false,
                extractProgress: undefined,
                redactPreview: merged.redactPreview,
                redacting: !!f.text.trim(),
              });
              logOcrDebug(f, journalConv());
              if (f.error) setAttachWarning(`${f.name}: ${f.error}`);
              else if (f.text.trim()) redactAttachment(merged, redactDeps);
            });
          })
          .catch((e) => {
            placeholders.forEach((ph) =>
              updateAttachment(ph.cid, { extracting: false, error: "extraction échouée" }),
            );
            setAttachWarning(e instanceof Error ? e.message : String(e));
          });
        return;
      }
      addExtractedFiles(await host.files.pick()); // fallback (browser preview: no pickPaths)
    } catch (e) {
      // File-pick / extraction failure (not a send) → the transient attachment toast.
      setAttachWarning(e instanceof Error ? e.message : String(e));
    }
  }

  // Library "re-attach": a file built by the shell is dropped into the composer
  // (re-redacted from the original bytes by the normal send), then cleared.
  useEffect(() => {
    if (!pendingAttachment) return;
    // Staged for the conversation the shell NAMED, not for the one currently rendered:
    // « Demander » creates the conversation and hands the file over in the same breath, and
    // the new conversation reaches this screen a commit later. Keyed by that id, the file
    // waits in the store and the conversation-change effect picks it up — whichever order
    // the two arrive in.
    const { file, convId } = pendingAttachment;
    if (isDeferredFile(file)) void stageDeferredFile(file, convId, deferredDeps(convId));
    else addExtractedFiles([file], convId);
    onPendingConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAttachment]);

  // A compétence the user chose to USE from outside the composer. Same result as the
  // composer's own picker: stage the entity + show the tag. It never touches the draft,
  // so a half-typed message is never clobbered and the prompt can't be edited into
  // something the tag no longer describes.
  useEffect(() => {
    if (!pendingCompetence) return;
    // Same path as the composer's picker: stage the ENTITY; the chip derives from it.
    setActiveCompetence(pendingCompetence);
    setActiveTag(null);
    setActiveTarget(null);
    onCompetenceConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCompetence]);

  // A « Demander » target (right rail): same hand-off as the compétence — stage the
  // ENTITY, the chip derives from it, the draft stays the user's own. The old version
  // wrote a prose draft instead (« À propos de "patrons" dans Dropbox : ») — nothing
  // said DOSSIER, nothing was visible as a tag, and the model read the name as a
  // concept to explain rather than the clicked folder.
  useEffect(() => {
    if (!pendingTarget) return;
    setActiveTarget(pendingTarget);
    setActiveTag(null);
    setActiveCompetence(null);
    onTargetConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingTarget]);

  // The model shown in the header + composer. With NO conversation (empty app /
  // before the first send) fall back to the saved default, else the first model —
  // so the send box always shows a pre-selected model, not a blank picker.
  // Mode AUTO : le sentinel ne résout pas — `autoMode` corrige ce que l'écran DIT
  // (« Auto ») et PERMET (vision : le routeur élit un modèle vision à l'envoi).
  const autoMode = isAutoModelId(conversation?.modelId ?? settings?.defaultModelId ?? "");
  const currentModel =
    findModelAny(conversation?.modelId ?? "") ??
    findModelAny(settings?.defaultModelId ?? "") ??
    ALL_MODELS[0];
  const currentModelLabel = autoMode ? "Auto" : currentModel?.label;
  const provider = currentModel?.provider;
  const vendor = provider ? PROVIDERS[provider].label : undefined;

  // When the send-mode dialog opens on a VISION model, render the redacted pages in the
  // BACKGROUND to measure the "fichier" payload (and cache it for the real send). Cancelled
  // if the dialog closes or the user picks "texte". (Placed after `currentModel` — its dep.)
  useEffect(() => {
    if (!sendMode || !(autoMode || currentModel?.vision)) {
      setFileSize(null);
      filePrepRef.current = null;
      return;
    }
    const targetModelId = conversation?.modelId ?? settings?.defaultModelId;
    const ctrl = new AbortController();
    setFileSize({ loading: true });
    void buildFileImages(sendMode, targetModelId, ctrl, true, host, setDocPrep)
      .then((result) => {
        if (ctrl.signal.aborted) return;
        if (!result) return setFileSize(null);
        filePrepRef.current = { text: sendMode.text, modelId: targetModelId, result };
        setFileSize({
          loading: false,
          totalB64: result.totalB64,
          tooBig: result.platform && result.totalB64 > PLATFORM_MAX_B64,
        });
      })
      .catch(() => setFileSize(null));
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendMode, currentModel?.vision, conversation?.modelId, settings?.defaultModelId]);
  // Count DISTINCT protected values from the conversation vault — the single
  // source of truth that aggregates EVERY source/type (message text, attached
  // files, MCP tool results) and de-dupes repeats. Summing per-message
  // `redactions` missed file + tool-result spans and double-counted repeats.
  // `state/protectedCount.ts` is that definition, shared with the sidebar shield
  // and the confidentialité report.
  const protectedCount = conversation ? conversationProtectedCount(conversation) : 0;

  // "Bonsoir Julien" — append the first name when we have one; nameless otherwise.
  const greeting = timeGreeting(new Date().getHours(), t) + (userName ? ` ${userName}` : "");

  // ONE composer, rendered in ONE of two spots (home welcome vs docked bottom) — see
  // the two call sites below. Extracted so both share identical send wiring.
  const composerBlock = (
    <div className="composer-wrap">
      {/* Encart de TRANSPARENCE — une seule fois, après la première réponse qui a
          réellement protégé quelque chose. Même forme que la proposition mémoire
          au-dessus : un `*Seen` dans les réglages, jamais un état de composant, sinon
          il revient au prochain montage. La décision est dans `privacy/transparency.ts`. */}
      {showTransparency && settings && onChangeSettings && (
        <TransparencyCard
          count={protectedValueCount(conversation!)}
          modelName={currentModelLabel}
          onOpen={() => {
            onChangeSettings({ ...settings, transparencySeen: true });
            setShowComparison(true);
          }}
          onDismiss={() => onChangeSettings({ ...settings, transparencySeen: true })}
        />
      )}
      {showRedactionIntro && settings && onChangeSettings && (
        <RedactionIntroCard
          onOpen={() => onOpenGuideChapter!("protection")}
          onDismiss={() => onChangeSettings({ ...settings, redactionIntroSeen: true })}
        />
      )}
      {showMemoryProposal && memoryOpen && settings && onChangeSettings && (
        <MemoryProposalCard
          onActivate={() =>
            onChangeSettings({ ...settings, memoryAuto: true, memoryProposalSeen: true })
          }
          onDismiss={() => onChangeSettings({ ...settings, memoryProposalSeen: true })}
        />
      )}
      <Composer
        input={input}
        onInput={handleInput}
        onSubmit={submit}
        modelPickerSimple={settings?.modelPickerSimple}
        // La bascule est PERSISTÉE : basculer pour un envoi puis retrouver l'autre vue au
        // suivant serait un réglage qui ne tient pas. Sans `onChangeSettings` (aperçu web,
        // harnais de test) la vue reste celle qu'on lui donne, sans bascule offerte.
        onModelPickerSimpleChange={
          settings && onChangeSettings
            ? (simple) => onChangeSettings({ ...settings, modelPickerSimple: simple })
            : undefined
        }
        favoriteModels={settings?.favoriteModels}
        // Épingler = REMPLACER la liste par défaut par ses choix. Local à l'appareil,
        // comme le modèle par défaut (`toggleFavoriteModel`, pur + testé).
        onToggleFavoriteModel={
          settings && onChangeSettings
            ? (id) =>
                onChangeSettings({
                  ...settings,
                  favoriteModels: toggleFavoriteModel(settings.favoriteModels, id),
                })
            : undefined
        }
        defaultModelId={settings?.defaultModelId}
        // « Définir par défaut » depuis le menu : le même réglage que Réglages → Modèles
        // (le modèle des nouvelles conversations), désormais atteignable dans le chat.
        onSetDefaultModel={
          settings && onChangeSettings
            ? (id) => onChangeSettings({ ...settings, defaultModelId: id })
            : undefined
        }
        memoryHint={memoryHint}
        tag={competenceTag ?? targetTag ?? activeTag}
        onClearTag={() => {
          // Each intent chip derives from its entity: clearing IT clears the
          // entity (they cannot desync); a selection tag clears its own state.
          if (activeCompetence) setActiveCompetence(null);
          else if (activeTarget) setActiveTarget(null);
          else setActiveTag(null);
        }}
        onEditTag={
          // A compétence chip stands for something editable, and only once the shell
          // has wired its provider (null in a preview fragment) — the selection tags
          // stay inert text, as before.
          activeCompetence && openCompetence
            ? () => openCompetence(activeCompetence.id)
            : undefined
        }
        competences={competences}
        onPickCompetence={handlePickCompetence}
        // The live highlight's forced layer must see EVERY source the send forces —
        // the Coffre included (`forcedValues` = coffre ⊕ conversation/pending). With
        // only the conversation's set, a Coffre term typed in the composer showed no
        // highlight at all until after the send (the reported "coffre ne surligne pas").
        forcedRedactions={forcedValues}
        onForceRedact={onForceRedact || !conversation ? handleForceRedact : undefined}
        onAddToCoffre={onAddToCoffre}
        attachments={attachments}
        onRemoveAttachment={(i) => {
          // Cancel an in-flight redaction for the removed file (a long remote /
          // local redaction is otherwise un-stoppable).
          const a = attachments[i];
          if (a) {
            attachRedactCtrls.current.get(a.cid)?.abort();
            attachRedactCtrls.current.delete(a.cid);
          }
          setAttachments((prev) => prev.filter((_, j) => j !== i));
        }}
        onRetryAttachment={retryAttachment}
        onOcrAllAttachment={canOcrAll ? handleOcrAll : undefined}
        currentRedactSig={redactEngineSig(settings, orgProfile?.forcedCategories, conversation?.redactCategories)}
        inactiveCategories={inactiveCategoryLabels(
          settings?.redactCategories,
          conversation?.redactCategories,
          orgProfile?.forcedCategories,
        )}
        conversation={conversation}
        isStreaming={activeStreaming}
        onChangeModel={onChangeModel}
        // Model shown when there's no conversation yet (empty app); picking one
        // sets the default so the first send uses it. AUTO passes through as the
        // sentinel — resolving it to a real id here would silently drop the mode.
        newChatModelId={autoMode ? AUTO_MODEL_ID : currentModel.id}
        onChangeNewChatModel={(modelId) =>
          settings && onChangeSettings?.({ ...settings, defaultModelId: modelId })
        }
        onAccessInfo={(focus, providerLabel) => setAccessInfo({ focus, providerLabel })}
        onOpenModelSettings={() => onOpenSettings("models")}
        onStop={onStop}
        onAttach={attach}
        canAttach={!!host.files}
        allowedModelIds={orgProfile?.allowedModelIds}
        unavailableModels={unavailableModels}
        onKeepListChange={(k) => {
          keepListRef.current = k;
        }}
        onRevealChange={(cid, reveal) =>
          setAttachments((prev) =>
            prev.map((a) => (a.cid === cid ? { ...a, reveal } : a)),
          )
        }
        onForceRedactDoc={handleDocForceRedact}
        onDeleteRedactionDoc={handleDocDeleteRedaction}
        // The live model/local/remote detection layer only makes sense when an
        // AI-grade engine is on; for "patterns" the composer's instant regex layer
        // already covers everything, so don't pay the async round-trip (nor block
        // send on it).
        onDetectPii={
          settings?.redactEngine === "model" ||
          settings?.redactEngine === "local" ||
          settings?.redactEngine === "remote"
            ? onDetectPii
            : undefined
        }
        // ⚠️ The preview MUST obey the same rules as the send. On the `patterns`
        // engine there is no `onDetectPii` at all, so this is the only thing that
        // carries them — without it the composer highlighted and counted categories
        // the user had switched off, and the rules looked inert.
        redactPolicy={redactPolicy}
        redactLevel={redactLevel}
      />
      {conversation && (
        <div className="composer-note">
          <ConversationTokens convId={conversation.id} />
        </div>
      )}
    </div>
  );

  return (
    <DropZone onFiles={addDroppedFiles}>
    <main className="chat">
      {/* The `.chat-topbar` (rendered by ChatHeader) is now an in-flow bar at the top
          and doubles as the frameless-window drag region, so the old absolute
          `.chat-drag` strip is no longer needed. */}
      <ChatHeader
        conversation={conversation}
        protectedCount={protectedCount}
        modelName={currentModelLabel}
        onOpenTransparency={() => setShowComparison(true)}
        settings={settings}
        onChangeSettings={onChangeSettings}
        onChangeConversation={onChangeConversation}
        onSetMemoryOff={onSetMemoryOff}
        onToggleNeutralMarks={onToggleNeutralMarks}
        onOpenSettings={onOpenSettings}
        onToggleSidebar={onToggleSidebar}
        onBack={onBack}
        onDelete={onDelete}
        showTabs={showTabs}
        tabs={tabs ?? []}
        activeId={activeId ?? null}
        onSelectTab={onSelectTab ?? (() => {})}
        onCloseTab={onCloseTab ?? (() => {})}
        onNewTab={onNew}
        onTabPointerDown={onTabPointerDown}
        onSplitTab={onSplitTab}
      />

      <div
        className={`messages${conversation?.neutralMarks ? " marks-neutral" : ""}`}
        ref={scrollRef}
        onMouseUp={onMessagesMouseUp}
      >
        {messages.length === 0 ? (
          <WelcomeScreen
            greeting={greeting}
            composer={composerBlock}
            startersOff={!!settings?.startersOff}
            onPick={(p) => void runSend(p, [])}
            onSeeAll={() => onOpenSettings("mcp")}
            onSetStartersOff={
              settings && onChangeSettings
                ? (off) => onChangeSettings({ ...settings, startersOff: off })
                : undefined
            }
          />
        ) : (
          <div className="messages-inner" ref={innerRef}>
            <VirtualMessageList
              // Keyed per conversation so the windowing (heights + bottom anchor)
              // resets on open — the bottom anchor then re-runs for each thread.
              key={conversation?.id ?? "none"}
              items={messages}
              scrollRef={scrollRef}
              getKey={(m) => m.id}
              apiRef={listApi}
              // What a bubble costs to mount tracks its text length, so a FEW pasted
              // documents must window even though the thread is short on message count.
              sizeOf={(m) => m.content.length}
              // Open a large thread at its LAST message without first rendering the
              // top rows (the ~1s lag). Small threads use the un-windowed path anyway.
              initialAnchor="bottom"
            >
              {(m) => {
                // The model that actually produced this reply (pinned at send
                // time), so switching the conversation's model later doesn't
                // rewrite the logo/name on older messages. Falls back to the
                // current model for user turns and legacy replies with no `model`.
                const msgModel = m.model ? findModelAny(m.model) : undefined;
                const msgProvider = msgModel?.provider ?? provider;
                return (
                  <MessageBubble
                    key={m.id}
                    message={m}
                    provider={msgProvider}
                    modelId={msgModel?.id ?? currentModel?.id}
                    modelName={msgModel?.label ?? currentModel?.label}
                    vendor={msgProvider ? PROVIDERS[msgProvider].label : vendor}
                    vault={conversation?.redactionVault}
                    kinds={spanKinds}
                    displayTokens={displayTokens}
                    conversationId={conversation?.id}
                    sessionConversationId={conversation?.sessionConversationId}
                    onRegenerate={onRegenerate}
                    onFork={onFork}
                    onEditDocument={onEditDocument}
                    onAddSkill={skillsUsable ? addProposedSkill : undefined}
                    isSkillAdded={isProposedSkillAdded}
                    renderPdf={renderPdf}
                    onOpenFileTab={onOpenFileTab}
                    onErrorAction={handleErrorAction}
                    onReveal={onReveal}
                    onReRedact={onReRedact}
                    onReportRedaction={reportRedaction}
                    isRevealForced={isRevealForced}
                    revealedValues={conversation?.revealedValues}
                    highlight={m.id === highlightId}
                    linkPreviews={!!settings?.linkPreviews}
                    onConnectIntegration={handleConnectIntegration}
                    connectedMcpIds={connectedMcpIds}
                    credits={credits}
                    creditsResetIso={creditsResetIso}
                    // The pending pre-search reveal gate belongs to the pending assistant
                    // bubble — rendered inline under it. Stable array ref while awaited
                    // (compared in propsEqual).
                    webNavConfirm={m.pending && pendingWebNav ? pendingWebNav.categories : null}
                    onWebNavDecision={(reveal) => {
                      if (!conversation) return;
                      releasePendingWebNav(conversation.id, reveal);
                    }}
                    // The pending write-confirmation belongs to the (single) pending
                    // assistant bubble — rendered inline under it. `pendingWrite.info`
                    // is a stable ref while awaited.
                    writeConfirm={m.pending && pendingWrite ? pendingWrite.info : null}
                    onWriteDecision={(approved, remember) => {
                      if (!pendingWrite || !conversation) return;
                      if (approved) {
                        // « Autoriser » vaut pour cet outil dans CETTE conversation —
                        // asking again per call taught users to click without reading.
                        conversationAllowedWriteTools.add(
                          convWriteToolKey(conversation.id, pendingWrite.info.server, pendingWrite.info.tool),
                        );
                        if (remember) {
                          sessionAllowedWriteTools.add(
                            writeToolKey(pendingWrite.info.server, pendingWrite.info.tool),
                          );
                        }
                      }
                      releasePendingWrite(conversation.id, approved);
                    }}
                  />
                );
              }}
            </VirtualMessageList>
          </div>
        )}
      </div>

      {/* Le comparatif côte à côte. Ouvert par l'encart, et rouvrable à volonté depuis le
          menu ⋯ — c'est ce qui permet à l'encart de ne se montrer qu'une fois sans que la
          preuve devienne inatteignable. */}
      <AnimatePresence>
        {showComparison && conversation && (
          <TransparencyModal
            conversation={conversation}
            modelName={currentModelLabel}
            onClose={() => setShowComparison(false)}
          />
        )}
      </AnimatePresence>
      {/* The SAME menu the composer pops on a draft selection: Redact (→ the data-type
          picker, conversation or Coffre scope) + Préciser. A message renders the REAL
          de-redacted text, so the selection IS the value to force — no fake→real mapping
          (that's the document viewer's job). */}
      {sel && (
        <SelectionMenu
          x={sel.x}
          y={sel.y}
          onPick={(token) => {
            handleForceRedact(sel.text, token);
            seedForcedFake(sel.text, token);
            dropSelection();
          }}
          onCoffre={
            onAddToCoffre
              ? (token) => {
                  onAddToCoffre(sel.text, token);
                  dropSelection();
                }
              : undefined
          }
          onPreciser={onPreciserSelection}
          onRetenir={onAddMemoryCard && memoryOpen ? onRetenirSelection : undefined}
        />
      )}
      {/* « Retenir » confirmation — a transient toast where the selection was. */}
      {memToast && (
        <div
          className="sel-menu mem-toast"
          role="status"
          // Runtime-computed anchor (viewport coords) — the allowed inline case.
          style={{ left: memToast.x, top: memToast.y }}
        >
          <MemoryIcon size={14} />
          <span>{t.conversation.memoryToast}</span>
        </div>
      )}

      {/* Full-bleed feedback banners — direct child of .chat so they span the
          whole app width, anchored just above the composer. */}
      {orgProfile?.status === "suspended" && (
        <Banner
          tone="warning"
          title={t.conversation.suspendedTitle}
          message={t.conversation.suspendedBody}
        />
      )}
      <ChatBanners
        attachWarning={attachWarning}
        onDismissAttachWarning={() => setAttachWarning(null)}
      />

      {/* Docked at the bottom once a thread exists; on the empty home it's up in the
          welcome instead (below the greeting). Same instance — see `composerBlock`. */}
      {messages.length > 0 && composerBlock}

      <AnimatePresence>
        {accessInfo && (
          <ModelAccessModal
            focus={accessInfo.focus}
            providerLabel={accessInfo.providerLabel}
            onClose={() => setAccessInfo(null)}
            // Omitted for an account premium is already covered for — the modal then
            // says so rather than pitching a plan the user is already paying for.
            onSubscribe={
              canPitchSubscription
                ? () => {
                    setAccessInfo(null);
                    onOpenSettings("billing");
                  }
                : undefined
            }
            onOwnKeys={() => {
              setAccessInfo(null);
              onOpenSettings("models");
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {keyModalOpen && keyTarget && (
          <ApiKeyModal
            provider={keyTarget.provider}
            label={keyTarget.label}
            keyUrl={PROVIDERS[keyTarget.provider].keyUrl}
            onSave={saveKey}
            onClose={() => setKeyModalOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {sendMode && (
          <SendModeDialog
            fileCount={sendMode.usable.length}
            modelLabel={currentModelLabel ?? "Ce modèle"}
            modelVision={autoMode || !!currentModel?.vision}
            suggestedVisionLabel={suggestedVision?.label ?? null}
            // "Texte extrait" size: ≈ tokens over the typed text + every doc's extracted text.
            textTokens={estimateTokens(
              sendMode.text.length + sendMode.usable.reduce((s, a) => s + (a.text?.length ?? 0), 0),
            )}
            // "Fichier" size: the actual redacted-image payload, probed in the background.
            fileSizeLabel={
              fileSize?.loading
                ? "…"
                : fileSize?.totalB64
                  ? formatSendSize(fileSize.totalB64)
                  : null
            }
            fileTooBig={!!fileSize?.tooBig}
            onText={sendAsText}
            onFile={() => void sendAsFile()}
            onSwitchAndFile={() => suggestedVision && void sendAsFile(suggestedVision.id)}
            onCancel={() => setSendMode(null)}
          />
        )}
      </AnimatePresence>

      {/* La barre de redaction d'un document au moment de l'envoi — sa carte vit à côté. */}
      {docPrep && <DocPrepCard state={docPrep} onCancel={() => docPrepCtrl.current?.abort()} />}
    </main>
    </DropZone>
  );
}
