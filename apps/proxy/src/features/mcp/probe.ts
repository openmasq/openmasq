// What a remote MCP server actually requires, asked of the server itself. The wizard uses it
// so it only demands a client id from the providers that have no way of issuing one: most
// remote servers register a client on the fly (RFC 7591) and need nothing from the user,
// while Google's endpoints point at `accounts.google.com`, which has no registration
// endpoint at all — measured, not assumed.
//
// Every request here is a plain public GET of metadata. Nothing is sent, nothing is stored.

export interface Probe {
  /** The server answered as an MCP endpoint at all. */
  reachable: boolean;
  /** RFC 7591: the authorization server will register a client for us ⇒ nothing to ask. */
  dynamicRegistration: boolean;
  /** The authorization server the resource points at, when it says. */
  authorizationServer?: string;
  /** Scopes the resource advertises — a good default to offer. */
  scopes: string[];
  /** Why we could not tell, when we could not. Never a URL we were not given. */
  note?: string;
}

const TIMEOUT_MS = 8000;

async function json(
  url: string,
  fetchFn: typeof fetch,
): Promise<Record<string, unknown> | undefined> {
  try {
    const res = await fetchFn(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: "application/json" },
    });
    if (!res.ok) return undefined;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

const asStrings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

/**
 * Follow the discovery chain the MCP spec defines: the RESOURCE metadata sits beside the
 * endpoint's own path (RFC 9728 puts it under `/.well-known/oauth-protected-resource<path>`),
 * and names the authorization server; the AS metadata then says whether it registers clients.
 * Either hop may be absent — a server with no OAuth at all answers nothing, which is fine.
 */
export async function probeServer(url: string, fetchFn: typeof fetch = fetch): Promise<Probe> {
  let origin: string;
  let path: string;
  try {
    const u = new URL(url);
    origin = u.origin;
    path = u.pathname.replace(/\/$/, "");
  } catch {
    return { reachable: false, dynamicRegistration: false, scopes: [], note: "not a URL" };
  }

  const resource =
    (await json(`${origin}/.well-known/oauth-protected-resource${path}`, fetchFn)) ??
    (await json(`${origin}/.well-known/oauth-protected-resource`, fetchFn));
  const as = asStrings(resource?.authorization_servers)[0];
  const scopes = asStrings(resource?.scopes_supported);

  // No resource metadata ⇒ ask the origin directly; plenty of servers publish only that.
  const meta =
    (as
      ? await json(`${as.replace(/\/$/, "")}/.well-known/openid-configuration`, fetchFn)
      : undefined) ??
    (as
      ? await json(`${as.replace(/\/$/, "")}/.well-known/oauth-authorization-server`, fetchFn)
      : undefined) ??
    (await json(`${origin}/.well-known/oauth-authorization-server`, fetchFn));

  if (!resource && !meta)
    return {
      reachable: false,
      dynamicRegistration: false,
      scopes: [],
      note: "it published no OAuth metadata — it may need no login, or a static header",
    };

  return {
    reachable: true,
    dynamicRegistration: typeof meta?.registration_endpoint === "string",
    ...(as ? { authorizationServer: as } : {}),
    scopes,
  };
}
