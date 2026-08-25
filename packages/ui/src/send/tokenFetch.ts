/**
 * The platform-send token fetch, HANG-GUARDED. `getAccessToken()` may trigger a
 * Supabase token refresh, and with the auth server unreachable that refresh
 * retry-storms behind supabase's internal auth lock — an un-capped `await` froze the
 * whole send (« rien ne se passe »), and every retry send queued behind the same lock.
 *
 * The cap lives HERE (not in the auth host) on purpose: only the race can tell a
 * TIMEOUT (« le serveur de connexion ne répond pas ») apart from a SETTLED null
 * (genuinely signed out) — a cap inside `getAccessToken` would surface both as null
 * and the send would show the wrong message. Pure; the caller owns the copy per case.
 */

export type PlatformTokenResult =
  | { ok: true; token: string }
  /** `none` = the fetch SETTLED null: genuinely no session (signed out). `timeout` = the
   *  auth server didn't answer inside the cap. `error` = it answered by FAILING (network
   *  refused, DNS, a 5xx surfaced as a throw) — an OUTAGE that fails fast instead of
   *  hanging. `error` and `timeout` are the same user truth (« le serveur ne répond
   *  pas ») and MUST get the same copy; collapsing `error` into `none` is how a user
   *  with a paid plan got told to « prendre un abonnement » because their wifi dropped. */
  | { ok: false; reason: "none" | "timeout" | "error" };

export const PLATFORM_TOKEN_TIMEOUT_MS = 5000;

/** One capped attempt at `getToken()`. */
async function attempt(
  getToken: () => Promise<string | null>,
  timeoutMs: number,
): Promise<PlatformTokenResult> {
  const TIMEOUT = Symbol("timeout");
  const FAILED = Symbol("failed");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const raced = await Promise.race([
      getToken().catch(() => FAILED),
      new Promise<typeof TIMEOUT>((resolve) => {
        timer = setTimeout(() => resolve(TIMEOUT), timeoutMs);
      }),
    ]);
    if (typeof raced === "symbol") {
      return raced === TIMEOUT ? { ok: false, reason: "timeout" } : { ok: false, reason: "error" };
    }
    return raced ? { ok: true, token: raced } : { ok: false, reason: "none" };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchPlatformToken(
  getToken: (() => Promise<string | null>) | undefined,
  opts: {
    timeoutMs?: number;
    /** `host.auth.reconnect` — forces a session refresh NOW. */
    reconnect?: () => Promise<unknown>;
  } = {},
): Promise<PlatformTokenResult> {
  if (!getToken) return { ok: false, reason: "none" };
  const { timeoutMs = PLATFORM_TOKEN_TIMEOUT_MS, reconnect } = opts;
  const first = await attempt(getToken, timeoutMs);
  // A token we can't get is not necessarily a session we don't have. After the auth
  // server came back from an outage NOTHING re-drives a refresh on its own: the passive
  // signals don't fire (the machine was never offline), and the active reconnect loop
  // (`state/useAuthReconnect.ts`) only runs while `useAuth` flagged `reconnecting` —
  // which needs a THROWN getSession, not the settled null this path sees. So the app sat
  // « session pas connectée » until an app RELOAD re-created the client. Force ONE
  // refresh here and re-ask, which is what makes « Réessayer » work the moment the
  // server is back.
  //
  // Deliberately NOT on `timeout`: a server that just failed to answer for the full cap
  // won't answer a refresh either, and the user would wait 2× the cap to be told the same
  // thing. `none` (we look signed out) and `error` (a FAST failure) are the two worth one
  // more round-trip.
  if (first.ok || !reconnect || first.reason === "timeout") return first;
  const back = await attempt(async () => ((await reconnect()) ? "ok" : null), timeoutMs);
  // Still down, or genuinely signed out → the FIRST verdict stands (it is the one whose
  // copy the caller already reasoned about).
  if (!back.ok) return first;
  return attempt(getToken, timeoutMs);
}
