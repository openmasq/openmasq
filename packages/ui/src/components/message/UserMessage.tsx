import { useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import type { Message } from "../../types";
import { ActivityIcon, ShieldIcon } from "../brand";
import { MessageImages } from "../media/MessageImage";
import { useT } from "../../i18n";
import { AskTargetTag } from "./AskTargetTag";
import { isLongUserText, useBubbleFold } from "./bubbleFold";
import { MemoryCaption } from "./MemoryCaption";
import { MessageAttachments } from "./MessageAttachments";
import { RedactedText } from "./RedactedText";
import { SkillTag } from "./SkillTag";

type Attachments = NonNullable<Message["attachments"]>;

/**
 * The USER turn of `MessageBubble` (peeled off it, LOC ratchet): tags, the bubble, the
 * staged files, and the « N protégés » caption. A long bubble FOLDS (`bubbleFold.ts`).
 */
export function UserMessage({
  message,
  highlight,
  rootRef,
  hoverCard,
  fileViewer,
  vault,
  kinds,
  revealed,
  images,
  files,
  attachmentConvIds,
  onOpenAttachment,
  onOpenTransparency,
}: {
  message: Message;
  highlight?: boolean;
  rootRef: RefObject<HTMLDivElement>;
  hoverCard: ReactNode;
  fileViewer: ReactNode;
  vault?: Record<string, string>;
  kinds?: Record<string, string>;
  revealed?: Set<string>;
  images: Attachments;
  files: Attachments;
  attachmentConvIds: string[];
  onOpenAttachment: (name: string) => void;
  onOpenTransparency?: () => void;
}) {
  const t = useT();
  const skillTag = message.competence ?? message.workflow;
  const long = isLongUserText(message.content);
  const { folded, toggle } = useBubbleFold(message.id, long);
  const bubbleRef = useRef<HTMLDivElement>(null);
  // Folding back from the END of a long text would leave the reader far below the
  // bubble: bring its top back into view. Not on mount (the list owns the first scroll).
  const toggled = useRef(false);
  useLayoutEffect(() => {
    if (!toggled.current || !folded) return;
    bubbleRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [folded]);

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
        <div ref={bubbleRef} className={`msg-bubble${folded ? " is-folded" : ""}`} data-user-text>
          <RedactedText text={message.content} vault={vault} kinds={kinds} revealed={revealed} />
        </div>
      )}
      {long && !!message.content.trim() && (
        <button
          type="button"
          className="link-btn msg-fold"
          aria-expanded={!folded}
          onClick={() => {
            toggled.current = true;
            toggle();
          }}
        >
          {folded ? t.conversation.bubble.showAll : t.conversation.bubble.showLess}
        </button>
      )}
      <MessageImages images={images} conversationIds={attachmentConvIds} onOpen={onOpenAttachment} />
      <MessageAttachments attachments={files} onOpen={onOpenAttachment} />
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
      {fileViewer}
    </div>
  );
}
