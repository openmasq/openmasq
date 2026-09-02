import Debug from "debug";
import { createClient } from "@supabase/supabase-js";
import { captureError, initialLocale } from "@openmasq/ui";
import type { AuthHost, AuthUser } from "@openmasq/ui";
// Supabase client credentials — PUBLIC (publishable key), resolved in THE renderer's
// environment reader (`./appEnv`), which also carries their defaults.
import { BRAND } from "@openmasq/branding"; import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./appEnv";

// Enable with `localStorage.debug = "openmasq:*"`. Privacy: NEVER log the email,
// the access token, or the PKCE code — only booleans, event names, and presence.
const debug = Debug("openmasq:auth");

/**
 * Log an auth FAILURE. Unlike `debug` (gated behind `localStorage.debug`), this
 * ALSO `console.warn`s unconditionally so a failed sign-in is visible in devtools
 * out of the box — the friendly UI message alone hides the real cause. Bounded
 * fields only (status / name / message category) — NEVER the email, access token,
 * or PKCE code.
 */
function logAuthFailure(op: string, error: unknown): void {
  const e = error as { message?: string; status?: number; name?: string } | null;
  const info =
    e && typeof e === "object"
      ? { name: e.name, status: e.status, message: e.message }
      : { message: String(error) };
  debug("%s failed %o", op, info);
  // eslint-disable-next-line no-console
  console.warn(`[openmasq:auth] ${op} failed`, info);
  // Anonymised error-tracking (separate `$exception` channel). `op` is a fixed,
  // bounded operation name; the message is scrubbed downstream.
  captureError({ scope: "auth", code: op, name: info.name, status: info.status, message: info.message });
}

/**
 * Where Supabase sends the user after they click the magic link. This custom
 * scheme is registered by the main process (`setAsDefaultProtocolClient`), so the
 * OS routes the link back into the app; main forwards the URL here, and we
 * exchange the PKCE `code` for a session.
 *
 * ⚠️ This exact value MUST be allowlisted in the Supabase dashboard under
 * Authentication → URL Configuration → Redirect URLs, or Supabase rejects it.
 */
const AUTH_REDIRECT_URL = `${BRAND.protocol}://auth/callback`;

// ── Offline tolerance ───────────────────────────────────────────────────────
// When the auth server is unreachable, a failed token refresh must NOT bounce the
// user to the login screen — we keep the signed-in session and show an offline
// banner instead (see `getSession` + AppShell). We tell a transient NETWORK outage
// (server down / offline → keep the session; gotrue-js keeps the refresh token) from
// a real AUTH rejection (server answered 4xx invalid_grant → genuine sign-out) by
// watching the OUTCOME of every `/auth/*` request via a wrapping fetch.
const AUTH_ORIGIN = (() => {
  try {
    return new URL(SUPABASE_URL).origin;
  } catch {
    return SUPABASE_URL;
  }
})();
// UNCONFIRMED until a real /auth/ response proves the server reachable: any <500
// answer (even a 401) sets it true (the server ANSWERED, so a null session IS a real
// sign-out); a network throw / 5xx sets it false. It starts FALSE on purpose — at cold
// start, before any /auth/ round-trip, an expired stored token makes
// `supabase.auth.getSession()` yield no live session, and an OPTIMISTIC `true` here then
// returned null → the login screen flashed for a few seconds until a failed background
// refresh finally flipped it false (the reported "déconnecté puis reconnecté"). Starting
// false keeps the last-known user through that unconfirmed window; a genuine sign-out
// clears the stored session (so `lastUser` is null), so it can't keep a stale identity.
let authServerReachable = false;
// Last known signed-in user, kept so an offline `getSession()` can return it
// instead of null. Cleared ONLY on an explicit sign-out.
let lastUser: AuthUser | null = null;
// Whether a session is still PERSISTED at rest — the source of truth for "keep the
// user vs bounce to login" that does NOT depend on network-status guesswork. Supabase
// clears the stored token (`removeItem`) on an explicit `signOut()` or a definitive
// invalid-token sign-out, but NEVER on a transient refresh failure (offline / server
// blip / a retryable 4xx). So a null live-session WITH a session still on disk is a
// transient outage we ride out; a null session with storage CLEARED is a real sign-out.
// This closes the "login flashes for a few seconds then reconnects" case that stale
// `authServerReachable`/`navigator.onLine` could not: a background refresh can fail
// without ever routing a throw through `authAwareFetch`, leaving reachability wrongly
// true → the old code returned null → the login screen appeared. Tracked from the
// storage adapter (the authoritative writer), not inferred.
let persistedSessionPresent = false;
// Waiters resolved the instant the persisted session is seen (seed / token write). This
// lets `getSession()` settle the gate as soon as the on-disk identity is known WITHOUT
// blocking on Supabase's init token-refresh, which RETRIES for seconds when the auth
// server is unreachable — `supabase.auth.getSession()` (and the INITIAL_SESSION event)
// don't resolve until that refresh settles, so awaiting them stalled our gate until the
// 8 s safety timeout flipped loading=false with user=null → the login screen flashed.
const persistedWaiters: Array<() => void> = [];
function markPersisted(present: boolean): void {
  persistedSessionPresent = present;
  if (present) persistedWaiters.splice(0).forEach((r) => r());
}
/** Resolve as soon as a persisted session is seen, or after `timeoutMs` (so a genuinely
 *  session-less start still proceeds). */
