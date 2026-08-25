/**
 * A storage-backed {@link OAuthClientProvider} for remote (HTTP) MCP servers —
 * the "connector" model used by Claude: the user authorises each service
 * (Notion, Slack, Gmail, …) through that provider's own hosted OAuth, with PKCE
 * and **dynamic client registration**, so no pre-created cloud OAuth app is
 * needed. All persisted material (registered client, tokens, PKCE verifier) is
 * kept in an injectable store so the desktop app can encrypt it (safeStorage).
 *
 * This module is pure: the browser redirect and the encrypted persistence are
 * passed in as callbacks, so it stays unit-testable without Electron.
 */

import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationFull,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";

/** Unpredictable OAuth `state` value (CSRF nonce). Uses the platform CSPRNG
 *  (Node ≥18 / browser both expose `globalThis.crypto`). Structurally typed so the
 *  package needs no DOM lib. */
function randomState(): string {
  const g = (globalThis as {
    crypto?: {
      randomUUID?: () => string;
      getRandomValues?: (a: Uint8Array) => Uint8Array;
    };
  }).crypto;
  if (g?.randomUUID) return g.randomUUID().replace(/-/g, "");
  if (g?.getRandomValues) {
    const b = g.getRandomValues(new Uint8Array(16));
    return Array.from(b, (x: number) => x.toString(16).padStart(2, "0")).join("");
  }
  throw new Error("No CSPRNG available to generate an OAuth state");
}

/** Everything an OAuth connector needs to persist between app runs. */
export interface StoredOAuthState {
  /** The client registered with the server via dynamic client registration. */
  clientInformation?: OAuthClientInformationFull;
  /** Access (+ refresh) tokens obtained after authorisation. */
  tokens?: OAuthTokens;
  /** In-flight PKCE verifier, kept only between redirect and code exchange. */
  codeVerifier?: string;
}

export interface OAuthProviderOptions {
  /** Loopback URL the authorisation server redirects back to (must be allow-listed by us). */
  redirectUrl: string;
  /** Human-readable client name shown on the provider's consent screen. */
  clientName: string;
  /** App homepage URL — some providers render it (and require it to show a logo). */
  clientUri?: string;
  /** Public HTTPS URL of the app logo shown on the consent screen (RFC 7591). */
  logoUri?: string;
  /** Stable identifier for THIS software across registrations (RFC 7591). Lets a
   *  provider recognise the app instead of labelling it an anonymous/"self-host". */
  softwareId?: string;
  /** App version string (RFC 7591 `software_version`). */
  softwareVersion?: string;
  /** Requested scopes (space-separated). Optional — many servers infer them. */
  scope?: string;
  /** State already loaded (and decrypted) from durable storage, if any. */
  state?: StoredOAuthState;
  /** Persist updated state (the caller encrypts + writes it). Called on every change. */
  persist: (state: StoredOAuthState) => void | Promise<void>;
  /** Open the provider's authorisation page (e.g. a BrowserWindow / shell.openExternal). */
  openAuthorization: (url: URL) => void | Promise<void>;
}

/**
 * Build an {@link OAuthClientProvider} backed by `opts`. State lives in memory
 * (seeded from `opts.state`) and every mutation is mirrored to `opts.persist`.
 */
export function makeOAuthProvider(opts: OAuthProviderOptions): OAuthClientProvider {
  const state: StoredOAuthState = { ...(opts.state ?? {}) };
  const save = () => opts.persist({ ...state });
  // Was the client registered during THIS provider's lifetime (a fresh DCR), vs
  // loaded from a PRIOR run's stored state? A freshly-registered client is current
  // by definition and must survive the stale-redirect guard below — some providers
  // (Dropbox's unverified "self host" DCR) don't echo our `redirect_uri` in the
  // registration response, so dropping it here would fail the very next step (the
  // code→token exchange) with "Existing OAuth client information is required".
  let freshlyRegistered = false;

  return {
    get redirectUrl() {
      return opts.redirectUrl;
    },
    get clientMetadata(): OAuthClientMetadata {
      return {
        client_name: opts.clientName,
        redirect_uris: [opts.redirectUrl],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
        ...(opts.clientUri ? { client_uri: opts.clientUri } : {}),
        ...(opts.logoUri ? { logo_uri: opts.logoUri } : {}),
        ...(opts.softwareId ? { software_id: opts.softwareId } : {}),
        ...(opts.softwareVersion ? { software_version: opts.softwareVersion } : {}),
        ...(opts.scope ? { scope: opts.scope } : {}),
      };
    },
    clientInformation() {
      const info = state.clientInformation;
      if (!info) return undefined;
      // A PRIOR-run dynamic registration pins the redirect_uri (an ephemeral
      // loopback port). If that port no longer matches and we have no usable
      // tokens — so a fresh browser authorization is imminent — drop the stale
      // client to force re-registration with the current redirect_uri. Otherwise
      // the provider bounces the browser to a dead port and the login hangs. With
      // valid tokens we keep it (token refresh doesn't use the redirect_uri).
      // A client REGISTERED THIS SESSION is exempt: it's current even if the
      // provider's DCR response didn't echo our redirect_uri (Dropbox), and the
      // imminent code exchange needs it.
      if (
        !freshlyRegistered &&
        !state.tokens &&
        !(info.redirect_uris ?? []).includes(opts.redirectUrl)
      ) {
        return undefined;
      }
      return info;
    },
    async saveClientInformation(info) {
      state.clientInformation = info as OAuthClientInformationFull;
      freshlyRegistered = true;
      await save();
    },
    tokens() {
      return state.tokens;
    },
    async saveTokens(tokens) {
      state.tokens = tokens;
      await save();
    },
    // The MCP SDK includes an OAuth `state` in the authorize URL ONLY when the provider
    // supplies one (`auth.js`: `provider.state ? await provider.state() : undefined`).
    // Without this, no `state` is sent — and an authorization server that REQUIRES it
    // (per the current MCP auth spec; e.g. PostHog's `oauth.posthog.com`) rejects the
    // request with "Missing state parameter". So always send an unpredictable state.
    // (It's outbound only: PKCE `code_verifier` is the primary CSRF/code-injection guard,
    // and our loopback exchanges the code by verifier — it does not re-validate the echoed
    // state, so a fresh per-authorization value is sufficient and needs no persistence.)
    state() {
      return randomState();
    },
    async redirectToAuthorization(url) {
      await opts.openAuthorization(url);
    },
    async saveCodeVerifier(verifier) {
      state.codeVerifier = verifier;
      await save();
    },
    codeVerifier() {
      if (!state.codeVerifier) throw new Error("No PKCE code verifier saved");
      return state.codeVerifier;
    },
  };
}
