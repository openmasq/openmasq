import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  auth,
  discoverOAuthProtectedResourceMetadata,
  UnauthorizedError,
} from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type { McpConnection, McpToolCall } from "../types";
import { CLIENT_INFO, callToolVia, listToolsVia } from "./wrap";

// A browser-like User-Agent for every request (MCP handshake AND the OAuth
// discovery/registration/token calls the SDK makes). Some authorization servers
// sit behind a bot filter that blocks the default `node`/`undici` UA (Firecrawl's
// `www.firecrawl.dev` returns a hard failure to curl/undici), which would kill the
// login before the browser ever opens. The SDK threads this `fetch` through its
// auth module (`fetchFn`), so one wrapper covers both paths.
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const uaFetch: typeof fetch = (input, init) => {
  const headers = new Headers(init?.headers);
  if (!headers.has("user-agent")) headers.set("User-Agent", BROWSER_UA);
  return fetch(input, { ...init, headers });
};

/** Spec for a remote Streamable-HTTP MCP server (the "connector" model). */
export interface HttpServerSpec {
  id: string;
  url: string;
  /** Static headers (e.g. a bearer for token-based servers). */
  headers?: Record<string, string>;
  /** OAuth provider for connectors that authorise via the provider's own login. */
  authProvider?: OAuthClientProvider;
  /** Called when the underlying transport closes UNEXPECTEDLY (the remote backend
   *  dropped the SSE/stream) — NOT on an intentional {@link HttpMcpServer.close}.
   *  Lets the owner drop the dead connector so nothing keeps probing it (which
   *  otherwise loops "Connection closed"/"Not connected" every reconnect tick). */
  onClose?: (id: string) => void;
}

export type ConnectOutcome =
  /** Connected and ready. */
  | { authorized: true }
  /** OAuth required: `authProvider.redirectToAuthorization` was already invoked.
   *  Capture the redirect code, call {@link HttpMcpServer.finishAuth}, reconnect.
   *  `networkError` is set when a request the SDK made on the way (the token
   *  refresh, typically) never reached its host: the SDK swallows that failure
   *  and falls through to a NEW authorization, so without this flag a laptop
   *  waking up on no network reads exactly like a revoked token. */
  | { authorized: false; networkError?: string };

/** The text of a fetch that never got a response — undici's `TypeError: fetch failed`
 *  carries the socket error as `cause` (`EHOSTUNREACH`, `ENOTFOUND`…), the useful part. */
function networkErrorText(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const cause = err instanceof Error ? (err.cause as { code?: unknown } | undefined)?.code : undefined;
  return typeof cause === "string" ? `${msg} (${cause})` : msg;
}

/**
 * A remote MCP server over Streamable HTTP, with the OAuth connector handshake.
 * Two-phase by design so the host can drive an interactive browser login:
 *
 *   connect() ── needs auth ──▶ { authorized:false }  (browser opened)
 *      ▲                                   │ user consents → redirect ?code=…
 *      └────── finishAuth(code) ◀──────────┘  then connect() again → { authorized:true }
 */
export class HttpMcpServer implements McpConnection {
  readonly id: string;
  private readonly spec: HttpServerSpec;
  private client: Client;
  private transport: StreamableHTTPClientTransport;
  /** Set true by our own {@link close} so the resulting transport-close doesn't
   *  fire `onClose` (which is meant for UNEXPECTED drops only). */
  private closing = false;
  /** The last request that failed at the NETWORK level during the current
   *  {@link connect} — see `ConnectOutcome.networkError`. Reset on every connect. */
  private netError: string | undefined;
  /** Every request the SDK makes (MCP AND the OAuth discovery/refresh calls it
   *  threads through `fetchFn`) passes here, so a fetch that throws is seen once,
   *  whoever asked for it. The error is re-thrown untouched. */
  private readonly fetchImpl: typeof fetch = async (input, init) => {
    try {
      return await uaFetch(input, init);
    } catch (err) {
      this.netError = networkErrorText(err);
      throw err;
    }
  };

  constructor(spec: HttpServerSpec) {
    this.id = spec.id;
    this.spec = spec;
    this.client = new Client(CLIENT_INFO);
    this.wireHandlers();
    this.transport = this.newTransport();
  }

