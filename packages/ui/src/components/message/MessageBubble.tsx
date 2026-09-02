import { memo, useCallback, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import type { ProviderId } from "@openmasq/llm";
import type { Message, RedactCategoryKey } from "../../types";
import type { CreditBalance } from "../../host";
import { RedactedText } from "./RedactedText";
import { SkillTag } from "./SkillTag";
import { useHost } from "../../host";
import { ModelLogo, ShieldIcon, ActivityIcon } from "../brand";
import { MessageActions } from "./MessageActions";
import { Markdown } from "../markdown/Markdown";
import type { ProposedSkill } from "../../suggestions/proposedSkill";
import { AskTargetTag } from "./AskTargetTag";
import { IntegrationSuggestions } from "../agent/IntegrationProposalCard";
import { MAX_SUGGESTIONS } from "../../agent/suggestIntegrations";
import { WriteConfirmCard } from "../../pages/ChatWorkspace/WriteConfirmCard";
import { WebNavRedactOffer } from "../WebNavRedactOffer";
import type { WriteConfirmInfo } from "../../agent/mcpAgent";
import { ThinkingIndicator } from "./ThinkingIndicator";
import { TurnProcess } from "./TurnProcess";
import { MessageNotices } from "./MessageNotices";
import { TurnStatus } from "./TurnStatus";
import { assistantBody, showsTrailingLoader } from "./messageBubbleView";
import { useStreamReveal } from "../../hooks/useStreamReveal";
import { RedactionInlineReveal } from "./RedactionInlineReveal";
import { FileViewerModal } from "../../containers/modals";
import { MemoryCaption } from "./MemoryCaption";
import { MessageAttachments } from "./MessageAttachments";
import { MessageImages, loadStoredImageFull } from "../media/MessageImage";
import { findStoredFile } from "../../state/files/storedFiles";

import { useT } from "../../i18n";
interface Props {
  message: Message;
  /** Provider/name of the model this conversation talks to (for the gutter logo). */
  provider?: ProviderId;
  /** The reply's model id — lets the gutter logo show its REAL vendor mark
   *  (DeepSeek/Kimi/… under a platform gateway), not just the provider glyph. */
  modelId?: string;
  modelName?: string;
  vendor?: string;
  /** Conversation redaction vault — used to locate redacted spans in the text. */
  vault?: Record<string, string>;
  /** value -> kind, so each span is coloured by its real category. */
  kinds?: Record<string, string>;
  /** Jetons display: real value → `[PERSON1]` token, threaded to the hover card so it
   *  names the pseudonym the way the redacted document views do. Computed once by the
   *  caller (ChatView, from the conversation vault) — never re-derived per bubble. */
  displayTokens?: Map<string, string>;
  /** Conversation storage ids — to resolve an attachment's stored file by name. */
  conversationId?: string;
  sessionConversationId?: string;
  /** Retry a FAILED assistant turn in place (regenerate the reply, no duplicate
   *  user message). Rendered as a "Réessayer" button on an errored bubble. */
  onRegenerate?: (assistantId: string) => void;
  /** Fork the conversation FROM this message (kit): a duplicate thread up to and
   *  including it, sharing the redaction lineage (vault + salt). */
  onFork?: (messageId: string) => void;
  /** Persist a DocumentCard edit into this message's ```document fence (store
   *  `editDocument`). Absent ⇒ generated documents render read-only. */
  onEditDocument?: (messageId: string, oldText: string, newText: string) => Promise<boolean>;
  /** Adopt a skill the model just proposed (`SkillCard`).
   *  Absent ⇒ the card stays readable and inert. */
  onAddSkill?: (skill: ProposedSkill) => boolean;
  isSkillAdded?: (skill: ProposedSkill) => boolean;
  /** Platform HTML→PDF typesetter for a generated document's « Télécharger → PDF »
   *  (`host.pdf`, threaded by ChatView — this tier doesn't read the host). Absent ⇒ the
   *  card falls back to the in-renderer pdf-lib exporter. */
  renderPdf?: (doc: { html: string; css: string; title: string }) => Promise<Uint8Array>;
  /** Open a message's document as a workspace FILE TAB (unified tabs). Absent ⇒ the
   *  in-app viewer modal (mobile / preview). */
  onOpenFileTab?: (file: { id: string; name: string; mime?: string; convId?: string }) => void;
  /** Run the actionable CTA on a failed turn (e.g. `missing_key` → open the key
   *  modal for that provider, then regenerate in place). */
  onErrorAction?: (assistantId: string, action: NonNullable<Message["errorAction"]>) => void;
  /** Un-redact a value for this conversation ('suspend' reversible / 'delete').
   *  When present, redaction marks in this message become click-to-suspend. */
  onReveal?: (value: string, mode: "suspend" | "delete") => boolean;
  onReRedact?: (value: string) => void;
  /** « Signaler un masquage incorrect » on a mark's popover — opens « Votre avis »
   *  prefilled. The bubble derives the surface from its own role (user message vs
   *  reply); `kindLabel` is the mark's category word, never the value. */
  onReportRedaction?: (surface: "message" | "reponse", kindLabel: string) => void;
  isRevealForced?: (value: string) => boolean;
  /** Values currently suspended (revealed) for this conversation. */
  revealedValues?: string[];
  /** Briefly flash this bubble — set when the user jumped here from the audit page. */
  highlight?: boolean;
  /** Opt-in OpenGraph link-preview cards under the bubble (`Settings.linkPreviews`). */
  linkPreviews?: boolean;
  /** Connect an integration the model suggested (`Message.suggestedIntegrations`) —
   *  deep-links to Réglages → MCP with that connector preselected. */
  onConnectIntegration?: (connectorId: string) => void;
  /** This bubble is NOT the conversation's one integration host (`integrationSlot.ts`):
   *  its suggestions stay pinned on the message but are not rendered. */
  hideIntegrations?: boolean;
  /** « N protégés · voir » opens the transparency comparison. Absent ⇒ plain caption. */
  onOpenTransparency?: () => void;
  /** The account's REAL prepaid credit budget — drives the credit card's figures + bar.
   *  Absent/null ⇒ the card shows no numbers (never an invented amount). */
  credits?: CreditBalance | null;
  /** The subscription's `currentPeriodEnd` — when the budget resets. Absent ⇒ no date. */
  creditsResetIso?: string;
  /** Connector ids currently CONNECTED (live, from `host.mcp`) — flips a suggestion card
   *  to its Connecté state once the user links it in Réglages. A stable ref while the set
   *  is unchanged (`useMcpConnectedIds`), so it's safe to compare in `propsEqual`. */
  connectedMcpIds?: string[];
  /** A PENDING write-confirmation for THIS (pending) assistant message — the agentic
   *  loop is paused awaiting the user. Rendered inline UNDER the bubble (like the
   *  web-nav offer), not a centered modal. Absent/null = no pending confirm. Must be
   *  a STABLE object ref while pending (it's compared in `propsEqual`). */
  writeConfirm?: WriteConfirmInfo | null;
  /** Resolve the pending write-confirmation (Autoriser/Refuser + "always allow"). */
  onWriteDecision?: (approved: boolean, remember: boolean) => void;
  /** A PENDING web-search REVEAL gate for THIS (pending) assistant message: the
   *  offerable redaction categories the user can un-redact before the search runs.
   *  Rendered inline UNDER the bubble; the agentic loop is PAUSED awaiting the choice.
   *  A STABLE array ref while pending (compared in `propsEqual`). */
  webNavConfirm?: RedactCategoryKey[] | null;
  /** Resolve the pending web-search reveal gate with the categories the user chose to
   *  reveal for the conversation — `[]` = none. Either closes it for good. */
  onWebNavDecision?: (reveal: RedactCategoryKey[]) => void;
}

function MessageBubbleImpl({
  message,
  provider,
  modelId,
  modelName,
  vendor,
  vault,
  kinds,
  displayTokens,
  conversationId,
  sessionConversationId,
  onRegenerate,
  onFork,
  onEditDocument,
  onAddSkill,
  isSkillAdded,
  renderPdf,
  onOpenFileTab,
  onErrorAction,
  onReveal,
  onReRedact,
  onReportRedaction,
  isRevealForced,
  revealedValues,
  onConnectIntegration,
  hideIntegrations,
  onOpenTransparency,
  connectedMcpIds,
  credits,
  creditsResetIso,
  writeConfirm,
  onWriteDecision,
  webNavConfirm,
  onWebNavDecision,
  highlight,
  linkPreviews,
}: Props) {
  const t = useT();
  const host = useHost();
  // Values suspended (revealed) for this conversation — marks render dimmed + click re-redacted.
  const revealedSet = useMemo(
    () => (revealedValues && revealedValues.length ? new Set(revealedValues) : undefined),
    [revealedValues],
  );
  // ONE inline reveal per bubble (portal, flush to the mark) for BOTH user +
  // assistant marks — replaces the old floating tooltip.
  const skillTag = message.competence ?? message.workflow;
  const rootRef = useRef<HTMLDivElement>(null);
  const hoverCard = onReveal ? (
    <RedactionInlineReveal
      containerRef={rootRef}
      displayTokens={displayTokens}
      onReveal={onReveal}
      onReRedact={onReRedact}
      isRevealForced={isRevealForced}
      revealed={revealedSet}
      onReport={
        onReportRedaction
          ? (kind) => onReportRedaction(message.role === "assistant" ? "reponse" : "message", kind)
          : undefined
      }
    />
  ) : null;
  const [viewFile, setViewFile] =
    useState<{ id: string; name: string; mime?: string; redacted?: boolean } | null>(null);
  // Smooth the streamed reply: reveal `content` word-by-word at an even cadence (bursty
  // network chunks) while pending; snaps to the full text the instant the turn settles.
  // Called unconditionally (hook rule) — a no-op verbatim for user turns/settled replies.
  const revealedContent = useStreamReveal(message.content, !!message.pending);

  // Resolve an attachment's stored file by name (files are keyed by the local id
  // or the keyless session id) and open it in the in-app viewer.
  const openAttachment = async (fileName: string) => {
    const ids = [conversationId, sessionConversationId];
    const found = await findStoredFile(fileName, ids, host.db?.listFiles?.bind(host.db));
    if (!found) return;
    const { meta, convId } = found;
    // Unified tabs: a document opened from the conversation becomes a TAB (kit);
    // the modal stays the fallback for surfaces without the tab system.
    if (onOpenFileTab) onOpenFileTab({ id: meta.id, name: meta.name, mime: meta.mime, convId });
    // `redacted` = redacted bytes OR deposit count (a PDF/image has no scrubbed).
    else setViewFile({ ...meta, redacted: meta.redacted || !!meta.redactedCount });
  };

  // Split attachments: images (e.g. a tool-returned design thumbnail) render
  // INLINE from their stored bytes; everything else stays a click-to-open chip.
  const allAttachments = message.attachments ?? [];
  const imageAttachments = allAttachments.filter((a) => a.kind === "image");
  // Everything that isn't an inline image stays a click-to-open chip.
  const fileAttachments = allAttachments.filter((a) => a.kind !== "image");
  // Memoized: this array is the Markdown doc-context's `imageIds`, and a fresh ref on every
  // render would re-render the DocumentCard on every streamed word.
  const attachmentConvIds = useMemo(
    () => [conversationId, sessionConversationId].filter(Boolean) as string[],
    [conversationId, sessionConversationId],
  );
  // Full-resolution re-load for the document export (the inline previews are downscaled).
  const loadImage = useCallback(
    (name: string) => loadStoredImageFull(name, attachmentConvIds, host.db),
    [attachmentConvIds, host.db],
  );

  if (message.role === "user") {
    return (
      <div className={`msg user${highlight ? " msg-flash" : ""}`} data-mid={message.id} ref={rootRef}>
        {hoverCard}
        {message.plotTag === "graphique" && (
          <div className="msg-tag tone-lime" title={t.conversation.bubble.plotTip}>
            <ActivityIcon size={12} />
            <span>{t.conversation.bubble.plot}</span>
          </div>
        )}
        {message.askTarget && <AskTargetTag target={message.askTarget} />}
        {/* ⚠️ `?? workflow`: the OLD tag, still around in history (`@openmasq/schema`). */}
        {skillTag && <SkillTag competence={skillTag} vault={vault} kinds={kinds} />}
        {!!message.content.trim() && (
          <div className="msg-bubble" data-user-text>
            <RedactedText
              text={message.content}
              vault={vault}
              kinds={kinds}
              revealed={revealedSet}
            />
          </div>
        )}
        <MessageImages
          images={imageAttachments}
          conversationIds={attachmentConvIds}
          onOpen={(name) => void openAttachment(name)}
        />
        <MessageAttachments
          attachments={fileAttachments}
          onOpen={(name) => void openAttachment(name)}
        />
        <MemoryCaption message={message} />
        {message.redactionFailed && (
          <div className="shield-caption warn" title={t.conversation.bubble.redactionFailedTip}>
            <ShieldIcon size={13} />
            <span className="flex-min">{message.redactionFailed}</span>
          </div>
        )}
        {/* ONE short, stable mention — « N protégés · voir » — that opens the transparency
            comparison, where the per-category detail lives. The header menu and the
            composer pill count the CONVERSATION; this counts the message. */}
        {!!message.redactions &&
          (onOpenTransparency ? (
            <button
              type="button"
              className="shield-caption spade-corners is-button"
              title={t.conversation.bubble.redactedTip}
              onClick={onOpenTransparency}
            >
              <ShieldIcon size={13} />
              <span>
                {t.conversation.bubble.protectedCount(message.redactions)} ·{" "}
                <span className="caption-see">{t.conversation.bubble.protectedSee}</span>
              </span>
            </button>
          ) : (
            <div className="shield-caption spade-corners" title={t.conversation.bubble.redactedTip}>
              <ShieldIcon size={13} />
              <span>{t.conversation.bubble.protectedCount(message.redactions)}</span>
            </div>
          ))}
        <AnimatePresence>
          {viewFile && (
            <FileViewerModal
              id={viewFile.id}
              name={viewFile.name}
              mime={viewFile.mime}
              redacted={viewFile.redacted}
              vault={vault}
              kinds={kinds}
              onClose={() => setViewFile(null)}
            />
          )}
        </AnimatePresence>
      </div>
    );
  }

  const body = assistantBody(message);

  return (
    <div className={`msg assistant${highlight ? " msg-flash" : ""}`} data-mid={message.id} ref={rootRef}>
      {hoverCard}
      <div className="msg-logo">
        {provider && <ModelLogo provider={provider} modelId={modelId} size={28} tile />}
      </div>
      <div className="msg-body">
        {(modelName || vendor) && (
          <div className="msg-meta">
            <span className="msg-name">{modelName}</span>
            {vendor && <span className="msg-vendor">{vendor}</span>}
          </div>
        )}
        {/* How the turn was reached, above the answer and persisted with it: the
            model's reflection (collapsed) then the agentic tool trace. */}
        <TurnProcess message={message} />
        {/* `assistantBody` decides on TRIMMED content so a lone "\n"/space streamed around
            a tool call (truthy but blank) can't render an empty Markdown block AND suppress
            the loader — the reported "message vide, aucun loader". `messageBubbleView.ts`. */}
        {body === "content" ? (
          <div data-user-text className={`msg-answer ${message.error ? "error" : ""} ${message.pending ? "streaming" : ""}`}>
            {/* Full Markdown + math while it streams (partial markdown renders
                fine), so formatting and images appear live, highlight preserved.
                Link previews stay OFF until the turn finishes (`!pending`): fetching
                per chunk re-rendered + re-fetched every link (and hit half-typed
                URLs) — they appear once the reply settles. */}
            <Markdown
              content={revealedContent}
              vault={vault}
              kinds={kinds}
              revealed={revealedSet}
              linkPreviews={linkPreviews && !message.pending}
              // A streaming document can't be edited (its fence is still growing).
              onDocumentEdit={
                onEditDocument && !message.pending
                  ? (o, n) => onEditDocument(message.id, o, n)
                  : undefined
              }
              renderPdf={renderPdf}
              imageIds={attachmentConvIds}
              loadImage={loadImage}
              // Same as editing: a card still being written is inert.
              onAddSkill={message.pending ? undefined : onAddSkill}
              isSkillAdded={isSkillAdded}
            />
          </div>
        ) : body === "thinking" ? (
          // Prefill / tool-routing wait, and while a tool-call ARGUMENT streams (no prose):
          // the loader + the model's live reflection. `toolStatus` still feeds the trace above.
          <ThinkingIndicator reasoning={message.reasoning} />
        ) : null}
        {/* …and it SURVIVES the first token: still writing ≠ finished (`showsTrailingLoader`). */}
        {showsTrailingLoader(message) && <ThinkingIndicator trailing />}

        {/* ONE slot for how the turn ended — failed / interrupted / empty / tool step, or
            the credits card — with the single « Réessayer » (regenerates in place, no
            duplicate send). The decision is `TurnStatus/status.ts`. */}
        <TurnStatus
          message={message}
          onRegenerate={onRegenerate}
          onErrorAction={onErrorAction}
          credits={credits}
          creditsResetIso={creditsResetIso}
        />

        {/* What the app has to say about this turn: the fault, and the remaining quota. */}
        <MessageNotices message={message} modelName={modelName} />

        {/* « retiens ça » feedback — the extraction pins its outcome on THIS reply
            (see store's noteOnMessage). Clickable deep-link + « Annuler ». */}
        <MemoryCaption message={message} />

        {/* The conversation's ONE proposal (`hideIntegrations` says whether this bubble
            hosts it), capped like the loop caps it. */}
        {message.suggestedIntegrations?.length && !message.pending && !hideIntegrations ? (
          <IntegrationSuggestions
            ids={message.suggestedIntegrations.slice(0, MAX_SUGGESTIONS)}
            connectedIds={connectedMcpIds}
            onConnect={(id) => onConnectIntegration?.(id)}
            // « Continuer » (connected) = regenerate THIS turn: the model replays the
            // original request with the now-present tools — not a detour through Réglages.
            onResume={onRegenerate ? () => onRegenerate(message.id) : undefined}
          />
        ) : null}

        {/* Pre-search REVEAL gate — the agentic loop is PAUSED before the first
            web search until the user picks which categories to reveal. Rendered
            inline under the bubble (same place + manner as the write-confirm). */}
        {webNavConfirm?.length ? (
          <WebNavRedactOffer
            categories={webNavConfirm}
            onDecide={(reveal) => onWebNavDecision?.(reveal)}
          />
        ) : null}

        {/* Pending confirmation for a tool the loop won't run silently — rendered INLINE
            under the bubble (same place as the web-nav offer), not a centered modal, so
            the user decides in the conversation flow while still seeing the live
            agent-browser. The loop is paused on `confirmWrite` until onWriteDecision.
            Spread whole: the loop OWNS the payload (values, reason, flags) and the card
            renders it — this component must not compute a second opinion about it. */}
        {writeConfirm && (
          <WriteConfirmCard
            {...writeConfirm}
            onDecision={(approved, remember) => onWriteDecision?.(approved, remember)}
          />
        )}

        {/* Files a tool returned (e.g. a Canva export) — real bytes stored + shown
            to the user; the model only ever saw a placeholder. A design thumbnail
            (image) renders inline; other files stay chips. */}
        <MessageImages
          images={imageAttachments}
          conversationIds={attachmentConvIds}
          onOpen={(name) => void openAttachment(name)}
        />
        <MessageAttachments
          attachments={fileAttachments}
          onOpen={(name) => void openAttachment(name)}
          generated
        />

        {message.content && !message.pending && !message.error && (
          <MessageActions
            messageId={message.id}
            content={message.content}
            conversationId={conversationId}
            onRegenerate={onRegenerate}
            onFork={onFork}
          />
        )}
        <AnimatePresence>
          {viewFile && (
            <FileViewerModal
              id={viewFile.id}
              name={viewFile.name}
              mime={viewFile.mime}
              redacted={viewFile.redacted}
              vault={vault}
              kinds={kinds}
              onClose={() => setViewFile(null)}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/**
 * Skip re-rendering a bubble when nothing it shows changed. This is what stops
 * EVERY visible message from re-parsing its Markdown + recomputing its redaction
 * segments on each keystroke: the composer's `input` state lives up in `ChatView`,
 * whose re-render would otherwise cascade into every `MessageBubble`.
 *
 * `message` is compared by REFERENCE — the store rebuilds only the message object
 * that changed (`messages.map(m => m.id === id ? {...m, …} : m)`), so a
 * streaming/edited turn gets a fresh ref (→ re-renders) while historical turns
 * keep theirs (→ skipped). `onRegenerate` is intentionally NOT compared: its
 * behaviour is stable even if its identity churns across renders.
 */
function propsEqual(a: Props, b: Props): boolean {
  return (
    a.message === b.message &&
    a.connectedMcpIds === b.connectedMcpIds &&
    a.credits === b.credits &&
    a.creditsResetIso === b.creditsResetIso &&
    a.vault === b.vault &&
    a.kinds === b.kinds &&
    a.provider === b.provider &&
    a.modelId === b.modelId &&
    a.modelName === b.modelName &&
    a.vendor === b.vendor &&
    a.conversationId === b.conversationId &&
    a.sessionConversationId === b.sessionConversationId &&
    // Suspending a value changes revealedValues (new array ref) without touching
    // the message — compare it so the marks re-render dimmed/clickable.
    a.revealedValues === b.revealedValues &&
    // A pending write-confirmation / web-nav reveal gate lives in ChatView state (NOT
    // on the message), so compare them or the paused bubble wouldn't re-render to
    // show/hide the card. Both are stable refs while pending → identity is correct.
    a.writeConfirm === b.writeConfirm &&
    a.webNavConfirm === b.webNavConfirm &&
    a.hideIntegrations === b.hideIntegrations &&
    a.highlight === b.highlight
  );
}

export const MessageBubble = memo(MessageBubbleImpl, propsEqual);
