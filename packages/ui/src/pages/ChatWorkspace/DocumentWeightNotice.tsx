import { useMemo } from "react";
import { FileIcon } from "../../components/brand";
import { useT } from "../../i18n";
import { documentWeight } from "../../send/documentLoad";
import type { Message } from "../../types";

/**
 * What the conversation's documents cost the model, docked above the composer: every
 * question re-sends them, and past the window the oldest stop being sent. Display only,
 * silent below half the window and for Auto / an unknown window (`send/documentLoad.ts`).
 */
export function DocumentWeightNotice({
  messages,
  modelId,
  modelLabel,
}: {
  messages: readonly Message[];
  /** `undefined` in Auto mode: the router picks a model that fits. */
  modelId: string | undefined;
  modelLabel: string;
}) {
  const t = useT();
  const weight = useMemo(() => documentWeight({ modelId, messages }), [modelId, messages]);
  if (!weight) return null;
  const pct = Math.round(weight.share * 100);
  return (
    <div className="shield-caption warn doc-weight-note" role="status">
      <FileIcon size={12} />
      <span className="flex-min">
        {pct >= 100 ? t.conversation.docs.weightOver(modelLabel) : t.conversation.docs.weight(pct, modelLabel)}{" "}
        {t.conversation.docs.roomHint}
      </span>
    </div>
  );
}
