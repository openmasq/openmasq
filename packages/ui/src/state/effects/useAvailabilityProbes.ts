import { useEffect, useRef, useState } from "react";
import type { Host } from "../../host";

/**
 * The two AVAILABILITY probes that the pickers and the send guard read
 * (`send/modelAvailability.ts`), outside `store.ts` (LOC ratchet). Each returns its
 * state AND a ref mirror — `sendMessage` reads the async values via refs, never via
 * closure, so the guard sees EXACTLY what the picker greys out (rule 9).
 */

/**
 * Reachability of the self-hosted endpoint (openai-compat / Ollama): `true` = the
 * server responded, `false` = confirmed failure (the only blocking case — fail-open
 * on the unknown), `null` = not probed. Probed on mount, on address change and on
 * focus (the user may have just started their server).
 */
export function useLocalEndpointProbe(host: Host, openaiCompatBaseUrl: string) {
  const [localEndpointReachable, setLocalEndpointReachable] = useState<boolean | null>(null);
  const localEndpointReachableRef = useRef<boolean | null>(null);
  useEffect(() => {
    const base = openaiCompatBaseUrl.trim();
    const apply = (v: boolean | null) => {
      localEndpointReachableRef.current = v;
      setLocalEndpointReachable(v);
    };
    if (!base || !host.probeLocalEndpoint) {
      apply(null);
      return;
    }
    let cancelled = false;
    const check = () =>
      host
        .probeLocalEndpoint!(base)
        .then((ok) => !cancelled && apply(ok))
        .catch(() => !cancelled && apply(false));
    void check();
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, [openaiCompatBaseUrl, host]);
  return { localEndpointReachable, localEndpointReachableRef };
}

/** The host's CLI probe slots — one per linked subscription CLI. */
type CliProbeSlot = "probeClaudeCli" | "probeCodexCli" | "probeAntigravityCli";

/**
 * The shared core of the CLI probes (claude, codex, antigravity) — one behaviour,
 * three instances: a few `access()` calls on the main side (never a spawn), on mount
 * + on focus (install completed mid-session). `ready` is only true if the OPT-IN
 * setting is ALSO enabled: unlike the local probe, only a positive `true` OPENS the
 * model (fail-closed — most machines don't have the CLI, fail-open would offer it
 * to everyone only to fail on the 1st send). The slot is selected BY NAME for stable
 * effect deps — an arrow recreated on every render would re-run the probe in a loop.
 */
function useCliProbe(host: Host, slot: CliProbeSlot, enabled: boolean | undefined) {
  const [detected, setDetected] = useState<boolean | null>(null);
  const ready = enabled === true && detected === true;
  const readyRef = useRef<boolean | null>(null);
  readyRef.current = ready;
  useEffect(() => {
    const probe = host[slot];
    if (!probe) {
      setDetected(null);
      return;
    }
    let cancelled = false;
    const check = () =>
      probe
        .call(host)
        .then((ok) => !cancelled && setDetected(ok))
        .catch(() => !cancelled && setDetected(false));
    void check();
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, [host, slot]);
  return { detected, ready, readyRef };
}

export function useClaudeCliProbe(host: Host, enabled: boolean | undefined) {
  const { detected, ready, readyRef } = useCliProbe(host, "probeClaudeCli", enabled);
  return { claudeCliDetected: detected, claudeCliReady: ready, claudeCliReadyRef: readyRef };
}

/** Same probe for the Codex CLI (provider `codex-cli`). */
export function useCodexCliProbe(host: Host, enabled: boolean | undefined) {
  const { detected, ready, readyRef } = useCliProbe(host, "probeCodexCli", enabled);
  return { codexCliDetected: detected, codexCliReady: ready, codexCliReadyRef: readyRef };
}

/** Same probe for the Antigravity CLI `agy` (provider `antigravity-cli`). */
export function useAntigravityCliProbe(host: Host, enabled: boolean | undefined) {
  const { detected, ready, readyRef } = useCliProbe(host, "probeAntigravityCli", enabled);
  return {
    antigravityCliDetected: detected,
    antigravityCliReady: ready,
    antigravityCliReadyRef: readyRef,
  };
}

/**
 * DETECTION alone (without the opt-in), for Réglages → Modèles: an agent's badge
 * must be able to say "not found on this machine" BEFORE the setting is enabled.
 * Same probe, same slot, one single core (rule 9) — a second copy would drift.
 * `null` = not probeable here (host without this slot: web preview) or not answered yet.
 */
export function useCliDetected(host: Host, slot: CliProbeSlot) {
  return useCliProbe(host, slot, false).detected;
}