function awaitPersisted(timeoutMs: number): Promise<void> {
  if (persistedSessionPresent) return Promise.resolve();
  return new Promise((res) => {
    const t = setTimeout(res, timeoutMs);
    persistedWaiters.push(() => {
      clearTimeout(t);
      res();
    });
  });
}

/**
 * Seed `lastUser` from a PERSISTED Supabase session as it's read out of secure
 * storage. WITHOUT this, offline tolerance only worked "warm": `lastUser` is
 * populated only after a successful in-process session load, so a COLD START with
 * no network (getSession → refresh fetch throws `AuthRetryableFetchError`) fell to
 * the offline branch with `lastUser` STILL null → the gate bounced a genuinely
 * signed-in user to the login screen. Supabase calls `storage.getItem(storageKey)`
 * during every session read (offline included), so lifting the user out here means
 * the offline branch has a cached identity to return before any network round-trip.
 * Best-effort + bounded: only id/email are read, and only to keep the gate open
 * until the real refresh lands — never trusted as proof of a live session. Returns
 * `value` unchanged so callers can `return seedLastUserFromStored(key, value)`.
 */
/**
 * The persisted session's ACCESS TOKEN, mirrored from the storage adapter (every read
 * AND every write — a refresh lands here via `setItem`). `getAccessToken()`'s fast
 * path answers from this WITHOUT touching `supabase.auth.getSession()`: while a
 * background refresh retry-storms against an unreachable auth server, supabase's
 * internal auth lock queues even a trivial session read — so a send with a still-valid
 * token hung behind an outage that didn't concern it. Never trusted beyond `expires_at`
 * (an expired mirror falls through to the real, possibly-refreshing read); cleared on
 * the sign-out `removeItem`.
 */
let storedToken: { token: string; expiresAtMs: number } | null = null;

function cacheStoredToken(value: string | null): void {
  if (!value) return;
  try {
    const parsed = JSON.parse(value) as {
      access_token?: string;
      expires_at?: number;
      currentSession?: { access_token?: string; expires_at?: number };
    };
    const s = parsed.access_token ? parsed : parsed.currentSession;
    if (s?.access_token && typeof s.expires_at === "number") {
      storedToken = { token: s.access_token, expiresAtMs: s.expires_at * 1000 };
    }
  } catch {
    /* not a session JSON — ignore */
  }
}

function seedLastUserFromStored(key: string, value: string | null): string | null {
  if (value && key.endsWith("-auth-token")) {
    cacheStoredToken(value);
    try {
      const parsed = JSON.parse(value) as {
        user?: { id: string; email?: string };
        currentSession?: { user?: { id: string; email?: string } };
      };
      const u = parsed.user ?? parsed.currentSession?.user;
      if (u?.id) {
        // A parseable session with a user IS on disk → keep the gate open on a
        // transient outage (persistence is the source of truth for sign-out), and
        // release any getSession() waiting on the seed.
        if (!lastUser) lastUser = { id: u.id, email: u.email };
        markPersisted(true);
        // eslint-disable-next-line no-console
        console.info("[KVAUTH] seed ← token on disk, persisted=true, lastUser set");
      }
    } catch {
      // Not JSON / unexpected shape — ignore; the offline branch just returns null.
    }
  }
  return value;
}

async function authAwareFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const href =
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const isAuth = typeof href === "string" && href.startsWith(`${AUTH_ORIGIN}/auth/`);
  try {
    const res = await fetch(input, init);
    if (isAuth) authServerReachable = res.status < 500; // a 4xx is still a live server
    return res;
  } catch (e) {
    if (isAuth) authServerReachable = false; // couldn't reach the auth server at all
    throw e;
  }
}

