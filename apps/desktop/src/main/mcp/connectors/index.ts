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

/**
 * Desktop-direct connector orchestration — OAuth on-device + tools in-process, NO
 * broker. Keeps the device-flow / loopback+PKCE / token / adapter logic OUT of the
 * already-large `mcp/index.ts`, which only inserts the returned `McpConnection`.
 * Dispatches the login by the connector's `auth` style (device = GitHub, pkce =
 * Google) and transparently refreshes an expiring Google token.
 */

/** True when `id` is a known desktop-direct connector (`@openmasq/connectors`). */
export function hasDirectConnector(id: string): boolean {
  return !!getConnector(id);
}

/**
 * The public (non-secret) OAuth client id for the built-in credential mode of a connector.
 * TODO: set the REAL ids. The GitHub OAuth App must have **device flow enabled**;
 * the Google client must be a **"Desktop app"** OAuth client (its "secret" is
 * non-confidential). `byo` mode reads the id/secret off the spec instead.
 */
/** Google connectors (`google-calendar`, `google-drive`, `gmail`) share ONE
 *  "Desktop app" client — scopes are requested per-connector via incremental
 *  consent. Matches the dashless merged `gmail` id AND the `google-`/`gmail-`
 *  prefixes (kept in sync with `credGroupOf`'s `/^(gmail|google-)/`). */
function isGoogle(connectorId: string): boolean {
  return /^(gmail|google-)/.test(connectorId);
}
/** Microsoft Graph connectors (`microsoft-*`) share ONE public "Desktop app" client
 *  — scopes are requested per-connector; only admin-consent scopes force BYO. */
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
  // BYO-only connectors need a RESTRICTED scope (e.g. Gmail read) → the app's own
  // client would require Google's CASA audit, so refuse the built-in mode outright.
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
    // Slack (no PKCE, HTTPS-only redirect) goes through the gateway auth-only fn.
    // Built-in mode only: the exchange needs the app's own Slack secret, held server-side.
    const token = await slackLogin({
      clientId: resolveClientId(spec),
      scopes,
      serverName: connector.name,
    });
    saveToken(spec.id, { accessToken: token });
    return;
  }
  if (connector.auth === "microsoft") {
    // Microsoft identity platform — loopback + PKCE, PUBLIC client (no secret).
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
  // Both refreshes carry the recorded GRANTED scopes forward: a refresh response
  // that omits `scope` must not silently widen the connection back to what we asked
  // for (`scopes.ts`).
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

/**
 * Build a live `McpConnection` for a desktop-direct connector. Reuses the stored
 * token; if absent and `interactive`, runs the OAuth flow and persists the token.
 * Throws when a fresh login is needed but not interactive.
 */
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

  // Multi-account: best-effort label this instance with the signed-in account
  // (email / login) on an interactive connect, replacing a provisional "Compte N".
  // The identity ALSO becomes the `accountKey` (dedupe: re-adding the same account
  // is refused upstream in `mcp/index.ts`).
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

  // What this connection may actually do — read from the TOKEN when the server told
  // us (granular consent can narrow what we asked for), else the credential mode's
  // requested list. `run.ts` lists only the tools those scopes cover, so a tool the
  // token can't serve is never offered to the model at all (e.g. Gmail 1-clic en mode
  // intégré grants send only → search/list are hidden). Read AFTER `login`, so a first
  // connect sees the scopes it just recorded. See `./scopes.ts`.
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
 * Un GET JSON authentifié pour une instance de connecteur direct DÉJÀ connectée — le même
 * chemin de jeton (rafraîchissement compris) et le même plancher SSRF que les outils, sans
 * passer par un outil fait pour un modèle.
 *
 * C'est ce qui permet au panneau « Dossiers » de lister un Drive : une liste typée là où
 * l'outil rend de la prose. Le jeton ne sort pas d'ici, et l'appelant ne choisit que
 * l'URL — qu'il construit lui-même à partir d'un id validé (`cloudfs/providers.ts`).
 */
export async function directFetchJson<T>(specId: string, url: string): Promise<T> {
  const spec = getServer(specId);
  if (!spec) throw new Error(`Connecteur inconnu : ${specId}`);
  const connectorId = connectorIdOf(spec);
  const connector = getConnector(connectorId);
  if (!connector) throw new Error(`Connecteur inconnu : ${connectorId}`);
  return bearerFetchJson(await freshToken(spec, connector))<T>(url);
}
