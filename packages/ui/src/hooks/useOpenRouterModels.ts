import { useEffect, useState } from "react";
import { setDynamicModels } from "@openmasq/llm";
import { useHost } from "../host";

/**
 * On mount, fetch OpenRouter's LIVE model catalogue (via `host.models`, which runs the
 * fetch in main) and merge it over the static registry with `setDynamicModels`. This is
 * what keeps the OpenRouter list from drifting — a renamed/gated slug disappears and a
 * new model appears without a code change.
 *
 * DEGRADE, never fail (root rule): absent slot, a throw, or an EMPTY result leaves the
 * hard-coded OpenRouter baseline untouched (offline / preview fallback). Runs once; the
 * catalogue changes on OpenRouter's timescale, not the session's.
 *
 * `setDynamicModels` mutates module state, so this hook bumps its own `applied` counter
 * on success to re-render the subtree that reads the model list (mount it high — the
 * app shell). The counter is returned mostly so callers/tests can observe completion.
 */
export function useOpenRouterModels(): number {
  const host = useHost();
  const [applied, setApplied] = useState(0);
  useEffect(() => {
    const list = host.models?.listOpenRouter;
    if (!list) return;
    let alive = true;
    list
      .call(host.models)
      .then((models) => {
        // Guard on a NON-EMPTY result: replacing the baseline with [] would wipe the
        // OpenRouter group entirely on a transient hiccup (fail-open UX). Keep the
        // baseline instead.
        if (!alive || !models?.length) return;
        setDynamicModels("openrouter", models);
        setApplied((n) => n + 1);
      })
      .catch(() => {
        /* keep the static baseline — DEGRADE, never fail */
      });
    return () => {
      alive = false;
    };
  }, [host]);
  return applied;
}
