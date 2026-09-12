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

/**
 * A metadata hop we are willing to make. The chain below follows a URL the QUERIED SERVER
 * chose (`authorization_servers` is its answer, not our input), so an unfriendly endpoint can
 * name any address it likes and have this process fetch it — a request from inside the
 * machine, to wherever it points. Two bounds, both refusals rather than repairs:
 *
 *   • HTTPS only — an authorization server is https by definition, and http invites a
 *     downgrade to something on the local network;
 *   • never a LITERAL address, and never a name that resolves to nothing but this machine.
 *     A public authorization server is a NAME; a bare IP (`169.254.169.254`, `10.0.0.5`,
 *     `[::1]`) is the shape of an internal target and has no business in this chain.
 *
 * A resolved-name rebinding is beyond what a metadata probe can defend (it would need the
 * resolution pinned through the fetch); what is closed here is the direct pivot.
 */
export function probeUrlAllowed(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  // An IPv4 or IPv6 LITERAL — no public authorization server is addressed by one.
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(":")) return false;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;
  return host.includes(".");
}

async function json(
  url: string,
  fetchFn: typeof fetch,
): Promise<Record<string, unknown> | undefined> {
  if (!probeUrlAllowed(url)) return undefined;
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
