import type { Messages } from "@openmasq/i18n";
import type { useUtilityRisk } from "../../useUtilityRisk";

/** The utility warning: the message, « garder en clair » on the risk's values, and a ×. Never blocks a send. */
export function UtilityRiskNote({ util, t }: { util: ReturnType<typeof useUtilityRisk>; t: Messages }) {
  const risk = util.risk;
  if (!risk || util.dismissed === risk.kind) return null;
  return (
    <div className="utility-risk" role="note">
      <span className="utility-risk-text">{risk.message}</span>
      <button type="button" className="utility-risk-keep" title={t.composer.keepInClearTip} onClick={() => util.keepInClear(risk)}>
        {t.conversation.mark.leaveClear(t.conversation.mark.scopeSend)}
      </button>
      <button type="button" className="utility-risk-dismiss" aria-label={t.composer.dismissWarning} onClick={() => util.dismiss(risk.kind)}>
        ×
      </button>
    </div>
  );
}
