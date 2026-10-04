import { useState } from "react";
import { useT } from "../../../i18n";
import type { Attachment } from "../Composer";
import { AttachmentChip } from "./AttachmentChip";
import { MANY_FILES, stagedSummary, summaryLine } from "./summary";

/**
 * The composer's ATTACHMENT row — peeled off `Composer.tsx` (LOC ratchet). Under
 * `MANY_FILES` it is the plain chips. From there (a lawyer's 30-file batch) a summary
 * line comes first, the chips sit in a bounded scrollable area, and « Tout retirer »
 * removes them ALL through the same `onRemove` the cross uses, last to first, so the
 * staged state and each file's in-flight masking are released exactly as one by one.
 */
export function AttachmentChips({
  attachments,
  currentRedactSig,
  onRetry,
  onOcrAll,
  onRemove,
  onOpen,
}: {
  attachments: Attachment[];
  currentRedactSig?: string;
  onRetry?: (cid: string) => void;
  onOcrAll?: (cid: string) => void;
  onRemove: (index: number) => void;
  onOpen: (cid: string) => void;
}) {
  const t = useT();
  // « Tout retirer » asks once, on the button itself: the second click removes.
  const [confirming, setConfirming] = useState(false);
  const many = attachments.length >= MANY_FILES;

  const chips = attachments.map((a, i) => (
    <AttachmentChip
      key={a.cid}
      a={a}
      currentRedactSig={currentRedactSig}
      onRetry={onRetry}
      onOcrAll={onOcrAll}
      onRemove={() => onRemove(i)}
      onOpen={onOpen}
    />
  ));
  if (!many) return <div className="attach-chips">{chips}</div>;

  const removeAll = () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    for (let i = attachments.length - 1; i >= 0; i--) onRemove(i);
  };
  return (
    <div className="attach-many">
      <div className="attach-summary">
        <span className="attach-summary-text">{summaryLine(stagedSummary(attachments), t)}</span>
        <button
          type="button"
          className="link-btn attach-remove-all"
          onClick={removeAll}
          onBlur={() => setConfirming(false)}
        >
          {confirming ? t.composer.attachments.removeAllConfirm(attachments.length) : t.composer.attachments.removeAll}
        </button>
      </div>
      <div className="attach-chips is-bounded">{chips}</div>
    </div>
  );
}
