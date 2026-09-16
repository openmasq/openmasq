import { app } from "electron";
import { HttpMcpServer, makeOAuthProvider, wrapExecMeta } from "@openmasq/mcp/transport";
import type { McpConnection } from "@openmasq/mcp";
import { connectorIdFromInstance, findConnector } from "@openmasq/catalog/mcp";
import {
  getServer,
  loadApiKey,
  loadOAuth,
  loadPort,
  saveOAuth,
  savePort,
  type ServerSpec,
} from "../persist";
import { startLoopback } from "../oauthLoopback";
import { focusMainWindow } from "../focusApp";
import { assertPublicUrl } from "../../net/net";
import { safeOpenExternal } from "../../net/safeOpen";
import {
  connected,
  emitMcpOauthUrl,
  emitNeedsReconnect,
  getAuthChoiceAsker,
  handleConnectorClosed,
  needsReconnect,
  refreshRoutes,
} from "./registry";
import { connectId } from "./connectCancel";
import { REFRESH_NETWORK_ERROR } from "./reconnectRetry";
import { infoFor } from "./info";
import { maybeStoreRemoteIdentity } from "./accounts";
import type { McpServerInfo } from "./types";
import { BRAND, brandUrl } from "@openmasq/branding";

/**
 * A connector using the exec-meta pattern (hundreds of tools behind one `exec {command}`)
 * is DECORATED so the high-value sub-tools are exposed DIRECTLY (small models fail the
 * CLI and loop). The catalog `execMeta.include` is the prefix allow-list. Fail-safe, and a
 * translated call is an ORDINARY callTool through the same gates.
 */
function maybeWrapExecMeta(id: string, server: McpConnection): McpConnection {
  const include = findConnector(connectorIdFromInstance(id))?.execMeta?.include;
  if (!include?.length) return server;
  return wrapExecMeta(server, { include: (n) => include.some((p) => n.startsWith(p)) });
}

// Identity presented to a connector's consent screen via Dynamic Client Registration
// (RFC 7591); a stable `software_id` lets providers recognise the app. `client_name` is
// just the brand, never per-connector.
const OAUTH_CLIENT = {
  name: BRAND.name,
  clientUri: brandUrl("app"),
  logoUri: brandUrl("app", `/email/${BRAND.slug}-mark.png`),
  softwareId: "8a4d2f10-9c3b-4e7a-bf21-5c6e0d7a1b34",
} as const;

const OAUTH_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Connect a REMOTE (http) connector: SSRF-guard the URL, then a static Bearer API key or
 * the OAuth loopback + system-browser consent flow. Fails closed on a private host.
 */
