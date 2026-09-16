import type { McpConnection } from "@openmasq/mcp";
import { getConnector, type Connector } from "@openmasq/connectors";
import { addServer, getServer, loadToken, saveToken, type ServerSpec } from "../persist";
import { bearerFetchJson, makeConnectorConnection } from "./run";
import { githubDeviceLogin } from "./oauthGithub";
import { googleLogin, refreshGoogleToken } from "./oauthGoogle";
import { microsoftLogin, refreshMicrosoftToken } from "./oauthMicrosoft";
import { slackLogin } from "./oauthSlack";
import { directAccountIdentity, accountKeyHash } from "../accountIdentity";
import { effectiveScopes } from "./scopes";
import { scopesForMode } from "../credMode";

/** Desktop-direct connectors: OAuth on-device + tools in-process, NO broker. Dispatches
 *  the login by the connector's `auth` style and refreshes an expiring token. */

/** True when `id` is a known desktop-direct connector (`@openmasq/connectors`). */
export function hasDirectConnector(id: string): boolean {
  return !!getConnector(id);
}

/** Google connectors share ONE "Desktop app" client (scopes per connector). Same predicate
 *  as `credGroupOf`. */
function isGoogle(connectorId: string): boolean {
  return /^(gmail|google-)/.test(connectorId);
}
/** Microsoft connectors share ONE public client; only admin-consent scopes force BYO. */
function isMicrosoft(connectorId: string): boolean {
  return /^microsoft-/.test(connectorId);
}
function builtinClientId(connectorId: string): string | undefined {
  if (connectorId === "github") return process.env.OPENMASQ_GITHUB_CLIENT_ID;
  if (connectorId === "slack") return process.env.OPENMASQ_SLACK_CLIENT_ID;
  if (isGoogle(connectorId)) return process.env.OPENMASQ_GOOGLE_CLIENT_ID;
  if (isMicrosoft(connectorId)) return process.env.OPENMASQ_MICROSOFT_CLIENT_ID;
  return undefined;
}
function builtinClientSecret(connectorId: string): string | undefined {
  if (isGoogle(connectorId)) return process.env.OPENMASQ_GOOGLE_CLIENT_SECRET;
  return undefined;
}

/** The catalog connector id an instance is an account of. A multi-account instance
 *  is stored as `${connectorId}--${suffix}`; a first/only account uses the bare id. */
function connectorIdOf(spec: ServerSpec): string {
  if (spec.connectorId) return spec.connectorId;
  const i = spec.id.indexOf("--");
  return i > 0 ? spec.id.slice(0, i) : spec.id;
}

function resolveClientId(spec: ServerSpec): string {
  if (spec.credMode === "byo") {
    if (!spec.clientId) throw new Error("Client id manquant (mode « mes clés »)");
    return spec.clientId;
  }
  const id = builtinClientId(connectorIdOf(spec));
  if (!id) {
    throw new Error(
      "Clés intégrées non configurées pour ce connecteur — utilisez « mes clés » ou réessayez plus tard.",
    );
  }
  return id;
}

/** Google needs a (non-confidential) client secret too — from the spec (byo) or env. */
function resolveGoogleCreds(spec: ServerSpec): { clientId: string; clientSecret: string } {
  const clientId = resolveClientId(spec);
  const clientSecret = spec.credMode === "byo" ? spec.clientSecret : builtinClientSecret(connectorIdOf(spec));
  if (!clientSecret) throw new Error("Client secret Google manquant");
  return { clientId, clientSecret };
}


/** Run the connector's login flow and persist the resulting token set. */
async function login(spec: ServerSpec, connector: Connector): Promise<void> {
  // A BYO-only connector needs a RESTRICTED scope the app's own client cannot request.
  if (connector.byoOnly && spec.credMode !== "byo") {
    throw new Error("Ce connecteur nécessite vos propres clés (« Mes clés »).");
  }
  const scopes = scopesForMode(connector.scopes, spec.credMode);
  if (connector.auth === "device") {
    const token = await githubDeviceLogin({
      clientId: resolveClientId(spec),
      scopes,
      serverName: connector.name,
    });
    saveToken(spec.id, { accessToken: token });
    return;
  }
  if (connector.auth === "slack") {
    // Slack (no PKCE) goes through the relay: the exchange needs a secret held server-side.
    const token = await slackLogin({
      clientId: resolveClientId(spec),
      scopes,
      serverName: connector.name,
    });
    saveToken(spec.id, { accessToken: token });
    return;
  }
  if (connector.auth === "microsoft") {
    // Microsoft: loopback + PKCE, PUBLIC client (no secret).
    const { tokens } = await microsoftLogin({ clientId: resolveClientId(spec), scopes });
    saveToken(spec.id, tokens);
    return;
  }
  // "pkce" → loopback + PKCE (Google).
  const { clientId, clientSecret } = resolveGoogleCreds(spec);
  const { tokens } = await googleLogin({ clientId, clientSecret, scopes });
  saveToken(spec.id, tokens);
}

