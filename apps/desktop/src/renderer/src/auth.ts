import Debug from "debug";
import { createClient } from "@supabase/supabase-js";
import { captureError, initialLocale } from "@openmasq/ui";
import type { AuthHost, AuthUser } from "@openmasq/ui";
// PUBLIC client credentials (publishable key), resolved by `./appEnv`.
import { BRAND } from "@openmasq/branding"; import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./appEnv"; import { googleProviderEnabled } from "./authProviders";

// Enable with `localStorage.debug = "openmasq:*"`. Privacy: NEVER log the email,
// the access token, or the PKCE code — only booleans, event names, and presence.
const debug = Debug("openmasq:auth");

/**
 * Log an auth FAILURE, unconditionally (`console.warn`) so a failed sign-in is visible in
 * devtools. Bounded fields only — NEVER the email, access token, or PKCE code.
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
  // Anonymised error-tracking; `op` is a bounded name, the message is scrubbed downstream.
  captureError({ scope: "auth", code: op, name: info.name, status: info.status, message: info.message });
}

/**
 * Where the auth server sends the user after the magic link. The scheme is registered by
 * main (`setAsDefaultProtocolClient`), which forwards the URL here for the PKCE exchange.
 * ⚠️ This exact value MUST be allow-listed as a redirect URL on the auth server.
 */
const AUTH_REDIRECT_URL = `${BRAND.protocol}://auth/callback`;

// ── Offline tolerance ───────────────────────────────────────────────────────
// A failed token refresh against an UNREACHABLE auth server must NOT bounce the user to
// the login screen: keep the session, show the offline banner. A transient NETWORK outage
// is told from a real AUTH rejection by watching the OUTCOME of every `/auth/*` request.
const AUTH_ORIGIN = (() => {
  try {
    return new URL(SUPABASE_URL).origin;
  } catch {
    return SUPABASE_URL;
  }
})();
// UNCONFIRMED until a real /auth/ response: any <500 answer sets it true (the server
// ANSWERED, so a null session IS a sign-out); a throw / 5xx sets it false. Starts FALSE on
// purpose: at cold start an expired stored token yields no live session, and an optimistic
// true would flash the login screen. A genuine sign-out clears the stored session, so a
// stale identity cannot survive.
let authServerReachable = false;
// Last known signed-in user, for an offline `getSession()`. Cleared ONLY on sign-out.
let lastUser: AuthUser | null = null;
// Whether a session is still PERSISTED at rest: the source of truth for "keep the user vs
// bounce to login". The client clears the stored token on an explicit sign-out or a
// definitive invalid-token sign-out, NEVER on a transient refresh failure. Tracked from the
// storage adapter (the authoritative writer), not inferred from network status.
let persistedSessionPresent = false;
// Waiters resolved the instant the persisted session is seen, so `getSession()` settles
// the gate from the on-disk identity WITHOUT blocking on the client's init refresh (which
// retries for seconds against an unreachable server).
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
 * The persisted session's ACCESS TOKEN, mirrored from the storage adapter (every read and
 * write). `getAccessToken()`'s fast path answers from it WITHOUT `supabase.auth.getSession()`,
 * whose internal lock queues even a trivial read while a refresh retry-storms. Never
 * trusted beyond `expires_at`; cleared on the sign-out `removeItem`.
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
        // A session with a user IS on disk: keep the gate open on a transient outage
        // and release any getSession() waiting on the seed. Only id/email are read,
        // never trusted as proof of a live session.
        if (!lastUser) lastUser = { id: u.id, email: u.email };
        markPersisted(true);
        // eslint-disable-next-line no-console
        console.info("[KVAUTH] seed ← token on disk, persisted=true, lastUser set");
      }
    } catch {
      // Not a session JSON — the offline branch just returns null.
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
 * Persist the session (access + REFRESH token, PKCE verifier) ENCRYPTED at rest in main
 * (safeStorage), never plaintext localStorage where a stolen refresh token = persistent
 * account access. A legacy localStorage value is adopted into the encrypted store on first
 * read, then erased. Falls back to localStorage without the preload bridge (preview/tests).
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
    // Removed ONLY on a real sign-out, never on a transient refresh failure: this is
    // what flips the gate to login.
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

/** NO auth server at build ⇒ app WITHOUT accounts: `main.tsx` doesn't install `host.auth`
 *  and nothing calls this client. The `.invalid` sentinel exists only because
 *  `createClient` refuses an empty URL (RFC 2606 reserved TLD, unreachable). */
export const AUTH_CONFIGURED = !!SUPABASE_URL;
const supabase = createClient(
  SUPABASE_URL || "https://auth-non-configuree.invalid",
  SUPABASE_ANON_KEY || "sb_publishable_placeholder",
  {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: secureAuthStorage,
    // PKCE; the redirect is handled by us (the renderer is never a navigation target).
    flowType: "pkce",
    detectSessionInUrl: false,
  },
  // Classify auth-server reachability on every request (offline-tolerant sign-in).
  global: { fetch: authAwareFetch },
});

