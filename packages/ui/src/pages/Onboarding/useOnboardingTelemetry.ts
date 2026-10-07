import { useEffect, useRef, useState } from "react";
import { captureEvent } from "../../analytics";
import type { AgentOptIn } from "../../hooks/useAgentOptIns";

/**
 * What the onboarding tells PostHog beyond `onboarding { step }` — which only said where
 * it ENDED:
 *  - `onboarding_step`, once per screen shown, so the funnel 1 → 2 → 3 can be drawn;
 *  - `agent_detected`, once per agent when its probe answers: the share of people who
 *    HAVE Claude Code or Codex, whether or not they switch it on here;
 *  - `choices()`, the access the person left with, stamped by the caller on `done` AND on
 *    every skip — an agent wins over a key (it is the one they will use). Ids only: the
 *    key itself never reaches the onboarding.
 */
export function useOnboardingTelemetry({
  step,
  rules,
  agents,
  keyConfigured,
  onConnectOpenRouter,
}: {
  step: number;
  rules: boolean;
  agents: AgentOptIn[];
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
      access: enabled.length ? ("agent" as const) : keys.length ? ("key" as const) : ("none" as const),
      agents: enabled.join(",") || "none",
      key_providers: keys.join(",") || "none",
      openrouter_oauth: openRouterOAuth,
      tuned,
    };
  }

  return { choices, connectOpenRouter, markTuned: () => setTuned(true) };
}
