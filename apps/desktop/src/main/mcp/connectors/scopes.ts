/**
 * REQUESTED vs GRANTED OAuth scopes — the pure half, so it can be tested without
 * Electron (the flows around it can't).
 *
 * `run.ts` lists a tool only when its declared `scope` is covered by the
 * connection's scopes — a tool the token can't serve is never offered (the model
 * never learns it exists). C'est ce qui gère une connexion Gmail d'AVANT le
 * 30/07/2026 : elle n'a accordé que `gmail.send`, donc les outils de lecture
 * n'apparaissent qu'après reconnexion. The list that filter reads used to be the
 * user is the one who answers the consent screen, and Google's granular consent
 * lets them untick a scope one by one (a later revocation from their account does
 * the same). We then listed a tool the token couldn't serve, and the failure
 * surfaced mid-conversation as a 403 instead of never being offered.
 *
 * So the token response's own `scope` field is the source of truth when we have it.
 */

/** The authorization server's `scope` field (space-delimited) → a list, or
 *  `undefined` when it said nothing (some providers omit it on a refresh). */
export function parseGrantedScopes(raw: string | undefined): string[] | undefined {
  if (typeof raw !== "string") return undefined;
  const list = raw.split(/\s+/).filter(Boolean);
  return list.length ? list : undefined;
}

/**
 * What the connection may actually do: what was GRANTED, else what was requested
 * for the credential mode.
 *
 * ⚠️ The fallback is not laziness, and it must stay: a connection stored before
 * scopes were captured has none, and a provider that omits `scope` (Slack's token
 * arrives through the auth relay as a bare string, GitHub's device flow likewise)
 * would otherwise lose EVERY scoped tool at once. Falling back to the requested
 * list is exactly today's behaviour — no regression — and the granted list only
 * ever narrows it where the provider tells us it should.
 */
export function effectiveScopes(
  granted: readonly string[] | undefined,
  requested: readonly string[],
): string[] {
  return granted?.length ? [...granted] : [...requested];
}