// Connectivity back → nudge a refresh so TOKEN_REFRESHED clears the offline banner.
if (typeof window !== "undefined") {
  window.addEventListener("online", () => void supabase.auth.refreshSession().catch(() => {}));
}

/** The provider's display name when the session carries one. Never logged. */
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
    // An expired or already-used link redirects with an `error` instead.
    if (!code) {
      debug("callback has no code (error=%s) — nothing to exchange", url.searchParams.get("error") ?? "none");
      return;
    }
    debug("exchanging PKCE code for session");
    await supabase.auth.exchangeCodeForSession(code);
    debug("exchange ok — session established");
  } catch (e) {
    // Malformed URL or a spent code: the user can request a fresh link.
    logAuthFailure("exchangeCodeForSession", e);
  }
}

// Forwarded by the main process when the OS hands us the magic-link deep link.
window.openmasq?.auth?.onCallback?.((url) => {
  void completeFromCallback(url);
});

export const authHost: AuthHost = {
  // The auth email carries the CODE and no link (a mail scanner's pre-fetch spends a
  // single-use URL), so the screen leads with `verifyCode`.
  linkFirst: false,
  async getSession() {
    // ⚠️ Do NOT block the auth gate on `supabase.auth.getSession()`: against an
    // unreachable server its init refresh retries for seconds and nothing resolves. Run
    // the live read in the background and settle the gate from the on-disk identity.
    let liveUser: AuthUser | null | undefined; // undefined = not settled yet
    const live = supabase.auth
      .getSession()
      .then(({ data }) => {
        liveUser = data.session?.user ? toUser(data.session.user) : null;
        if (liveUser) lastUser = liveUser;
      })
      .catch(() => {
        // Network failure: `liveUser` stays undefined, the persisted branch decides.
      });
    // Whichever comes first, capped so a genuinely session-less start proceeds.
    await Promise.race([live, awaitPersisted(3000)]);

    if (liveUser) return liveUser; // fresh, fully-online session
    // Keep-vs-login is decided by the SOURCE OF TRUTH (a session still persisted at
    // rest), not network guesswork. A genuine sign-out (null) is reported ONLY when the
    // token is gone AND the server answered.
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
    // FAST PATH: the mirrored persisted token, still valid (margin so an about-to-expire
    // token takes the refreshing path). No `getSession()`, so a refresh retry-storm
    // cannot stall a send whose token is fine.
    if (storedToken && storedToken.expiresAtMs > Date.now() + 10_000) {
      debug("getAccessToken → fast path (persisted token valid)");
      return storedToken.token;
    }
    // SLOW PATH: may await a refresh, which can hang. NOT capped here: the send path
    // races it itself (`send/tokenFetch.ts`) so a timeout stays distinguishable from a
    // settled "no session".
    const { data } = await supabase.auth.getSession();
    debug("getAccessToken → token %s", data.session?.access_token ? "présent" : "absent");
    return data.session?.access_token ?? null;
  },
  async reconnect() {
    // Force a refresh NOW (`useAuthReconnect` calls this on a backoff while the banner
    // is up). A failure here must NOT sign the user out: persistence stays the source of
    // truth.
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
      // Expected during an outage; never logged as an auth FAILURE.
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
      // A null (SIGNED_OUT) is forwarded as-is: useAuth re-checks via getSession(),
      // which keeps the user when offline.
      if (user) lastUser = user;
      cb(user);
    });
    return () => {
      debug("onChange unsubscribed");
      data.subscription.unsubscribe();
    };
  },
  async sendMagicLink({ email }) {
    // Passwordless; creates the user on first use.
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
    // The one-time CODE from the same email: the robust path when the deep link is
    // unavailable (scheme not registered, opened on another device).
    debug("verifyCode (code length=%d)", code?.length ?? 0);
    const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: "email" });
    if (error) logAuthFailure("verifyCode", error);
    else debug("verifyCode → ok");
    return { error: error?.message };
  },
  googleEnabled: () => googleProviderEnabled(AUTH_ORIGIN, SUPABASE_ANON_KEY),
  async signInWithGoogle() {
    // PKCE OAuth: the consent URL opens in the system browser (window.open → main's
    // setWindowOpenHandler → shell.openExternal); the redirect comes back through the
    // SAME deep-link handler as the magic link.
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
    // Clear the cached user FIRST: an explicit sign-out takes effect online or not.
    lastUser = null;
    await supabase.auth.signOut().catch((e) => logAuthFailure("signOut", e));
    debug("signOut done");
  },
};
