import { useEffect, useRef, useState } from "react";

/**
 * "The agent is driving the browser RIGHT NOW." Lights up on the first `browser__*`
 * tool-call bump of the turn and STAYS ON for the whole turn — no per-action blink.
 * It clears only a short beat after the turn settles (`streaming` false), so a gap
 * between two browser actions never flickers it off then on. `streaming` should be the
 * app-level "a turn is generating" flag. Feeds both the rail tab's drive halo AND (via
 * `BrowserPanel`) the native drive-halo overlay.
 */
export function useBrowserDriving(
  browserActivity: number,
  hasBrowser: boolean,
  streaming: boolean,
): boolean {
  const [driving, setDriving] = useState(false);
  const grace = useRef<number | undefined>(undefined);
  // A browser tool call → light up (and cancel any pending fade).
  useEffect(() => {
    if (!browserActivity || !hasBrowser) return; // 0 on mount / no desktop browser
    window.clearTimeout(grace.current);
    setDriving(true);
  }, [browserActivity, hasBrowser]);
  // Hold while the turn runs; once it settles, fade out after a short beat so a lull
  // between actions (or between back-to-back turns) doesn't cut then re-light the halo.
  useEffect(() => {
    if (!driving) return;
    if (streaming) {
      window.clearTimeout(grace.current);
      return;
    }
    grace.current = window.setTimeout(() => setDriving(false), 1800);
    return () => window.clearTimeout(grace.current);
  }, [streaming, driving]);
  return driving;
}
