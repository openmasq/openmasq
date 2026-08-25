import { useCallback, useRef, useState } from "react";

/** Ce que le bouton « Demander » montre à l'instant présent. */
export type AskState = "idle" | "pending" | "failed";

export const ASK_LABEL: Record<AskState, string> = {
  idle: "Demander",
  pending: "Préparation…",
  failed: "Échec — réessayer",
};

/**
 * L'attente du geste « Demander », parce qu'elle est REELLE et qu'elle ne se voyait pas.
 *
 * Joindre un fichier local, c'est lire ses octets ET l'extraire (OCR compris) : sur un scan
 * de plusieurs pages, plusieurs secondes. Le bouton ne changeait pas d'état pendant ce
 * temps, et l'échec partait dans un `catch` vide — l'utilisateur cliquait, rien ne bougeait,
 * et il recliquait, ce qui relançait l'extraction en parallèle.
 *
 * Deux règles, et elles tiennent l'une à l'autre :
 *  · **un seul geste à la fois** — pendant l'attente, le bouton est inerte, donc un
 *    double-clic ne peut pas doubler le travail ni joindre le fichier deux fois ;
 *  · **une panne se dit** — l'échec reste affiché sur le bouton jusqu'au prochain clic,
 *    plutôt que d'être avalé. Un « réessayer » honnête vaut mieux qu'un silence.
 *
 * Le handler peut rendre `void` (geste synchrone, rien ne change) ou une promesse ; c'est
 * ce qui permet au visualiseur d'ignorer complètement la question.
 */
export function useAskAction(onAsk?: () => void | Promise<unknown>): {
  state: AskState;
  run: () => void;
} {
  const [state, setState] = useState<AskState>("idle");
  // Un ref, pas l'état : deux clics dans le même rendu liraient la même valeur périmée.
  const busy = useRef(false);

  const run = useCallback(() => {
    if (!onAsk || busy.current) return;
    let result: void | Promise<unknown>;
    try {
      result = onAsk();
    } catch {
      setState("failed");
      return;
    }
    if (!(result instanceof Promise)) return; // geste synchrone : rien à attendre
    busy.current = true;
    setState("pending");
    void result.then(
      () => {
        busy.current = false;
        setState("idle");
      },
      () => {
        busy.current = false;
        setState("failed");
      },
    );
  }, [onAsk]);

  return { state, run };
}
