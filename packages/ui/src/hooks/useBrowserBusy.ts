import { useEffect, useState } from "react";

/**
 * The agent-browser "activity" signal, extracted from `AppShell`. When the AGENT starts
 * driving the browser (`browserActivity` bumps per `browser__*` tool call) while the panel
 * is CLOSED, we DON'T auto-open the split + native window (intrusive during a plain web
 * search) — instead we flag it (a pulsing dot on the toggle) so the user opens it when THEY
 * want. Opening the panel clears the flag (they're now watching it live).
 *
 * `browserActivity` is a monotonic NONCE; the flag is only raised on a new bump AND only when
 * a browser exists. `browserOpen` is read fresh on each bump (NOT a dep of the raise effect),
 * so a bump while already open never flags — mirroring the original inline effects exactly.
 */
export function useBrowserBusy(
  browserActivity: number,
  hasBrowser: boolean,
  browserOpen: boolean,
): boolean {
  const [browserBusy, setBrowserBusy] = useState(false);
  useEffect(() => {
    if (!browserActivity || !hasBrowser) return; // 0 on mount / no desktop browser
    if (!browserOpen) setBrowserBusy(true);
    // Reacts to the activity NONCE only — `browserOpen` is read fresh each bump, not a dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [browserActivity, hasBrowser]);
  useEffect(() => {
    if (browserOpen) setBrowserBusy(false);
  }, [browserOpen]);
  return browserBusy;
}
