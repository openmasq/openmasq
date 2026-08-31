import { useCallback, useRef, useState } from "react";

/** What the « Demander » button shows at the present instant. */
export type AskState = "idle" | "pending" | "failed";

export const ASK_LABEL: Record<AskState, string> = {
  idle: "Demander",
  pending: "Préparation…",
  failed: "Échec — réessayer",
};

/**
 * The wait for the « Demander » gesture, because it is REAL and it wasn't visible.
 *
 * Attaching a local file means reading its bytes AND extracting it (OCR included): on a
 * multi-page scan, several seconds. The button didn't change state during that
 * time, and the failure was swallowed by an empty `catch` — the user clicked, nothing moved,
 * and they clicked again, which restarted the extraction in parallel.
 *
 * Two rules, and they hold each other up:
 *  · **only one gesture at a time** — during the wait, the button is inert, so a
 *    double-click can't double the work nor attach the file twice;
 *  · **a failure is said out loud** — the failure stays shown on the button until the next click,
 *    rather than being swallowed. An honest « retry » beats silence.
 *
 * The handler may return `void` (synchronous gesture, nothing changes) or a promise; that's
 * what lets the viewer completely ignore the question.
 */
export function useAskAction(onAsk?: () => void | Promise<unknown>): {
  state: AskState;
  run: () => void;
} {
  const [state, setState] = useState<AskState>("idle");
  // A ref, not state: two clicks in the same render would read the same stale value.
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
    if (!(result instanceof Promise)) return; // synchronous gesture: nothing to wait for
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
