import { useEffect, useState, useCallback } from "react";
import { useHost, type AuthUser } from "../host";
import { resolveAuthEvent } from "./authEvent";
import { useAuthReconnect } from "./useAuthReconnect";

export interface AuthState {
  /** The signed-in user, or null when signed out. */
  user: AuthUser | null;
  /** True until the initial session is resolved. */
  loading: boolean;
  /** Whether the platform has auth at all (false = no login gate). */
  enabled: boolean;
  /** True when we're KEEPING a signed-in user despite a transient auth-server
   *  outage (a sign-out signal was ignored because the session is still valid
   *  locally). The UI can show a discreet "Reconnexion…" hint; it clears on the
   *  next successful auth event. */
  reconnecting: boolean;
  /** Passwordless: email a magic sign-in link. The session establishes itself
   *  asynchronously when the user clicks it (watch `user` via `onChange`). */
  sendMagicLink(email: string): Promise<{ error?: string }>;
  /** Whether the platform can verify the emailed one-time CODE directly (a code
   *  field can be shown as a robust alternative to clicking the link). */
  codeSupported: boolean;
  /** True when the emailed LINK is the primary path (desktop deep-link flow): the
   *  login screen leads with "click the link" and keeps the code entry behind a
   *  fallback disclosure. False = code-first (code field shown up front). */
  linkFirst: boolean;
  /** Complete sign-in with the emailed code. No-op error when unsupported. */
  verifyCode(p: { email: string; code: string }): Promise<{ error?: string }>;
  /** Whether Google OAuth is wired (show the "Continue with Google" button). */
  googleSupported: boolean;
  /** Start Google OAuth (opens the consent in the browser; `user` flips via `onChange`). */
  signInWithGoogle(): Promise<{ error?: string }>;
  signOut(): Promise<void>;
}

/**
 * Account auth state, backed by `host.auth` (Supabase on desktop). When the host
 * has no `auth` capability (e.g. the browser preview), this reports
 * `enabled: false` and the app's login gate is skipped.
 */
export function useAuth(): AuthState {
  const host = useHost();
  const auth = host.auth;
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(!!auth);
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }
    let alive = true;
    const settle = (u: AuthUser | null) => {
      if (!alive) return;
      setUser(u);
      // If we resolved a user while the browser is OFFLINE, the host returned a
      // cached/persisted session (the auth server is unreachable) — surface the
      // "reconnecting" banner rather than a normal, fully-online signed-in state.
      // Clears on the next successful auth event (the `online` → refresh nudge).
      setReconnecting(!!u && typeof navigator !== "undefined" && !navigator.onLine);
      setLoading(false);
      clearTimeout(safety);
    };
    // Safety net: if `getSession()` hangs (e.g. Supabase can't reach the network
    // and an internal token refresh never settles), force `loading` off so the
    // login screen appears instead of a blank "loading forever" shell. It ONLY
    // touches `loading` — never signs a real session out.
    const safety = setTimeout(() => {
      if (alive) setLoading(false);
    }, 8000);
    auth
      .getSession()
      .then(settle)
      .catch(() => {
        if (alive) {
          setLoading(false);
          clearTimeout(safety);
        }
      });
    // Live updates (sign-in / sign-out / token refresh from any window). A null
    // (sign-out) signal is NEVER trusted verbatim: a transient auth-server outage
    // surfaces a spurious sign-out, AND at cold start the initial session may not
    // be resolved yet (so keying off the current user raced a login bounce). Every
    // null RE-VERIFIES via the offline-tolerant `getSession()` (`resolveAuthEvent`),
    // which keeps a cached/persisted session when the server is unreachable and
    // returns null ONLY on a genuine, reachable sign-out. An explicit logout /
    // revoked token clears storage, so `getSession` then returns null → sign out.
    const unsub = auth.onChange((u) => {
      if (!alive) return;
      // Clear `loading` only AFTER the user is resolved, TOGETHER with `setUser` — never
      // before. Supabase fires an initial `onChange` (INITIAL_SESSION) whose null-session
      // resolution is ASYNC (`resolveAuthEvent` → `getSession`); clearing `loading` up front
      // opened a window of `loading:false` + `user:null` that rendered the LOGIN screen for a
      // beat until the user landed (the reported "page login quelques secondes"). The boot
      // splash / loading gate now holds until the identity is known.
      void resolveAuthEvent(auth, u).then((r) => {
        if (!alive) return;
        if (r.kind === "set") setUser(r.user);
        setReconnecting(r.reconnecting);
        setLoading(false);
        clearTimeout(safety);
      });
    });
    return () => {
      alive = false;
      clearTimeout(safety);
      unsub();
    };
  }, [auth]);

  // The banner copy ("reconnexion automatique en cours…") is only truthful if
  // SOMETHING actively retries: `online`/the internal refresh timer don't re-fire
  // for a server-down-but-network-up outage. This loop does, clearing the banner
  // as soon as a refresh lands (via the `onChange` → `resolveAuthEvent` path above).
  useAuthReconnect(auth, reconnecting);

  const sendMagicLink = useCallback(
    (email: string) =>
      auth
        ? auth.sendMagicLink({ email })
        : Promise.resolve({ error: "Auth not available" }),
    [auth],
  );
  const verifyCode = useCallback(
    (p: { email: string; code: string }) =>
      auth?.verifyCode
        ? auth.verifyCode(p)
        : Promise.resolve({ error: "Code sign-in not available" }),
    [auth],
  );
  const signInWithGoogle = useCallback(
    () =>
      auth?.signInWithGoogle
        ? auth.signInWithGoogle()
        : Promise.resolve({ error: "Google sign-in not available" }),
    [auth],
  );
  const signOut = useCallback(
    () => (auth ? auth.signOut() : Promise.resolve()),
    [auth],
  );

  return {
    user,
    loading,
    enabled: !!auth,
    reconnecting,
    sendMagicLink,
    codeSupported: !!auth?.verifyCode,
    linkFirst: !!auth?.linkFirst,
    verifyCode,
    googleSupported: !!auth?.signInWithGoogle,
    signInWithGoogle,
    signOut,
  };
}
