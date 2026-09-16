import type { Messages } from "@openmasq/i18n";
import type { ChatMessage, LlmAttachment } from "@openmasq/llm";
import type { McpAgentParams, WriteConfirmInfo } from "../../agent/mcpAgent";
import type { BillingSubscription, CreditBalance, Host, OrgProfileInfo } from "../../host";
import type { AskTarget, Conversation, RedactCategoryKey, Settings } from "../../types";
import type { ReviewWire } from "../redactionPreview";

/**
 * Everything the send captures from the `useChatStore` component, made explicit. The
 * store builds this bag in its `useCallback` with the same dependencies as the closure
 * it replaced, so capture semantics are unchanged.
 */
export interface SendMessageDeps {
  host: Host;
  settings: Settings;
  activeId: string | null;
  keyConfigured: Set<string>;
  patchConversation: (id: string, patch: (c: Conversation) => Conversation) => void;
  createConversation: () => string;
  forceRedact: (value: string, category: string, convId?: string) => void;
  setIsStreaming: React.Dispatch<React.SetStateAction<boolean>>;
  setBrowserActivity: React.Dispatch<React.SetStateAction<number>>;
  conversationsRef: React.MutableRefObject<Conversation[]>;
  cancelRef: React.MutableRefObject<Map<string, () => void>>;
  finishRef: React.MutableRefObject<Map<string, () => void>>;
  resumeTranscriptsRef: React.MutableRefObject<Map<string, ChatMessage[]>>;
  orgProfileRef: React.MutableRefObject<OrgProfileInfo | null>;
  personalSubRef: React.MutableRefObject<BillingSubscription | null>;
  personalCreditsRef: React.MutableRefObject<CreditBalance | null>;
  keepListRef: React.MutableRefObject<string[]>;
  localEndpointReachableRef: React.MutableRefObject<boolean | null>;
  /** `claude-cli` ready (setting ON + CLI detected) — a ref so the send reads the live value. */
  claudeCliReadyRef: React.MutableRefObject<boolean | null>;
  codexCliReadyRef: React.MutableRefObject<boolean | null>;
  antigravityCliReadyRef: React.MutableRefObject<boolean | null>;
  /** Interface-language catalogue: failure phrases persisted on the bubble, tool-summary instruction. */
  t: Messages;
}

/** Per-send options. Everything here shapes the MODEL payload or the turn's routing, never the displayed bubble. */
export interface SendOptions {
  /** Redacted page IMAGES attached to the model turn (requires a vision model, gated upstream). */
  imageAttachments?: LlmAttachment[];
  /** Names of the attachments sent as images, so their text is NOT also folded into the wire. */
  imageNames?: string[];
  modelId?: string;
  fileVault?: Record<string, string>;
  /**
   * A text-folded document's DROP-TIME redaction (real→fake+tone) keyed by file name, reused
   * at send instead of re-detecting the document. Only passed when the file's redaction is
   * complete and engine/category-current; absent docs fall back to fresh detection.
   */
  docReplacements?: Record<string, { real: string; fake: string; tone?: string }[]>;
  /** Values the user kept in clear via the composer chips: never redacted this send (case-insensitive). */
  keepValues?: string[];
  /** Manual redactions from the composer selection menu, for a send before the conversation exists. */
  forcedRedactions?: { value: string; category: string }[];
  /** Pre-send review: shows the redacted wire; resolves with tokens to reveal, or null to cancel. */
  reviewWire?: ReviewWire;
  /**
   * Per-tool confirmation awaited by the agentic loop. `WriteConfirmInfo` is imported, never
   * re-declared (rule 9). `convId` is threaded because turns run concurrently per tab: a
   * decision must never resolve a promise belonging to another conversation.
   */
  confirmToolWrite?: (info: WriteConfirmInfo, convId: string) => Promise<boolean>;
  /**
   * Pre-search REVEAL gate. Resolves with the subset the user chose to stop redacting
   * (`[]` = reveal none, the fail-closed default). Decides what the MODEL sees, never what
   * the browser sends.
   */
  reviewWebNav?: (categories: RedactCategoryKey[], convId: string) => Promise<RedactCategoryKey[]>;
  /** "graphique" prepends a run_python directive and FORCES the code interpreter for this send. */
  plotTag?: "graphique" | "preciser";
  /**
   * A compétence used for this send. Its `prompt` rides the MODEL payload only and goes
   * through the same redaction as typed text. Absent on a RETRY (already in `resendWire`).
   * `servers` names the connectors in the prefix AND widens the turn's tool scope.
   */
  competence?: { id: string; name: string; prompt?: string; servers?: string[] };
  /** The folder/file this send is about (« Demander »): a tag, model payload only, same retry rule. */
  askTarget?: AskTarget;
  /** Tool-routing threshold override: only the eval bench sets it. Undefined ⇒ defaults. */
  routingConfig?: McpAgentParams["routingConfig"];
  /** Target conversation; a split pane passes its own id. Defaults to the focused `activeId`. */
  convId?: string;
  /**
   * RETRY: the original model payload (a prior turn's `modelContent`) re-sent VERBATIM as the
   * wire while `text` stays the displayed content. When set, no attachment text is folded.
   */
  resendWire?: string;
  /** RETRY: reuse the failed turn's id so write-idempotency keys match (`agent/writeIdempotency.ts`). */
  resendTurnId?: string;
}
