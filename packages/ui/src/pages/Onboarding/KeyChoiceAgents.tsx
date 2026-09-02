import { ModelLogo, Switch } from "../../components/brand";
import { useT } from "../../i18n";
import type { AgentOptIn } from "../../hooks/useAgentOptIns";

/**
 * The panel under the « Mon abonnement Claude Code / Codex » card: one row per agent
 * this build can offer, each with the SAME switch as Réglages → Modèles (`AgentAccessModal`)
 * and the same words. The list itself comes from `useAgentOptIns` — the onboarding never
 * decides on its own which CLI exists.
 *
 * ⚠️ The switch stays OFF until the person flips it: the app never consumes a personal
 * subscription without an explicit gesture. And a CLI the probe did not find is still
 * offered, with `missingDesc` instead of `onDesc`: the setting is useful the day the tool
 * is installed and signed in, and hiding the row would leave the card promising a path
 * with nothing under it.
 */
export function KeyChoiceAgents({ agents }: { agents: AgentOptIn[] }) {
  const t = useT();
  return (
    <div className="ob-access-key ob-access-agents">
      {agents.map((a) => (
        <div key={a.pid} className={`ob-access-agent${a.detected === false ? " missing" : ""}`}>
          <ModelLogo provider={a.pid} size={18} />
          <div className="ob-access-agent-body">
            <div className="ob-access-agent-title">{a.copy.rowTitle}</div>
            <div className="ob-access-agent-desc">
              {a.detected === false ? a.copy.missingDesc : a.copy.onDesc}
            </div>
          </div>
          <Switch checked={a.enabled} onChange={a.onEnabled} />
        </div>
      ))}
      <p className="ob-access-hint">{t.onboarding.keyChoice.agent.hint}</p>
    </div>
  );
}
