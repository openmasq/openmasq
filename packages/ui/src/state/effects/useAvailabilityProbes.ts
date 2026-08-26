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
 * Présence de la CLI Claude Code (fournisseur `claude-cli`) — quelques `access()`
 * côté main, jamais un spawn ; re-sondée au focus (installation en cours de session).
 * `ready` n'est vrai que si le réglage OPT-IN est aussi activé : à l'inverse du probe
 * local, seul un `true` positif OUVRE le modèle (fail-closed — la plupart des
 * machines n'ont pas la CLI, fail-open l'offrirait à tous pour échouer au 1ᵉʳ envoi).
 */
export function useClaudeCliProbe(host: Host, enabled: boolean | undefined) {
  const [claudeCliDetected, setClaudeCliDetected] = useState<boolean | null>(null);
  const claudeCliReady = enabled === true && claudeCliDetected === true;
  const claudeCliReadyRef = useRef<boolean | null>(null);
  claudeCliReadyRef.current = claudeCliReady;
  useEffect(() => {
    if (!host.probeClaudeCli) {
      setClaudeCliDetected(null);
      return;
    }
    let cancelled = false;
    const check = () =>
      host
        .probeClaudeCli!()
        .then((ok) => !cancelled && setClaudeCliDetected(ok))
        .catch(() => !cancelled && setClaudeCliDetected(false));
    void check();
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, [host]);
  return { claudeCliDetected, claudeCliReady, claudeCliReadyRef };
}
