import { useEffect, useState } from "react";
import { useHost } from "../../host";

/**
 * Will the auth server answer a Google sign-in? `false` = confirmed off (the login
 * screen greys the button), `null` = unknown or not asked (the button stays as it is:
 * a click then gets the server's own answer).
 *
 * Asked HERE, by the one screen that draws the button, and not inside `useAuth`: that
 * hook is mounted by every surface that reads the session, and each mount would have
 * asked the server again. The answer is remembered for the process — a provider is
 * switched on in a dashboard, not between two renders.
 */
let remembered: boolean | null | undefined;

export function useGoogleEnabled(): boolean | null {
  const host = useHost();
  const [enabled, setEnabled] = useState<boolean | null>(remembered ?? null);
  useEffect(() => {
    const probe = host.auth?.googleEnabled;
    if (!probe || !host.auth?.signInWithGoogle || remembered !== undefined) return;
    let cancelled = false;
    probe
      .call(host.auth)
      .then((v) => {
        remembered = v;
        if (!cancelled) setEnabled(v);
      })
      .catch(() => !cancelled && setEnabled(null));
    return () => {
      cancelled = true;
    };
  }, [host]);
  return enabled;
}

/** Tests only: forget the remembered answer between cases. */
export function forgetGoogleEnabled(): void {
  remembered = undefined;
}
