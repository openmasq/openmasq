import { newVerifier, challengeOf } from "./pkce";
import { openAuthExternal } from "./authOpen";

/**
 * Slack OAuth — desktop-direct, but Slack can't do PKCE and needs an HTTPS
 * redirect, so the single, environment-independent AUTH-ONLY relay (`apps/auth`)
 * holds the app's own Slack secret and provides the callback. The Slack DATA never
 * transits the relay — only the token exchange. Handoff (token never in a URL):
 *   1. generate a `verifier`; `challenge = SHA256(verifier)` becomes the `state`;
 *   2. open Slack authorize (redirect → `<auth>/slack/callback`);
 *   3. the relay exchanges the code (its secret), stores the token single-use
 *      keyed by `challenge`;
 *   4. we POLL `<auth>/slack/token` with the `verifier` → the relay derives
 *      the same `challenge`, returns + deletes the token.
 */
// Slack's AUTHORIZE endpoint has NO `/api/` prefix (that's only for API methods
// like `oauth.v2.access`). Using `/api/oauth/v2/authorize` yields Slack's generic
// "something went wrong" page.
const AUTHORIZE = "https://slack.com/oauth/v2/authorize";
const POLL_INTERVAL_MS = 2000;
const TIMEOUT_MS = 5 * 60 * 1000;

/** The single, environment-independent auth-only relay (apps/auth) that serves /slack/*. */
function authBase(): string {
  const u = process.env.OPENMASQ_AUTH_URL;
  if (!u) throw new Error("OPENMASQ_AUTH_URL non configuré (connecteur Slack)");
  return u.replace(/\/$/, "");
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Poll the auth relay's single-use, verifier-gated retrieval until the token lands. */
async function pollToken(base: string, verifier: string, deadline: number): Promise<string> {
  // La DERNIÈRE panne rencontrée pendant l'attente : un relais 500, un TLS cassé et un
  // consentement encore en attente produisaient tous le même « a expiré » plat après le
  // timeout complet (audit 13/08 — le motif à copier était oauthMicrosoft, qui garde sa
  // cause). Jamais de contenu : un statut ou un message d'erreur réseau.
  let lastFailure = "";
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const res = await fetch(`${base}/slack/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verifier }),
    }).catch((e: unknown) => {
      lastFailure = e instanceof Error ? e.message : String(e);
      return null;
    });
    if (res?.ok) {
      const data = (await res.json().catch(() => ({}))) as { token?: string; pending?: boolean };
      if (data.token) return data.token;
      if (data.pending) lastFailure = "consentement en attente";
    } else if (res) {
      lastFailure = `relais HTTP ${res.status}`;
    }
    // pending / transient network blip → keep polling until the deadline
  }
  throw new Error(`La connexion Slack a expiré — réessayez${lastFailure ? ` (${lastFailure})` : ""}`);
}

/** Run the interactive Slack login and resolve the user access token. */
export async function slackLogin(opts: {
  clientId: string;
  scopes: string[];
  serverName: string;
}): Promise<string> {
  const base = authBase();
  const verifier = newVerifier();
  const url = new URL(AUTHORIZE);
  url.searchParams.set("client_id", opts.clientId);
  // USER scopes (comma-separated) — the token lands under `authed_user`.
  url.searchParams.set("user_scope", opts.scopes.join(","));
  url.searchParams.set("redirect_uri", `${base}/slack/callback`);
  url.searchParams.set("state", challengeOf(verifier));

  // Open Slack authorize in the SYSTEM BROWSER, not an embedded window: a Slack
  // workspace using Google SSO would hit Google's `disallowed_useragent` webview
  // block. The relay + polling is browser-agnostic — the browser redirects to the
  // relay, and we poll `<auth>/slack/token` for the single-use token regardless.
  await openAuthExternal(url.toString());
  return pollToken(base, verifier, Date.now() + TIMEOUT_MS);
}
