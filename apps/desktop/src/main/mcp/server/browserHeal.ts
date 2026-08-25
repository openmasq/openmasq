/**
 * Pure staleness rule for the browser connector's self-heal (`connect.ts`
 * `ensureBrowserConnLive`), kept Electron-free so it's unit-testable: the
 * @playwright/mcp child reads its CDP endpoint from env ONCE at spawn, so its
 * connection is STALE when the agent-browser child is gone, or runs on a DIFFERENT
 * endpoint than the one pwmcp was spawned against (each spawn mints a new port +
 * broker secret).
 */
export function browserConnStale(
  running: boolean,
  currentEndpoint: string | null,
  connectedEndpoint: string | null,
): boolean {
  return !running || !currentEndpoint || currentEndpoint !== connectedEndpoint;
}

/**
 * A browser-tool failure a fresh RECONNECT can recover from — as opposed to a genuine
 * tool error (a blocked navigation, a strict-mode locator, a 404) that a reconnect would
 * only repeat. Two families:
 *  - **Lost page / closed target** — the endpoint is still current (so the pre-dispatch
 *    staleness heal doesn't fire), but @playwright/mcp's page went away.
 *  - **`Target.createTarget: Not supported`** — Electron's CDP can't CREATE a page and
 *    doesn't emit `targetCreated` for a tab opened AFTER pwmcp connected; a connect-time
 *    race can leave pwmcp seeing ZERO tabs, so `browser_navigate` tries to create one and
 *    Electron refuses. A fresh connect re-enumerates the browser's live tabs (there is
 *    always ≥1), so the retried call navigates an existing tab instead of creating one.
 * Pure + unit-tested.
 */
export function isRecoverableBrowserError(message: string): boolean {
  return /Target\.createTarget|Target closed|Target page, context or browser has been closed|has been closed|Session closed/i.test(
    message,
  );
}
