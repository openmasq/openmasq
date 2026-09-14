import { PROVIDERS } from "@openmasq/llm";
import { useRef } from "react";
import { ModelLogo, Switch } from "../../components/brand";
import { AgentSetupRows, type AgentConnectedCause } from "../Settings/models/AgentSetupRows";
import { useT } from "../../i18n";
import type { AgentOptIn } from "../../hooks/useAgentOptIns";

/**
 * The panel under the « Mon abonnement Claude Code / Codex » card: one row per agent
 * this build can offer, each with the SAME switch as Réglages → Modèles (`AgentAccessModal`)
 * and the same words. The list itself comes from `useAgentOptIns` — the onboarding never
 * decides on its own which CLI exists.
 *
 * ⚠️ The switch stays OFF until the person makes a gesture: the app never consumes a
 * personal subscription on its own. Choosing this card IS that gesture for a CLI already
 * connected (`autoEnable`), and so is signing one in from here — before that, the card
 * could be chosen, the account shown as connected, and « Suivant » clicked with every
 * switch still off: the person then landed in the chat with the free model alone and no
 * idea why their subscription was not there. And a CLI the probe did not find is still
 * offered, with `missingDesc` instead of `onDesc`: the setting is useful the day the tool
 * is installed and signed in, and hiding the row would leave the card promising a path
 * with nothing under it. Under each row, the SAME set-up rows as Réglages → Modèles
 * (`AgentSetupRows`): install here, sign in here — the onboarding is where the person
 * who never opens a terminal meets this choice.
 */
export function KeyChoiceAgents({
  agents,
  autoEnable = false,
}: {
  agents: AgentOptIn[];
  /** The person just CHOSE this card: a CLI already connected on this machine is
   *  switched on for them, once — that click is the explicit gesture. Off when the
   *  card is merely pre-opened on return: a switch they turned off stays off. */
  autoEnable?: boolean;
}) {
  const t = useT();
  const applied = useRef(new Set<AgentOptIn["pid"]>());
  const enableConnected = (a: AgentOptIn, cause: AgentConnectedCause) => {
    if (a.enabled) return;
    // A sign-in run from this screen is its own gesture: the person connected THIS
    // CLI to use it, whichever way the card was opened.
    if (cause !== "login" && (!autoEnable || applied.current.has(a.pid))) return;
    applied.current.add(a.pid);
    a.onEnabled(true);
  };
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
            <AgentSetupRows
              cli={a.cli}
              label={PROVIDERS[a.pid].label}
              onConnected={(_s, cause) => enableConnected(a, cause)}
            />
          </div>
          <Switch checked={a.enabled} onChange={a.onEnabled} />
        </div>
      ))}
      <p className="ob-access-hint">{t.onboarding.keyChoice.agent.hint}</p>
    </div>
  );
}