/**
 * Persist the Supabase session (access + REFRESH token, PKCE verifier) ENCRYPTED at
 * rest in the main process (safeStorage), NOT plaintext localStorage where a stolen
 * refresh token = persistent account access. Async adapter → the three ops go through
 * the `authStore` IPC. One-time migration: adopt any legacy localStorage value into
 * the encrypted store on first read, then erase it. Falls back to localStorage when
 * the preload bridge is absent (browser preview / tests) so those still work.
 */
const authBridge = () => (typeof window !== "undefined" ? window.openmasq?.authStore : undefined);
const secureAuthStorage = {
  getItem: async (key: string): Promise<string | null> => {
    const b = authBridge();
    if (!b) {
      try {
        return seedLastUserFromStored(key, localStorage.getItem(key));
      } catch {
        return null;
      }
    }
    try {
      const v = await b.get(key);
      if (v != null) return seedLastUserFromStored(key, v);
      let legacy: string | null = null;
      try {
        legacy = localStorage.getItem(key);
      } catch {
        /* ignore */
      }
      if (legacy != null) {
        await b.set(key, legacy);
        try {
          localStorage.removeItem(key);
        } catch {
          /* ignore */
        }
        return seedLastUserFromStored(key, legacy);
      }
      return null;
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    // A written session token = a session is persisted (sign-in / token refresh).
    if (key.endsWith("-auth-token")) {
      markPersisted(true);
      cacheStoredToken(value); // a refresh rotates the mirrored access token too
    }
    const b = authBridge();
    if (!b) {
      try {
        localStorage.setItem(key, value);
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      await b.set(key, value);
    } catch {
      /* ignore */
    }
    try {
      localStorage.removeItem(key); // never keep a plaintext copy alongside
    } catch {
      /* ignore */
    }
  },
  removeItem: async (key: string): Promise<void> => {
    // The token is removed ONLY on a real sign-out (explicit or a definitive
    // invalid-token clear) — never on a transient refresh failure. This is what
    // flips the gate to login; a network blip leaves the token in place.
    if (key.endsWith("-auth-token")) {
      markPersisted(false);
      storedToken = null; // a signed-out mirror must not serve one more token
    }
    const b = authBridge();
    try {
      await b?.remove(key);
    } catch {
      /* ignore */
    }
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

/** NO Supabase project at build ⇒ app WITHOUT accounts: `main.tsx` doesn't install
 *  `host.auth` (sign-in gate skipped) and nothing calls this client. The `.invalid`
 *  sentinel exists only because `createClient` refuses an empty URL — unreachable
 *  by construction (RFC 2606 reserved TLD). */
export const AUTH_CONFIGURED = !!SUPABASE_URL;
const supabase = createClient(
  SUPABASE_URL || "https://auth-non-configuree.invalid",
  SUPABASE_ANON_KEY || "sb_publishable_placeholder",
  {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: secureAuthStorage,
    // PKCE: the verifier is stored here when the link is requested, then spent
    // when the deep link returns. We handle the redirect ourselves (the renderer
    // is never a real navigation target), so don't auto-parse window.location.
    flowType: "pkce",
    detectSessionInUrl: false,
  },
  // Classify auth-server reachability on every request (offline-tolerant sign-in).
  global: { fetch: authAwareFetch },
});

// When connectivity returns, nudge a refresh so the session re-establishes and
// `onAuthStateChange` fires TOKEN_REFRESHED → the offline banner clears.
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    void supabase.auth.refreshSession().catch(() => {});
  });
}

/** The provider's display name, when the session carries one (Google OAuth populates
 *  `user_metadata.full_name`/`name`/`given_name`; email magic-link sign-ins carry none).
 *  Never logged — only threaded to the home greeting. */
const nameFromMeta = (m: Record<string, unknown> | undefined): string | undefined => {
  const v = m?.full_name ?? m?.name ?? m?.given_name;
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
};

const toUser = (
  u: { id: string; email?: string; user_metadata?: Record<string, unknown> } | null | undefined,
): AuthUser | null => (u ? { id: u.id, email: u.email, name: nameFromMeta(u.user_metadata) } : null);

/**
 * Exchange the PKCE `code` carried by a `<protocol>://auth/callback?code=…` deep
 * link for a session. On success, `onAuthStateChange` fires and the gate opens.
 */
