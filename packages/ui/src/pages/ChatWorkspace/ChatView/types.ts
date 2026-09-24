import type { LlmAttachment } from "@openmasq/llm";
import type { ReviewWire } from "../../../send/redactionPreview";
import type { WriteConfirmInfo } from "../../../agent/mcpAgent";
import type { UnavailableReason } from "../../../send/modelAvailability";
import type { CreditBalance, ExtractedFile, OrgProfileInfo } from "../../../host";
import type {
  AskTarget,
  Conversation,
  MemoryCard,
  Message,
  RedactCategoryKey,
  Settings,
  Skill,
} from "../../../types";
import type { DeferredFile } from "../../../state/files/deferredFile";
import type { Attachment } from "../Composer";
import type { ConvTab } from "../ConvTabs";

/** A compétence riding a send: its prompt joins the MODEL payload only (the bubble shows a tag). */
interface SendSkill {
  id: string;
  name: string;
  prompt?: string;
  servers?: string[];
}

export interface ForcedRedaction {
  value: string;
  category: string;
}

type DocReplacements = Record<string, { real: string; fake: string; tone?: string }[]>;

/** What a send may carry besides its text — the subset the VIEW decides. */
export interface RunSendOpts {
  imageAttachments?: LlmAttachment[];
  imageNames?: string[];
  modelId?: string;
  fileVault?: Record<string, string>;
  /** A text-folded document's drop-time redaction, reused at send instead of re-detecting. */
  docReplacements?: DocReplacements;
  /** Text-selection menu tag: "graphique" forces a run_python plot for this send. */
  plotTag?: "graphique" | "preciser";
  competence?: SendSkill;
  /** The folder/file this send is ABOUT (« Demander ») — its context line rides the model payload only. */
  askTarget?: AskTarget;
  /** Manual redactions for THIS send — only before the conversation exists; afterwards they live on it. */
  forcedRedactions?: ForcedRedaction[];
}

/** The full option bag `onSend` receives: the view's opts plus the gates the store awaits. */
interface SendOpts extends RunSendOpts {
  keepValues?: string[];
  reviewWire?: ReviewWire;
  confirmToolWrite?: (info: WriteConfirmInfo, convId: string) => Promise<boolean>;
  /** Pre-search reveal gate: which categories to STOP redacting so the model reads the web answer. */
  reviewWebNav?: (categories: RedactCategoryKey[], convId: string) => Promise<RedactCategoryKey[]>;
}

type DetectPii = (
  text: string,
  signal?: AbortSignal,
) => Promise<{ matches: { value: string; category: string; uncertain?: boolean }[]; engine: string; error?: string }>;

/** The chip shown in the composer for the intent staged on the next send. */
export interface IntentTag {
  /** Only the text-selection tag drives a send behaviour (`plotTag`); the others are display chips. */
  tag?: "preciser";
  label: string;
  tone: string;
  glyph?: "folder" | "file";
  preview?: string;
  servers?: { id: string; name: string; tone: string }[];
  slots?: string[];
}