/** Resolve a currently-valid access token, refreshing an expiring Google one. */
async function freshToken(spec: ServerSpec, connector: Connector): Promise<string> {
  const set = loadToken(spec.id);
  if (!set)
    throw new Error(
      `Jeton d'accès indisponible pour « ${connector.name ?? spec.id} » — demande à ` +
        `l'utilisateur de reconnecter ce connecteur (Réglages → Connecteurs). Ne réessaie pas en boucle.`,
    );
  const stale = !!set.expiresAt && set.expiresAt < Date.now() + 60_000;
  // Both refreshes carry the GRANTED scopes forward: a refresh omitting `scope` must not
  // silently widen the connection (`scopes.ts`).
  if (connector.auth === "pkce" && set.refreshToken && stale) {
    const { clientId, clientSecret } = resolveGoogleCreds(spec);
    const refreshed = await refreshGoogleToken({
      clientId,
      clientSecret,
      refreshToken: set.refreshToken,
      scopes: set.scopes,
    });
    saveToken(spec.id, refreshed);
    return refreshed.accessToken;
  }
  if (connector.auth === "microsoft" && set.refreshToken && stale) {
    const refreshed = await refreshMicrosoftToken({
      clientId: resolveClientId(spec),
      refreshToken: set.refreshToken,
      scopes: scopesForMode(connector.scopes, spec.credMode),
      grantedScopes: set.scopes,
    });
    saveToken(spec.id, refreshed);
    return refreshed.accessToken;
  }
  return set.accessToken;
}

/** A live `McpConnection`: the stored token, or the OAuth flow when `interactive`. */
export async function connectorConnect(
  spec: ServerSpec,
  interactive: boolean,
): Promise<McpConnection> {
  const connectorId = connectorIdOf(spec);
  const connector = getConnector(connectorId);
  if (!connector) throw new Error(`Connecteur inconnu : ${connectorId}`);

  if (!loadToken(spec.id)) {
    if (!interactive)
      throw new Error(
        `Autorisation requise pour « ${connector.name} » — demande à l'utilisateur de ` +
          `connecter ce connecteur (Réglages → Connecteurs) avant de réessayer.`,
      );
    await login(spec, connector);
  }

  // Multi-account: best-effort label + `accountKey` (dedupe upstream) on an interactive connect.
  let label = spec.label;
  if (interactive) {
    try {
      const ident = await directAccountIdentity(connectorId, await freshToken(spec, connector));
      if (ident) {
        label = ident.label ?? label;
        addServer({ ...spec, label, accountKey: accountKeyHash(connectorId, ident.key) });
      }
    } catch {
      /* identity is best-effort */
    }
  }

  // The GRANTED scopes (from the token when the server said, else the requested list):
  // `run.ts` lists only the tools they cover. Read AFTER `login`. See `./scopes.ts`.
  const grantedScopes = effectiveScopes(
    loadToken(spec.id)?.scopes,
    scopesForMode(connector.scopes, spec.credMode),
  );

  return makeConnectorConnection({
    id: spec.id,
    connector,
    getToken: () => freshToken(spec, connector),
    grantedScopes,
    accountLabel: label,
  });
}

/**
 * An authenticated JSON GET for a connected instance: same token path and SSRF floor as
 * the tools, for the « Dossiers » panel. The token never leaves here; the caller builds
 * the URL from a validated id (`cloudfs/providers.ts`).
 */
export async function directFetchJson<T>(specId: string, url: string): Promise<T> {
  const spec = getServer(specId);
  if (!spec) throw new Error(`Connecteur inconnu : ${specId}`);
  const connectorId = connectorIdOf(spec);
  const connector = getConnector(connectorId);
  if (!connector) throw new Error(`Connecteur inconnu : ${connectorId}`);
  return bearerFetchJson(await freshToken(spec, connector))<T>(url);
}