  /** Route the SDK Client's transport-close signal to `spec.onClose` (unless WE
   *  triggered it). The SDK Protocol calls `this.onclose?.()` from its `_onclose`,
   *  so we hook the Client's PUBLIC `onclose` — never `transport.onclose`, which the
   *  SDK owns for its internal routing. Re-wired after `finishAuth` swaps the client. */
  private wireHandlers(): void {
    this.client.onclose = () => {
      if (this.closing) return;
      this.spec.onClose?.(this.id);
    };
  }

  private newTransport(): StreamableHTTPClientTransport {
    return new StreamableHTTPClientTransport(new URL(this.spec.url), {
      authProvider: this.spec.authProvider,
      // `fetch` covers the MCP requests AND (via the SDK's `_fetchWithInit`) the
      // OAuth discovery/registration/token calls — so the browser UA reaches the
      // authorization server too, not just the resource endpoint.
      fetch: this.fetchImpl,
      requestInit: this.spec.headers ? { headers: this.spec.headers } : undefined,
    });
  }

  /** Attempt to connect. Returns `{authorized:false}` when an OAuth login is needed. */
  async connect(): Promise<ConnectOutcome> {
    this.netError = undefined;
    try {
      await this.client.connect(this.transport);
      return { authorized: true };
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return this.netError ? { authorized: false, networkError: this.netError } : { authorized: false };
      }
      throw err;
    }
  }

  /**
   * Proactively start the OAuth login. Needed for servers that allow an
   * ANONYMOUS `initialize` (HTTP 200, no 401) yet still expose RFC 9728
   * protected-resource metadata — e.g. Firecrawl — so `connect()` succeeds
   * WITHOUT a token and the SDK's 401-triggered login never fires. Runs
   * discovery + dynamic client registration, then opens the browser via the
   * authProvider. Returns `"REDIRECT"` (browser opened → capture the code and
   * call {@link finishAuth}, then `connect()` again) or `"AUTHORIZED"` (already
   * had valid tokens). THROWS when the server isn't actually an OAuth resource
   * (no metadata) — the caller should keep the anonymous connection in that case.
   */
  async authenticate(): Promise<"AUTHORIZED" | "REDIRECT"> {
    if (!this.spec.authProvider) return "AUTHORIZED";
    return auth(this.spec.authProvider, { serverUrl: this.spec.url, fetchFn: this.fetchImpl });
  }

  /** Whether this server advertises OAuth (RFC 9728 protected-resource metadata),
   *  i.e. an authenticated login is possible — even if `initialize` also works
   *  anonymously. Lets the host OFFER the choice (account vs anonymous) instead of
   *  silently connecting anonymously. False when the server isn't an OAuth resource. */
  async supportsOAuth(): Promise<boolean> {
    try {
      const meta = await discoverOAuthProtectedResourceMetadata(this.spec.url, {}, this.fetchImpl);
      return !!meta?.authorization_servers?.length;
    } catch {
      return false;
    }
  }

  /** Exchange the authorization code obtained from the redirect, then reconnect. */
  async finishAuth(authorizationCode: string): Promise<void> {
    await this.transport.finishAuth(authorizationCode);
    // The transport that drove the authorization handshake was already started
    // (Client.connect() auto-calls transport.start(), which can run only once),
    // so the post-auth reconnect needs a FRESH client + transport — otherwise the
    // next connect() throws "StreamableHTTPClientTransport already started!". The
    // OAuth tokens now live in the shared authProvider, so the new transport
    // picks them up and connects authorized.
    this.client = new Client(CLIENT_INFO);
    this.wireHandlers();
    this.transport = this.newTransport();
  }

  listTools() {
    return listToolsVia(this.client, this.id);
  }
  callTool(call: McpToolCall) {
    return callToolVia(this.client, call);
  }
  close() {
    this.closing = true;
    return this.client.close();
  }
}

/**
 * Convenience for non-interactive cases (no auth, or tokens already present):
 * connects and returns the ready {@link McpConnection}, throwing if a login is
 * required. For the interactive connector flow use {@link HttpMcpServer} directly.
 */
export async function connectHttp(spec: HttpServerSpec): Promise<McpConnection> {
  const server = new HttpMcpServer(spec);
  const outcome = await server.connect();
  if (!outcome.authorized) {
    throw new UnauthorizedError(
      `MCP server '${spec.id}' requires OAuth — use HttpMcpServer to complete the login.`,
    );
  }
  return server;
}
