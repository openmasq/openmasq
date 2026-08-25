import { useEffect } from "react";
import type { AuthHost } from "../host";

/**
 * Backoff for the auto-reconnect loop, in ms: 3s, 6s, 12s, 24s, then capped at
 * 30s. Pure + exported so `useAuthReconnect.test.ts` pins the schedule directly.
 * `attempt` is 0-based.
 */
export function reconnectDelayMs(attempt: number): number {
  // 2**11 * 3000 already exceeds the cap; clamp the exponent so a long outage
  // can't overflow into NaN/Infinity.
  return Math.min(30_000, 3_000 * 2 ** Math.min(Math.max(attempt, 0), 10));
}

/**
 * Start the retry loop and return a stop function. Kept React-free (no hooks, no
 * DOM) so `useAuthReconnect.test.ts` can drive it with fake timers — the hook
 * below is a thin `useEffect` wrapper. Each tick calls `reconnect()`; whatever it
 * settles to (resolve OR reject), the next attempt is scheduled with a longer
 * delay. The CALLER stops the loop when reconnection succeeds — that signal is the
 * banner clearing (`reconnecting` flipping false), not this loop inspecting a
 * result, because a success surfaces out-of-band via the platform's `onChange`.
 */
export function startReconnectLoop(reconnect: () => Promise<unknown>): () => void {
  let alive = true;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout>;
  const schedule = () => {
    timer = setTimeout(tick, reconnectDelayMs(attempt++));
  };
  const tick = () => {
    Promise.resolve()
      .then(reconnect)
      .catch(() => {})
      .finally(() => {
        if (alive) schedule();
      });
  };
  schedule();
  return () => {
    alive = false;
    clearTimeout(timer);
  };
}

/**
 * ACTIVELY drive reconnection while the offline banner is showing.
 *
 * The banner ("reconnexion automatique en cours…") is set when a token refresh
 * fails against an unreachable auth server. The only PASSIVE recoveries the
 * platform has are the browser `online` event — which fires ONLY on a
 * `navigator.onLine` false→true flip, i.e. when the LOCAL network drops and
 * returns, NEVER when the SERVER is down but the machine is still online — and
 * Supabase's internal refresh timer. So for a server-side outage with a healthy
 * local connection, nothing re-fires and the banner promises a retry that never
 * happens.
 *
 * This closes the gap: while `reconnecting`, it calls `auth.reconnect()` on the
 * backoff above. A success makes the platform emit TOKEN_REFRESHED → `onChange`
 * → `resolveAuthEvent` clears `reconnecting`, which re-runs this effect with
 * `reconnecting:false` and tears the loop down. No-op when the host can't force a
 * refresh (`reconnect` absent — browser preview / mobile): degrade, don't crash.
 */
export function useAuthReconnect(
  auth: AuthHost | undefined,
  reconnecting: boolean,
): void {
  useEffect(() => {
    const doReconnect = auth?.reconnect;
    if (!reconnecting || !doReconnect) return;
    return startReconnectLoop(() => doReconnect.call(auth));
  }, [auth, reconnecting]);
}