export interface ChatViewProps {
  conversation: Conversation | null;
  /** First name for the home greeting; undefined ⇒ nameless. */
  userName?: string;
  /** GLOBAL streaming flag. The composer gates on the per-conversation one instead, so an idle tab stays sendable. */
  isStreaming: boolean;
  onSend: (text: string, attachments?: ExtractedFile[], opts?: SendOpts) => Promise<void>;
  /** Live PII detection for the composer preview (same engine as the send, never mutates the vault). */
  onDetectPii?: DetectPii;
  onStop: () => void;
  onChangeModel: (convId: string, modelId: string) => void;
  /** Regenerate a failed assistant turn in place. */
  onRegenerate?: (assistantId: string) => void;
  onFork?: (messageId: string) => void;
  onEditDocument?: (messageId: string, oldText: string, newText: string) => Promise<boolean>;
  onOpenFileTab?: (file: { id: string; name: string; mime?: string; convId?: string }) => void;
  onNew: () => void;
  onOpenSettings: (tab?: string, connectorId?: string, returnToConvId?: string) => void;
  onToggleSidebar?: () => void;
  /** MOBILE: back to the chat list. */
  onBack?: () => void;
  /** In-header conversation tabs. The tiling workspace renders its own strip and passes `showTabs={false}`. */
  tabs?: ConvTab[];
  activeId?: string | null;
  onSelectTab?: (id: string) => void;
  onCloseTab?: (id: string) => void;
  showTabs?: boolean;
  onTabPointerDown?: (id: string, e: import("react").PointerEvent) => void;
  onSplitTab?: (id: string, side: "left" | "right") => void;
  /** Per-conversation UNSENT draft, kept by the store so it survives a tab switch. */
  getDraft?: (id: string) => string;
  onDraftChange?: (id: string, text: string) => void;
  /** Files staged on the composer, parked per conversation by the store. Absent ⇒ they die with the screen. */
  getStagedFiles?: (id: string) => readonly Attachment[];
  onStagedFilesChange?: (id: string, items: readonly Attachment[]) => void;
  onDelete?: () => void;
  settings?: Settings;
  onChangeSettings?: (s: Settings) => void;
  /** Opens the guide on a chapter. Absent ⇒ the redaction-intro card does not render. */
  onOpenGuideChapter?: (id: string) => void;
  onChangeConversation?: (id: string, cats: Conversation["redactCategories"]) => void;
  onSetMemoryOff?: (id: string, off: boolean) => void;
  /** Un-redact a value for this conversation. Returns false when the org forces that category. */
  onReveal?: (value: string, mode: "suspend" | "delete") => boolean;
  onReRedact?: (value: string) => void;
  isRevealForced?: (value: string) => boolean;
  /** Force a value redacted for this conversation, AS `category`; persisted on the conversation by the store. */
  onForceRedact?: (value: string, category: string) => void;
  /** Add the selected span to the global Coffre. */
  onAddToVault?: (value: string, token: string) => void;
  /** « Retenir »: local + instant, never a model call. Absent ⇒ the gesture is hidden. */
  onAddMemoryCard?: (input: { entity: string; facts: string; cat?: string }) => MemoryCard | null;
  memoryHint?: boolean;
  onSetApiKey?: (id: string, value: string) => void | Promise<void>;
  /** « Obtenir une clé gratuitement » — OpenRouter's OAuth flow, the key minted and stored by
   *  the platform (`state/auth/connectOpenRouter.ts`): the modal over a failed send offers the
   *  same road as the onboarding and Réglages → Modèles. Absent (preview) ⇒ paste only. */
  onConnectOpenRouter?: () => Promise<boolean>;
  /** Which provider keys are configured; a change here fires the auto-retry. */
  keyConfigured?: Set<string>;
  /** A file to drop into the composer; consumed once. */
  pendingAttachment?: { file: ExtractedFile | DeferredFile; convId: string } | null;
  onPendingConsumed?: () => void;
  /** A compétence to USE, handed over by the shell; staged as a TAG, never draft text. */
  pendingSkill?: Skill | null;
  onSkillConsumed?: () => void;
  /** The « Demander » target, handed over by the shell; staged as a TAG. */
  pendingTarget?: AskTarget | null;
  onTargetConsumed?: () => void;
  /** The signed-in member's org authorization (null = solo user). */
  orgProfile?: OrgProfileInfo | null;
  /** The account's REAL prepaid credit budget. Absent ⇒ the card shows no numbers. */
  credits?: CreditBalance | null;
  creditsResetIso?: string;
  /** False for a paying account, an org member, and while the subscription is unknown. */
  canPitchSubscription?: boolean;
  unavailableModels?: ReadonlyMap<string, UnavailableReason>;
  /** Reveal a message: scroll to it and flash it. `nonce` lets the same target retrigger. */
  scrollTarget?: { convId: string; msgId: string; nonce: number } | null;
  onScrolled?: () => void;
}

export type { Message };
