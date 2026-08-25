import { openAuthExternal } from "./authOpen";
import { startLoopback } from "../oauthLoopback";
import { focusMainWindow } from "../focusApp";
import type { StoredToken } from "../persist";
import { newVerifier, challengeOf } from "./pkce";
import { parseGrantedScopes } from "./scopes";

/**
 * Google OAuth — desktop-direct **authorization-code + loopback redirect + PKCE**,
 * NO broker/server. Google "Desktop app" clients accept a `127.0.0.1` loopback
 * redirect; the shipped `client_secret` is NON-confidential (PKCE is the real
 * protection) so we still send it in the exchange. `access_type=offline` +
 * `prompt=consent` guarantee a refresh_token so the connection survives a relaunch.
 * PKCE S256 helpers are shared with the Slack flow via `./pkce`.
 */
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const TIMEOUT_MS = 5 * 60 * 1000;

interface GoogleTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  /** What the user ACTUALLY consented to — granular consent lets them untick a
   *  scope we asked for, so this can be narrower than our request. */
  scope?: string;
  error?: string;
  error_description?: string;
}

async function postForm(body: Record<string, string>): Promise<GoogleTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(body).toString(),
  });
  const json = (await res.json().catch(() => ({}))) as GoogleTokenResponse;
  if (!res.ok || json.error || !json.access_token) {
    throw new Error(`Échange de token Google échoué (${res.status})`);
  }
  return json;
}

function toStored(
  json: GoogleTokenResponse,
  prior?: { refreshToken?: string; scopes?: string[] },
): StoredToken {
  return {
    accessToken: json.access_token!,
    // Google omits refresh_token on a refresh; keep the one we already have.
    refreshToken: json.refresh_token ?? prior?.refreshToken,
    expiresAt: json.expires_in ? Date.now() + json.expires_in * 1000 : undefined,
    // Same for `scope`: a refresh response may omit it, and losing it would silently
    // widen the connection back to the REQUESTED list (`scopes.ts` falls back).
    scopes: parseGrantedScopes(json.scope) ?? prior?.scopes,
  };
}

/** Run the interactive loopback+PKCE login and resolve the token set. */
export async function googleLogin(opts: {
  clientId: string;
  clientSecret: string;
  scopes: string[];
  loopbackPort?: number;
}): Promise<{ tokens: StoredToken; port: number }> {
  const loop = await startLoopback(opts.loopbackPort, focusMainWindow);
  try {
    const verifier = newVerifier();
    const url = new URL(AUTH_URL);
    url.searchParams.set("client_id", opts.clientId);
    url.searchParams.set("redirect_uri", loop.redirectUrl);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", opts.scopes.join(" "));
    url.searchParams.set("code_challenge", challengeOf(verifier));
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");

    // Open consent in the SYSTEM BROWSER, not an embedded Electron window: Google
    // blocks OAuth in embedded webviews (`disallowed_useragent` → "ce navigateur ou
    // cette application ne sont peut-être pas sécurisés"), and UA-spoofing a webview
    // is a losing cat-and-mouse. The "Desktop app" client + 127.0.0.1 loopback is
    // DESIGNED for this — the system browser hits the loopback after consent, which
    // resolves `waitForCode`. (Unlike Notion et al., accounts.google.com is never
    // claimed by a desktop app via macOS universal links, so openExternal is safe.)
    await openAuthExternal(url.toString());

    const code = await loop.waitForCode(TIMEOUT_MS);
    const json = await postForm({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      redirect_uri: loop.redirectUrl,
    });
    return { tokens: toStored(json), port: loop.port };
  } finally {
    loop.close();
  }
}

/** Exchange a refresh_token for a fresh access token (keeps the refresh_token, and
 *  the granted scopes when the refresh response omits them). */
export async function refreshGoogleToken(opts: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  /** The scopes already recorded for this connection, carried over when Google
   *  doesn't repeat them. */
  scopes?: string[];
}): Promise<StoredToken> {
  const json = await postForm({
    grant_type: "refresh_token",
    refresh_token: opts.refreshToken,
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
  });
  return toStored(json, { refreshToken: opts.refreshToken, scopes: opts.scopes });
}
