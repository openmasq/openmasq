import { useEffect, useRef, useState } from "react";
import type { Host } from "../../host";

/**
 * Les deux sondes de DISPONIBILITÉ que les sélecteurs et la garde d'envoi lisent
 * (`send/modelAvailability.ts`), hors de `store.ts` (ratchet LOC). Chacune rend son
 * état ET un miroir ref — `sendMessage` lit l'async par refs, jamais par closure,
 * pour que la garde voie EXACTEMENT ce que le sélecteur grise (règle 9).
 */

/**
 * Joignabilité du endpoint auto-hébergé (openai-compat / Ollama) : `true` = le
 * serveur a répondu, `false` = échec confirmé (seul cas bloquant — fail-open sur
 * l'inconnu), `null` = pas sondé. Sondée au montage, au changement d'adresse et au
 * focus (l'utilisateur vient peut-être de démarrer son serveur).
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

/**
 * Le cœur partagé des sondes CLI (claude, gemini) — un seul comportement, deux
 * instances : quelques `access()` côté main (jamais un spawn), au montage + au focus
 * (installation en cours de session). `ready` n'est vrai que si le réglage OPT-IN est
 * aussi activé : à l'inverse du probe local, seul un `true` positif OUVRE le modèle
 * (fail-closed — la plupart des machines n'ont pas la CLI, fail-open l'offrirait à
 * tous pour échouer au 1ᵉʳ envoi). Le créneau est sélectionné PAR NOM pour des deps
 * d'effet stables — une flèche recréée à chaque rendu referait la sonde en boucle.
 */
function useCliProbe(
  host: Host,
  slot: "probeClaudeCli" | "probeCodexCli",
  enabled: boolean | undefined,
) {
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

/** Même sonde pour la CLI Codex (fournisseur `codex-cli`). */
export function useCodexCliProbe(host: Host, enabled: boolean | undefined) {
  const { detected, ready, readyRef } = useCliProbe(host, "probeCodexCli", enabled);
  return { codexCliDetected: detected, codexCliReady: ready, codexCliReadyRef: readyRef };
}
