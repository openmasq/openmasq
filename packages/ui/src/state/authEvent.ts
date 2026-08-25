import type { AuthHost, AuthUser } from "../host";

/** What `useAuth` should APPLY in reaction to a live `onChange` event. */
export type AuthResolution =
  | { kind: "set"; user: AuthUser | null; reconnecting: boolean }
  /** We could not verify (getSession threw) — keep the CURRENT user, just flag
   *  reconnecting. Used for a transient outage where even the local check failed. */
  | { kind: "keep"; reconnecting: boolean };

const isOffline = (): boolean =>
  typeof navigator !== "undefined" && !navigator.onLine;

/**
 * Resolve the auth state to apply for a live `onChange` event, OFFLINE-TOLERANT.
 *
 * A truthy user is trusted verbatim (a real sign-in / refresh). A **`null` is
 * NEVER trusted as-is**: at cold start the session may simply not be resolved yet,
 * and a transient auth-server outage (server down / offline — e.g. the local
 * GoTrue at `localhost:8000` unreachable) surfaces a SPURIOUS `SIGNED_OUT`. So a
 * null event RE-VERIFIES via the offline-tolerant `getSession()`, which returns a
 * cached/persisted session when the server is unreachable and `null` ONLY on a
 * genuine, reachable sign-out. This closes the cold-start race where a null event
 * arriving before the initial `getSession()` bounced a signed-in user to the login
 * screen (`userRef` still null ⇒ the old `setUser(null)` short-circuit).
 */
export async function resolveAuthEvent(
  auth: Pick<AuthHost, "getSession">,
  event: AuthUser | null,
): Promise<AuthResolution> {
  if (event) return { kind: "set", user: event, reconnecting: false };
  try {
    const still = await auth.getSession();
    return { kind: "set", user: still, reconnecting: !!still && isOffline() };
  } catch {
    // Can't even check locally → assume transient; keep whatever we hold.
    return { kind: "keep", reconnecting: true };
  }
}
