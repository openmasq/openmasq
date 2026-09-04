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
 * If this connector uses the exec-meta pattern (PostHog — its ~280 tools sit behind
 * one `exec {command}` CLI), DECORATE the connection so the high-value sub-tools are
 * exposed DIRECTLY (`wrapExecMeta`) — small models fail the CLI and loop. The catalog
 * `execMeta.include` is the prefix allow-list; the long tail stays behind raw `exec`.
 * No-op for every other connector, and fail-safe (a decoration failure degrades to
 * the raw connection inside `wrapExecMeta`). Nothing about the write gate / redaction
 * changes: a translated call is an ORDINARY callTool through the same pipeline.
 */
function maybeWrapExecMeta(id: string, server: McpConnection): McpConnection {
  const include = findConnector(connectorIdFromInstance(id))?.execMeta?.include;
  if (!include?.length) return server;
  return wrapExecMeta(server, { include: (n) => include.some((p) => n.startsWith(p)) });
}

// Identity presented to a connector's OAuth consent screen via Dynamic Client
// Registration (RFC 7591). Providers render `client_name`/`logo_uri` and a stable
// `software_id` lets them recognise the app instead of labelling it an anonymous
// "self-hosted" client — though a provider MAY still hard-label unverified DCR
// clients regardless (only a provider-verified app fully removes that). The
// `client_name` is deliberately just the brand (not per-connector) so the consent
// screen reads the brand name alone, never "<brand> (…)".
const OAUTH_CLIENT = {
  name: BRAND.name,
  clientUri: brandUrl("app"),
  logoUri: brandUrl("app", `/email/${BRAND.slug}-mark.png`),
  softwareId: "8a4d2f10-9c3b-4e7a-bf21-5c6e0d7a1b34",
} as const;

const OAUTH_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Connect a REMOTE (http) connector: SSRF-guard the URL, then either a static
 * Bearer-header API-key connect, or the OAuth loopback + system-browser consent flow.
 * The stdio/local-oauth/browser kinds are dispatched BEFORE this (see `connectServer`);
 * this is only the remote-http path. Fails closed on an internal/private host.
 */
