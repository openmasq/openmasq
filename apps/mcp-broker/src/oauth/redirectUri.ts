/**
 * redirect_uri validation. Per RFC 8252 §7.3, native apps use a loopback
 * (127.0.0.1 / ::1 / localhost) redirect on an **ephemeral port** — our desktop
 * client picks a fresh port each login — so loopback URIs are matched ignoring the
 * port. Everything else must match a registered URI EXACTLY (no prefix tricks).
 */

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

function isLoopback(u: URL): boolean {
  return (
    (u.protocol === "http:" || u.protocol === "https:") &&
    LOOPBACK_HOSTS.has(u.hostname)
  );
}

/** Compare two redirect URIs, treating loopback as port-insensitive. */
export function redirectUriMatches(candidate: string, registered: string): boolean {
  let a: URL;
  let b: URL;
  try {
    a = new URL(candidate);
    b = new URL(registered);
  } catch {
    return false;
  }
  if (isLoopback(a) && isLoopback(b)) {
    // Same scheme + host + path; PORT intentionally ignored. Query/hash must be absent.
    return (
      a.protocol === b.protocol &&
      a.hostname === b.hostname &&
      a.pathname === b.pathname &&
      a.search === "" &&
      a.hash === ""
    );
  }
  // Non-loopback: exact string match.
  return candidate === registered;
}

/** True iff `candidate` matches at least one of the client's registered URIs. */
export function isAllowedRedirect(candidate: string, registered: string[]): boolean {
  return registered.some((r) => redirectUriMatches(candidate, r));
}