export async function connectRemoteHttp(
  spec: ServerSpec,
  interactive: boolean,
): Promise<McpServerInfo> {
  const id = spec.id;
  if (!spec.url) {
    return { ...infoFor(spec), error: "no URL configured" };
  }

  // SSRF guard: the `url` is renderer-supplied, so before a connection or a bearer, reject
  // an internal host. Fail closed.
  try {
    await assertPublicUrl(spec.url, "mcp-connect");
  } catch (err) {
    return { ...infoFor(spec), error: `URL refusée (hôte interne ou privé): ${(err as Error).message}` };
  }

  // Header-auth API-key connectors: a static bearer (stored encrypted), no OAuth.
  const apiKey = loadApiKey(id);
  if (apiKey) {
    const server = new HttpMcpServer({
      id,
      url: spec.url,
      headers: { Authorization: `Bearer ${apiKey}` },
      onClose: handleConnectorClosed,
    });
    const outcome = await server.connect();
    if (!outcome.authorized) {
      await server.close().catch(() => {});
      return { ...infoFor(spec), error: "clé API refusée" };
    }
    connected.set(id, maybeWrapExecMeta(id, server));
    if (needsReconnect.delete(id)) emitNeedsReconnect();
    await refreshRoutes();
    return infoFor(spec);
  }

  const loop = await startLoopback(loadPort(id), focusMainWindow);
  try {
    // The registered OAuth client is pinned to the redirect URI: keep the port.
    savePort(id, loop.port);
    const provider = makeOAuthProvider({
      redirectUrl: loop.redirectUrl,
      authState: () => loop.state,
      clientName: OAUTH_CLIENT.name,
      clientUri: OAUTH_CLIENT.clientUri,
      logoUri: OAUTH_CLIENT.logoUri,
      softwareId: OAUTH_CLIENT.softwareId,
      softwareVersion: app.getVersion(),
      state: loadOAuth(id),
      persist: (state) => saveOAuth(id, state),
      // Consent opens in the SYSTEM BROWSER: Google blocks OAuth in embedded webviews, and
      // the whole login → SSO → redirect chain must stay in ONE browser session. The
      // loopback catches the redirect. A silent reconnect never prompts. Trade-off: a
      // universal link CAN be grabbed by that vendor's installed desktop app.
      openAuthorization: (url) => {
        if (!interactive) return;
        const s = url.toString();
        // Scheme-gated: a malicious server's `authorization_endpoint` must not hand
        // `file://` or a custom protocol to the OS.
        safeOpenExternal(s);
        // The http(s)-only URL for the renderer's "Copier le lien".
        const cid = connectId();
        if (cid && /^https?:/i.test(s)) emitMcpOauthUrl(cid, s);
      },
    });
    const server = new HttpMcpServer({ id, url: spec.url, authProvider: provider, onClose: handleConnectorClosed });

    let outcome = await server.connect();
    if (!outcome.authorized) {
      // Silent reconnect: never wait for a login. A refresh the NETWORK swallowed is not a
      // lost authorization (`REFRESH_NETWORK_ERROR`); digits dropped so no status sneaks in.
      if (!interactive) {
        await server.close().catch(() => {});
        const error = outcome.networkError
          ? `${REFRESH_NETWORK_ERROR}: ${outcome.networkError.replace(/\d/g, "")}`
          : "authorization required";
        return { ...infoFor(spec), error };
      }
      const code = await loop.waitForCode(OAUTH_TIMEOUT_MS);
      await server.finishAuth(code);
      outcome = await server.connect();
    }
    if (!outcome.authorized) throw new Error("authorization failed");

    // A server allowing an ANONYMOUS initialize never triggers the SDK's login. When it
    // ALSO advertises OAuth, OFFER the choice (signed-in vs anonymous) rather than decide.
    if (interactive && !(await provider.tokens()) && (await server.supportsOAuth())) {
      // No asker (e2e) ⇒ anonymous.
      const asker = getAuthChoiceAsker();
      const choice = asker ? await asker({ id, name: spec.name }) : "anonymous";
      if (choice === "account") {
        // Errors propagate rather than silently falling back: the user asked to sign in.
        const res = await server.authenticate();
        if (res === "REDIRECT") {
          const code = await loop.waitForCode(OAUTH_TIMEOUT_MS);
          await server.finishAuth(code);
          outcome = await server.connect();
        }
      }
    }

    connected.set(id, maybeWrapExecMeta(id, server));
    if (needsReconnect.delete(id)) emitNeedsReconnect();
    // Best-effort: this account's stable identity (dedupe) + a real label.
    await maybeStoreRemoteIdentity(id, spec);
    await refreshRoutes();
    return infoFor(getServer(id) ?? spec);
  } catch (err) {
    // An SDK `OAuthError` from a bare `{error:"invalid_grant"}` has an EMPTY message and
    // only `errorCode`; "" would read as « no error » to `shouldFlagForReconnect`.
    const raw =
      (err instanceof Error && err.message) ||
      (typeof (err as { errorCode?: unknown })?.errorCode === "string" && (err as { errorCode: string }).errorCode) ||
      String(err);
    // A server without dynamic client registration: an actionable message.
    const error = /dynamic client registration/i.test(raw)
      ? "Ce serveur refuse l'inscription OAuth automatique : pas de connexion en un clic. Utilisez son équivalent (jeton) dans « Serveurs locaux »."
      : raw;
    return { ...infoFor(spec), connected: false, authorized: false, error };
  } finally {
    loop.close();
  }
}