async function completeFromCallback(rawUrl: string): Promise<void> {
  debug("deep-link callback received");
  try {
    const url = new URL(rawUrl);
    const code = url.searchParams.get("code");
    // Supabase may instead redirect with an `error`/`error_description` (expired
    // or already-used link) — nothing to exchange in that case.
    if (!code) {
      debug("callback has no code (error=%s) — nothing to exchange", url.searchParams.get("error") ?? "none");
      return;
    }
    debug("exchanging PKCE code for session");
    await supabase.auth.exchangeCodeForSession(code);
    debug("exchange ok — session established");
  } catch (e) {
    // Malformed URL or a code that's already been spent — ignore; the user can
    // request a fresh link.
    logAuthFailure("exchangeCodeForSession", e);
  }
}

// Forwarded by the main process when the OS hands us the magic-link deep link.
window.openmasq?.auth?.onCallback?.((url) => {
  void completeFromCallback(url);
});

export const authHost: AuthHost = {
  // The auth email carries the CODE and no link (a single-use URL in an inbox: a mail
  // scanner's pre-fetch spends it, and it only ever landed anywhere on a machine holding
  // a packaged build's `<protocol>://` handler). So the screen leads with `verifyCode`.
  linkFirst: false,
  async getSession() {
    // ⚠️ Do NOT block the auth gate on `supabase.auth.getSession()`. At cold start with
    // an expired access token and the auth server UNREACHABLE, Supabase's init refresh
    // RETRIES for several seconds (`AuthRetryableFetchError` storm) and neither
    // `getSession()` nor the `INITIAL_SESSION` event resolves until it settles — so
    // awaiting it stalled the gate until the 8 s safety timeout flipped loading=false
    // with user=null → the LOGIN SCREEN flashed, then the session came back. Instead:
    // run the live read in the background and settle the gate the instant the on-disk
    // identity is known (`awaitPersisted` resolves on the seed / a token write). The
    // real access token is still fetched on demand in `getAccessToken()` (which may
    // await the refresh), and the background read below updates `lastUser` when it lands.
    let liveUser: AuthUser | null | undefined; // undefined = not settled yet
    const live = supabase.auth
      .getSession()
      .then(({ data }) => {
        liveUser = data.session?.user ? toUser(data.session.user) : null;
        if (liveUser) lastUser = liveUser;
      })
      .catch(() => {
        // Refresh network-failed — leave `liveUser` undefined; the persisted/offline
        // branch decides. Swallowed so it never becomes an unhandled rejection.
      });
    // Whichever comes first: the live read settles, or the persisted session is seen
    // (fast — a direct storage read), capped so a genuinely session-less start proceeds.
    await Promise.race([live, awaitPersisted(3000)]);

    if (liveUser) return liveUser; // fresh, fully-online session
    // Live read hasn't produced a user (still pending on a hanging refresh, threw, or
    // returned no session). Decide keep-vs-login by the SOURCE OF TRUTH — whether a
    // session is still persisted at rest — not by network guesswork. An explicit
    // signOut() (or a definitive invalid-token clear) removes the stored token; a
    // transient refresh failure NEVER does. So keep the last-known user (→ reconnecting
    // banner) whenever the session is still on disk, OR the server is plainly
    // unreachable/offline. Report a genuine sign-out (null) ONLY when the token is gone
    // AND the server answered (liveUser === null, i.e. the read actually settled).
    if (
      persistedSessionPresent ||
      !authServerReachable ||
      (typeof navigator !== "undefined" && !navigator.onLine)
    ) {
      debug(
        "getSession → no live user yet, keeping last-known (persisted=%s, user=%s)",
        persistedSessionPresent,
        lastUser ? "present" : "none",
      );
      return lastUser;
    }
    debug("getSession → signed out (no persisted session)");
    return liveUser === null ? null : lastUser;
  },
  async getAccessToken() {
    // FAST PATH: the mirrored persisted token, still valid (small margin so a token
    // about-to-expire takes the refreshing path instead of 401ing at the gateway).
    // No `getSession()` call at all — so a refresh retry-storm holding supabase's
    // auth lock (auth server unreachable) cannot stall a send whose token is fine.
    if (storedToken && storedToken.expiresAtMs > Date.now() + 10_000) {
      debug("getAccessToken → fast path (persisted token valid)");
      return storedToken.token;
    }
    // SLOW PATH: may await a refresh — which can HANG on an unreachable auth server.
    // Deliberately NOT capped here: the send path wraps this in its own race
    // (`send/tokenFetch.ts`) so a timeout is distinguishable from a settled
    // "no session"; a cap here would surface both as null and pick the wrong message.
    const { data } = await supabase.auth.getSession();
    debug("getAccessToken → token %s", data.session?.access_token ? "présent" : "absent");
    return data.session?.access_token ?? null;
  },
  async reconnect() {
    // Force a refresh NOW — the active auto-reconnect loop (`useAuthReconnect`)
    // calls this on a backoff while the offline banner is up. On success supabase
    // emits TOKEN_REFRESHED → `onChange` → the banner clears; on a still-unreachable
    // server `refreshSession` throws (`AuthRetryableFetchError`) or returns an
    // `error`, so we surface null and the loop backs off and retries. A failure here
    // must NOT sign the user out — persistence stays the source of truth (getSession).
    debug("reconnect → forcing session refresh");
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) {
        debug("reconnect → refresh failed (%s)", error.name ?? "error");
        return null;
      }
      debug("reconnect → refresh ok, session %s", data.session ? "present" : "absent");
      return toUser(data.session?.user ?? null);
    } catch (e) {
      // Network throw against an unreachable auth server — expected during an
      // outage; swallowed (never logged as an auth FAILURE) so the loop just retries.
      debug("reconnect → refresh threw (offline) %o", { name: (e as { name?: string })?.name });
      return null;
    }
  },
  onChange(cb) {
    debug("onChange subscribed");
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      debug("authStateChange event=%s → %s", event, session ? "signed in" : "signed out");
      // eslint-disable-next-line no-console
      console.info("[KVAUTH] onChange event=%s user=%s", event, session?.user ? "present" : "null");
      const user = toUser(session?.user);
      // Cache the live user so an offline `getSession()` can return it. A null here
      // (SIGNED_OUT) is forwarded as-is: useAuth re-checks via getSession(), which
      // keeps the user when offline (so a failed refresh shows the banner, not login).
      if (user) lastUser = user;
      cb(user);
    });
    return () => {
      debug("onChange unsubscribed");
      data.subscription.unsubscribe();
    };
  },
  async sendMagicLink({ email }) {
    // Passwordless: emails a one-time sign-in link; creates the user on first
    // use. The link returns to the app via AUTH_REDIRECT_URL.
    debug("sendMagicLink (email length=%d)", email?.length ?? 0);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, emailRedirectTo: AUTH_REDIRECT_URL, data: { language: initialLocale() } },
    });
    if (error) logAuthFailure("sendMagicLink", error);
    else debug("sendMagicLink → sent ok");
    return { error: error?.message };
  },
  async verifyCode({ email, code }) {
    // The SAME email carries a one-time CODE alongside the link. Verifying the
    // code signs in directly — the robust path when the `<protocol>://` deep link is
    // unavailable (scheme not registered, redirect not allow-listed, opened on
    // another device). On success `onAuthStateChange` fires and the gate opens.
    debug("verifyCode (code length=%d)", code?.length ?? 0);
    const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: "email" });
    if (error) logAuthFailure("verifyCode", error);
    else debug("verifyCode → ok");
    return { error: error?.message };
  },
  async signInWithGoogle() {
    // PKCE OAuth: ask Supabase for the Google consent URL but DON'T let the
    // renderer navigate (skipBrowserRedirect) — we open it in the system browser
    // (window.open → main's setWindowOpenHandler → shell.openExternal). Google
    // redirects back to `<protocol>://auth/callback?code=…`, caught by the SAME deep
    // link handler as the magic link (completeFromCallback → exchangeCodeForSession).
    debug("signInWithGoogle");
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: AUTH_REDIRECT_URL, skipBrowserRedirect: true },
      });
      if (error) {
        logAuthFailure("signInWithGoogle", error);
        return { error: error.message };
      }
      if (data?.url) window.open(data.url, "_blank");
      debug("signInWithGoogle → consent opened=%s", !!data?.url);
      return {};
    } catch (e) {
      logAuthFailure("signInWithGoogle", e);
      return { error: e instanceof Error ? e.message : String(e) };
    }
  },
  async signOut() {
    debug("signOut");
    // Clear the cached user FIRST so the offline-tolerant `getSession()` returns
    // null (a real sign-out) even if the /logout call can't reach the server —
    // an explicit sign-out must always take effect, online or not.
    lastUser = null;
    await supabase.auth.signOut().catch((e) => logAuthFailure("signOut", e));
    debug("signOut done");
  },
};
