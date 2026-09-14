/**
 * Which sign-in providers the auth server OFFERS — read from its public settings
 * (`GET /auth/v1/settings`, `external.<provider>`), the one place that knows.
 *
 * Measured 14/09/2026 on the production project: the Google flow (`auth.ts`
 * `signInWithGoogle`) is wired end to end, and the server answers every attempt with
 * « provider is not enabled ». The login screen drew a live button over that refusal.
 * It asks here first: `false` greys the button with a word underneath; `null`
 * (unreachable, malformed) is no verdict and changes nothing.
 *
 * A plain `fetch`, not the session client's `authAwareFetch`: this request says
 * nothing about a session, and must not move the reachability verdict either way.
 */
export async function googleProviderEnabled(authOrigin: string, apikey: string): Promise<boolean | null> {
  try {
    const r = await fetch(`${authOrigin}/auth/v1/settings`, { headers: { apikey } });
    if (!r.ok) return null;
    const j = (await r.json()) as { external?: Record<string, unknown> };
    return typeof j.external?.google === "boolean" ? j.external.google : null;
  } catch {
    return null;
  }
}
