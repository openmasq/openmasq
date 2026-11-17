import { useEffect, useRef, useState } from "react";
import { captureEvent } from "../../analytics";
import type { AgentOptIn } from "../../hooks/useAgentOptIns";
import type { ModelAccess } from "../../state/auth/modelAccess";

/**
 * What the onboarding tells PostHog beyond `onboarding { step }` — which only said where
 * it ENDED:
 *  - `onboarding_step`, once per screen shown, so the funnel 1 → 2 → 3 can be drawn;
 *  - `agent_detected`, once per agent when its probe answers: the share of people who
 *    HAVE Claude Code or Codex, whether or not they switch it on here;
 *  - `onboarding_blocked`, each press of « Suivant » with no road to a model: the step
 *    cannot be left without one, so this is where a person without access stops — with
 *    the agents switched on and the ones found, so the cause can be told apart;
 *  - `choices()`, the access the person left with (`modelAccess`, the gate's own verdict),
 *    stamped by the caller on `done` AND on every skip. Ids only: the key itself never
 *    reaches the onboarding.
 */
export function useOnboardingTelemetry({
  step,
  rules,
  agents,
  access,
  keyConfigured,
  onConnectOpenRouter,
}: {
  step: number;
  rules: boolean;
  agents: AgentOptIn[];
  access: ModelAccess;
  keyConfigured?: ReadonlySet<string>;
  onConnectOpenRouter?: () => Promise<boolean>;
}) {
  const [tuned, setTuned] = useState(false);
  const [openRouterOAuth, setOpenRouterOAuth] = useState(false);

  useEffect(() => {
    captureEvent({ name: "onboarding_step", step: rules ? "regler" : String(step + 1) });
  }, [step, rules]);

  // The probes re-run on window focus: each agent is counted once, on its first answer.
  const reported = useRef(new Set<string>());
  const probed = agents.map((a) => `${a.cli}:${a.detected}`).join(",");
  useEffect(() => {
    for (const a of agents) {
      if (a.detected === null || reported.current.has(a.cli)) continue;
      reported.current.add(a.cli);
      captureEvent({ name: "agent_detected", agent: a.cli, found: a.detected });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [probed]);

  const connectOpenRouter =
    onConnectOpenRouter &&
    (async () => {
      const ok = await onConnectOpenRouter();
      if (ok) setOpenRouterOAuth(true);
      return ok;
    });

  function choices() {
    const enabled = agents.filter((a) => a.enabled).map((a) => a.cli);
    const keys = [...(keyConfigured ?? [])].sort();
    return {
      access,
      agents: enabled.join(",") || "none",
      key_providers: keys.join(",") || "none",
      openrouter_oauth: openRouterOAuth,
      tuned,
    };
  }

  const blocked = () =>
    captureEvent({
      name: "onboarding_blocked",
      agents: agents.filter((a) => a.enabled).map((a) => a.cli).join(",") || "none",
      detected: agents.filter((a) => a.detected).map((a) => a.cli).join(",") || "none",
    });

  return { choices, connectOpenRouter, blocked, markTuned: () => setTuned(true) };
}
