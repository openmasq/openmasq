import { openAuthExternal } from "./authOpen";
import { startLoopback } from "../oauthLoopback";
import { focusMainWindow } from "../focusApp";
import type { StoredToken } from "../persist";
import { newVerifier, challengeOf } from "./pkce";
import { microsoftAuthFailure } from "./microsoftConsent";
import { parseGrantedScopes } from "./scopes";

/**
 * Microsoft identity platform OAuth — desktop-direct **authorization-code + loopback
 * redirect + PKCE**, NO broker/server. Unlike Google, the client is a PUBLIC client
 * ("Mobile and desktop applications" platform, `127.0.0.1` redirect): there is NO
 * `client_secret` — PKCE is the sole protection. `offline_access` guarantees a
 * refresh_token (so the connection survives a relaunch); `openid profile email`
 * yields an id_token used only for local account dedupe. PKCE S256 helpers are
 * shared with the Google/Slack flows via `./pkce`.
 */
const AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const TIMEOUT_MS = 5 * 60 * 1000;
// Always requested alongside the connector's Graph scopes: a refresh token + an
// id_token for local dedupe.
const BASE_SCOPES = ["offline_access", "openid", "profile", "email"];

interface MsTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  /** What the tenant/user actually consented to — narrower than the request when an
   *  admin-consent Graph scope was refused. */
  scope?: string;
  error?: string;
  error_description?: string;
}

async function postForm(body: Record<string, string>): Promise<MsTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(body).toString(),
  });
  const json = (await res.json().catch(() => ({}))) as MsTokenResponse;
  if (!res.ok || json.error || !json.access_token) {
    throw new Error(`Échange de token Microsoft échoué (${res.status})`);
  }
  return json;
}

function toStored(
  json: MsTokenResponse,
  prior?: { refreshToken?: string; scopes?: string[] },
): StoredToken {
  return {
    accessToken: json.access_token!,
    // Microsoft usually rotates the refresh_token; keep the prior one if omitted.
    refreshToken: json.refresh_token ?? prior?.refreshToken,
    expiresAt: json.expires_in ? Date.now() + json.expires_in * 1000 : undefined,
    scopes: parseGrantedScopes(json.scope) ?? prior?.scopes,
  };
}

/** The full scope string = the connector's Graph scopes + the base OIDC/offline set. */
function scopeString(scopes: string[]): string {
  return [...scopes, ...BASE_SCOPES].join(" ");
}

/** Run the interactive loopback+PKCE login and resolve the token set. */
export async function microsoftLogin(opts: {
  clientId: string;
  scopes: string[];
  loopbackPort?: number;
}): Promise<{ tokens: StoredToken; port: number }> {
  const loop = await startLoopback(opts.loopbackPort, focusMainWindow);
  try {
    const verifier = newVerifier();
    const url = new URL(AUTH_URL);
    url.searchParams.set("client_id", opts.clientId);
    url.searchParams.set("redirect_uri", loop.redirectUrl);
    // The loopback settles ONLY on a callback echoing this value (`oauthLoopback.ts`).
    url.searchParams.set("state", loop.state);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", scopeString(opts.scopes));
    url.searchParams.set("code_challenge", challengeOf(verifier));
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("prompt", "select_account");

    // Open consent in the SYSTEM BROWSER (not an embedded window): Microsoft, like
    // Google, blocks/rejects OAuth in embedded webviews. The public desktop client +
    // 127.0.0.1 loopback is designed for this — the browser hits the loopback after
    // consent, resolving `waitForCode`.
    await openAuthExternal(url.toString());

    let code: string;
    try {
      code = await loop.waitForCode(TIMEOUT_MS);
    } catch (e) {
      // A tenant that refuses is the COMMON case for the admin-consent scopes (Teams,
      // SharePoint), not an edge case: turn it into the one action that unblocks it — a
      // link to hand to an administrator — instead of a raw `AADSTS…` string.
      const f = microsoftAuthFailure(e instanceof Error ? e.message : String(e), {
        clientId: opts.clientId,
        redirectUri: loop.redirectUrl,
      });
      throw new Error(f.adminConsentUrl ? `${f.message}\n${f.adminConsentUrl}` : f.message);
    }
    const json = await postForm({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      client_id: opts.clientId,
      redirect_uri: loop.redirectUrl,
    });
    return { tokens: toStored(json), port: loop.port };
  } finally {
    loop.close();
  }
}

/** Exchange a refresh_token for a fresh access token (keeps a rotated refresh_token). */
export async function refreshMicrosoftToken(opts: {
  clientId: string;
  refreshToken: string;
  /** The scopes to REQUEST on the refresh (the connector's, for the cred mode). */
  scopes: string[];
  /** The scopes already GRANTED, carried over when the response omits them. */
  grantedScopes?: string[];
}): Promise<StoredToken> {
  const json = await postForm({
    grant_type: "refresh_token",
    refresh_token: opts.refreshToken,
    client_id: opts.clientId,
    scope: scopeString(opts.scopes),
  });
  return toStored(json, { refreshToken: opts.refreshToken, scopes: opts.grantedScopes });
}