export async function connectRemoteHttp(
  spec: ServerSpec,
  interactive: boolean,
): Promise<McpServerInfo> {
  const id = spec.id;
  if (!spec.url) {
    return { ...infoFor(spec), error: "no URL configured" };
  }

  // SSRF guard (audit M3): a remote MCP `url` is renderer-supplied (`mcp:add` /
  // `mcp:add-account-remote`), so before main opens an HTTP/SSE JSON-RPC connection to it
  // — or attaches an OAuth bearer — reject an internal/LAN/cloud-metadata/loopback host.
  // Fail closed. (Local servers use the stdio/in-process path, not a remote http URL.)
  try {
    await assertPublicUrl(spec.url, "mcp-connect");
  } catch (err) {
    return { ...infoFor(spec), error: `URL refusée (hôte interne ou privé): ${(err as Error).message}` };
  }

  // Header-auth API-key connectors (e.g. Fireflies): no OAuth/loopback — connect
  // with a static `Authorization: Bearer <key>` header (the key is stored encrypted).
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
    // Remember the bound port so the next connect reuses the same redirect URI
    // (the registered OAuth client is pinned to it).
    savePort(id, loop.port);
    const provider = makeOAuthProvider({
      redirectUrl: loop.redirectUrl,
      clientName: OAUTH_CLIENT.name,
      clientUri: OAUTH_CLIENT.clientUri,
      logoUri: OAUTH_CLIENT.logoUri,
      softwareId: OAUTH_CLIENT.softwareId,
      softwareVersion: app.getVersion(),
      state: loadOAuth(id),
      persist: (state) => saveOAuth(id, state),
      // Open consent in the SYSTEM BROWSER, not an embedded Electron window: many
      // provider login pages offer "Continuer avec Google" (or another SSO IdP), and
      // Google blocks OAuth in embedded webviews (`disallowed_useragent` →
      // "navigateur non sécurisé"). The whole chain (provider login → SSO → redirect)
      // must stay in ONE browser session or the pending authorization request is
      // lost, so it can't be split; the 127.0.0.1 loopback catches the redirect from
      // the system browser. A silent (startup) reconnect never prompts. (Trade-off:
      // on macOS a provider URL that is a universal link CAN be grabbed by that
      // vendor's installed desktop app — rare, and the lesser evil vs. Google
      // refusing every SSO login in the webview.)
      openAuthorization: (url) => {
        if (!interactive) return;
        const s = url.toString();
        // Scheme-gated (audit M3): a malicious server's discovered `authorization_endpoint`
        // must not hand `file://`/a custom protocol to the OS via raw shell.openExternal.
        safeOpenExternal(s);
        // Surface the (http(s)-only) authorize URL to the renderer's "Copier le lien"; the
        // scheme guard above is what bounds what we open AND emit — a bad scheme does neither.
        const cid = connectId();
        if (cid && /^https?:/i.test(s)) emitMcpOauthUrl(cid, s);
      },
    });
    const server = new HttpMcpServer({ id, url: spec.url, authProvider: provider, onClose: handleConnectorClosed });

    let outcome = await server.connect();
    if (!outcome.authorized) {
      // Silent reconnect: don't wait for a login that will never come. A refresh the
      // NETWORK swallowed is not a lost authorization — say so, so the retry keeps it
      // off the banner (`REFRESH_NETWORK_ERROR`); the cause is a socket code, never a
      // token or a URL, and digits are dropped so no status code can sneak in.
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

    // Firecrawl-style servers allow an ANONYMOUS initialize (200, no 401), so the
    // SDK's 401-triggered login never fires — connect() succeeds WITHOUT a token,
    // silently anonymous. When the server ALSO advertises OAuth, OFFER the choice
    // (act as the signed-in user, with real credits/scope, vs anonymous) rather
    // than deciding for the user. Only when interactive + no token yet.
    if (interactive && !(await provider.tokens()) && (await server.supportsOAuth())) {
      // Ask the renderer (styled in-app modal). No asker (e.g. e2e) ⇒ anonymous.
      const asker = getAuthChoiceAsker();
      const choice = asker ? await asker({ id, name: spec.name }) : "anonymous";
      if (choice === "account") {
        // Chosen authenticated: drive the login. Errors propagate (surfaced to the
        // UI) rather than silently falling back — the user asked to sign in.
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
    // Best-effort: stamp this account's stable identity (for multi-account dedupe)
    // + a real label, from the provider's "current account" endpoint. Never blocks.
    await maybeStoreRemoteIdentity(id, spec);
    await refreshRoutes();
    return infoFor(getServer(id) ?? spec);
  } catch (err) {
    // An SDK `OAuthError` built from a bare `{error:"invalid_grant"}` (no description)
    // has an EMPTY message and only `errorCode` — without the fallback the verdict was
    // "", which `shouldFlagForReconnect` reads as « no error », so a dead token stayed
    // absent from the banner.
    const raw =
      (err instanceof Error && err.message) ||
      (typeof (err as { errorCode?: unknown })?.errorCode === "string" && (err as { errorCode: string }).errorCode) ||
      String(err);
    // Some hosted MCP servers (GitHub, Slack…) don't implement OAuth dynamic
    // client registration, so the one-click connector flow can't auto-register.
    // Surface an actionable message instead of the SDK's raw error.
    const error = /dynamic client registration/i.test(raw)
      ? "Ce serveur refuse l'inscription OAuth automatique : pas de connexion en un clic. Utilisez son équivalent (jeton) dans « Serveurs locaux »."
      : raw;
    return { ...infoFor(spec), connected: false, authorized: false, error };
  } finally {
    loop.close();
  }
}
