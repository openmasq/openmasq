// Signing in to a remote MCP server, from the terminal. This is the answer to "where do the
// credentials live": in ONE encrypted file under `~/.openmasq`, next to a 0600 key — never
// in the agent, never in a config the agent reads, never on the wire back to it.
//
//   openmasq-proxy mcp login notion
//     ├─ a loopback listener on 127.0.0.1 catches the redirect (state-bound, see the
//     │  mechanism's own comment in `@openmasq/mcp/node`)
//     ├─ the system browser opens the provider's consent page (DCR + PKCE, no OAuth app
//     │  for the user to create)
//     └─ the tokens come back and are written encrypted; the proxy reconnects on its own
//        from then on, and the agent never learns any of it.
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { BRAND } from "@openmasq/branding";
import { McpOAuthStore, startLoopback } from "@openmasq/mcp/node";
import { HttpMcpServer, makeOAuthProvider } from "@openmasq/mcp/transport";
import type { OAuthClientProvider } from "@openmasq/mcp/transport";
import type { HttpSpec } from "./servers.js";

/** Everything the proxy persists lives here: the key (0600), the store, the servers file. */
export const openmasqDir = (): string => join(homedir(), ".openmasq");

export const OAUTH_TIMEOUT_MS = 5 * 60_000;

export const createStore = (dir = openmasqDir()): McpOAuthStore =>
  new McpOAuthStore(dir, "mcp-auth.enc", process.env.OPENMASQ_PROXY_KEY ?? "");

/** The page the browser lands on. Plain and self-contained: it is served by a listener that
 *  closes seconds later, so it can fetch nothing. */
const PAGE = `<!doctype html><meta charset="utf-8">
<title>${BRAND.name}</title>
<body style="font:16px/1.6 system-ui,sans-serif;margin:0;display:grid;place-items:center;height:100vh;background:#fbfbfa;color:#05061a">
<div style="text-align:center"><p style="font-size:20px;font-weight:600;margin:0 0 8px">Connecté.</p>
<p style="margin:0;color:#4a4f8c">Vous pouvez fermer cet onglet et revenir au terminal.</p></div>`;

/**
 * Open a URL in the system browser. Scheme-gated: a hostile server's discovered
 * `authorization_endpoint` must not hand `file://` or a custom protocol to the OS.
 */
export function openInBrowser(url: URL, platform = process.platform): boolean {
  if (!/^https?:$/.test(url.protocol)) return false;
  const cmd =
    platform === "darwin"
      ? ["open"]
      : platform === "win32"
        ? ["cmd", "/c", "start", ""]
        : ["xdg-open"];
  try {
    spawn(cmd[0], [...cmd.slice(1), url.toString()], { stdio: "ignore", detached: true }).unref();
    return true;
  } catch {
    return false;
  }
}

export interface AuthDeps {
  store: McpOAuthStore;
  /** Say what is happening — a browser is about to open, and the URL if it did not. */
  note: (text: string, tone?: "info" | "warn" | "ok") => void;
  open?: (url: URL) => boolean;
  timeoutMs?: number;
}

/** The provider bound to one server's stored state. Used by the login flow AND by the
 *  reconnect at startup, so both refresh into the same file. */
export function providerFor(
  id: string,
  redirectUrl: string,
  authState: () => string,
  deps: AuthDeps,
  version: string,
  /** A pre-registered client, when the provider will not issue one (see `HttpSpec`). */
  client?: { clientId?: string; clientSecret?: string; scopes?: string },
): OAuthClientProvider {
  const open = deps.open ?? openInBrowser;
  const stored = deps.store.loadOAuth(id);
  // A declared client id SEEDS the registration slot, which is what makes the SDK skip
  // registration entirely. It wins over whatever a previous run registered: the user edited
  // the config precisely to change it.
  const state = client?.clientId
    ? {
        ...stored,
        clientInformation: {
          client_id: client.clientId,
          ...(client.clientSecret ? { client_secret: client.clientSecret } : {}),
          redirect_uris: [redirectUrl],
        } as never,
      }
    : stored;
  return makeOAuthProvider({
    redirectUrl,
    authState,
    clientName: `${BRAND.name} proxy`,
    clientUri: `https://${BRAND.domain}`,
    softwareId: "openmasq-proxy",
    softwareVersion: version,
    ...(client?.scopes ? { scope: client.scopes } : {}),
    state,
    persist: (state) => deps.store.saveOAuth(id, state),
    openAuthorization: (url) => {
      if (!open(url)) deps.note(`open this in a browser to continue:\n  ${url.toString()}`, "warn");
    },
  });
}

/**
 * Sign in to `spec`. Returns when the tokens are stored, throws with a reason otherwise.
 * The listener is closed in every path — a redirect catcher that outlives its flow is the
 * long-lived endpoint the `state` binding exists to defend.
 */
export async function loginTo(spec: HttpSpec, deps: AuthDeps, version: string): Promise<void> {
  const stored = deps.store.loadPort(spec.id);
  const loop = await startLoopback({ page: PAGE, ...(stored ? { port: stored } : {}) });
  deps.store.savePort(spec.id, loop.port);
  const server = new HttpMcpServer({
    id: spec.id,
    url: spec.url,
    headers: spec.headers,
    authProvider: providerFor(spec.id, loop.redirectUrl, () => loop.state, deps, version, spec),
  });
  try {
    let outcome = await server.connect();
    if (!outcome.authorized) {
      deps.note("waiting for the consent page…");
      await server.finishAuth(await loop.waitForCode(deps.timeoutMs ?? OAUTH_TIMEOUT_MS));
      outcome = await server.connect();
      if (!outcome.authorized) throw new Error("the provider did not grant access");
    }
    const tools = await server.listTools();
    deps.note(`${spec.id}: signed in — ${tools.length} tool(s) available`, "ok");
  } finally {
    loop.close();
    await server.close().catch(() => {});
  }
}
