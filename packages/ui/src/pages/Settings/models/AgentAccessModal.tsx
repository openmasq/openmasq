import { ModalShell } from "../../../containers/modals";
import { Switch } from "../../../components/brand";
import { useT } from "../../../i18n";
import { AgentAccountCard } from "./AgentAccountCard";
import type { AgentCli, AgentCopy } from "../../../hooks/useAgentOptIns";

/**
 * The « abonnement par CLI » opt-in (Claude Code, Codex), opened from its chip in
 * « Via un agent installé ». It used to be one more section at the bottom of the Models
 * tab: it said the same thing as the chip, two screens away, and nobody made the link
 * between « Claude Code » in the list and a switch right at the bottom.
 *
 * ⚠️ The setting stays OFF by default — the app never consumes someone's personal
 * subscription without an explicit gesture — and the probe stays LOCAL (presence of the
 * binary, never a spawn): authentication itself is only observable on the first send.
 * Hence `missingDesc` when the CLI is absent: the setting can be turned on, it will be of
 * no use until the tool is installed AND signed in.
 *
 * Under the switch, the ACCOUNT card (`AgentAccountCard`): what the CLI itself says
 * about its plan, quota and models — only when the binary is present, since asking an
 * absent CLI would only produce the « did not answer » line.
 */
export function AgentAccessModal({
  copy,
  cli,
  detected,
  enabled,
  onEnabled,
  onClose,
}: {
  copy: AgentCopy;
  /** Which CLI this agent is — the account card asks it by name. */
  cli: AgentCli;
  /** `false` = binary absent from this machine, `null` = not (yet) probed. */
  detected: boolean | null;
  enabled: boolean;
  onEnabled: (on: boolean) => void;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <ModalShell onClose={onClose} width="460px">
      <div className="rrm-head">
        <div className="cv-eyebrow rrm-eyebrow">{t.modelsTab.agentsGroupTitle}</div>
        <h2 className="cv-display rrm-title">{copy.title}</h2>
        <p className="rrm-sub">{copy.note}</p>
      </div>
      <div className="settings-card">
        <div className="toggle-row">
          <div className="row-body">
            <div className="row-title">{copy.rowTitle}</div>
            <div className="row-desc">{detected === false ? copy.missingDesc : copy.onDesc}</div>
          </div>
          <Switch checked={enabled} onChange={onEnabled} />
        </div>
        {detected !== false && <AgentAccountCard cli={cli} />}
      </div>
      <div className="confirm-footer">
        <span className="akm-foot-spacer" />
        <button className="btn-primary btn-inline" onClick={onClose}>
          {t.common.close}
        </button>
      </div>
    </ModalShell>
  );
}
