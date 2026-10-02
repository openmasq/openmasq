import type { SubscriptionCli } from "@openmasq/llm";
import { useT } from "../../i18n";
import { noteCliSession } from "../../state/effects/cliSession";
import { ModalShell } from "../modals/ModalShell";
import { AgentSetupRows } from "./AgentSetupRows";

/**
 * « Se reconnecter », opened from a turn a subscription CLI refused for its session (or
 * that the send gate refused on its status). It is the SAME sign-in as Réglages → Modèles
 * — `AgentSetupRows`, started at once (`signInNow`) — never a second flow: the CLI's own
 * `auth login`, its page, its code; the app never sees a credential.
 *
 * Only a sign-in run HERE closes it: the session is noted (no spawn), so the send gate
 * reads « signed in » in the same tick and the caller can replay the turn. A status read
 * as « connected » on opening proves nothing — that is the case of a token the API refused
 * while the CLI still thinks it is valid.
 */
export function CliReconnectModal({
  cli,
  label,
  onSignedIn,
  onClose,
}: {
  cli: SubscriptionCli;
  /** « Claude Code », « Codex ». */
  label: string;
  onSignedIn: () => void;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <ModalShell onClose={onClose} width="460px">
      <div className="rrm-head">
        <h2 className="cv-display rrm-title">{t.turnStatus.reconnectTitle(label)}</h2>
        <p className="rrm-sub">{t.availability.cliSignedOutTitle(label)}</p>
      </div>
      <div className="settings-card">
        <AgentSetupRows
          cli={cli}
          label={label}
          signInNow
          onConnected={(_status, cause) => {
            if (cause !== "login") return;
            noteCliSession(cli, true);
            onSignedIn();
          }}
        />
      </div>
      <div className="confirm-footer">
        <span className="akm-foot-spacer" />
        <button type="button" className="btn-ghost btn-inline" onClick={onClose}>
          {t.common.close}
        </button>
      </div>
    </ModalShell>
  );
}
