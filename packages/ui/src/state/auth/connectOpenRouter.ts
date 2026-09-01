import type { Host } from "../../host";

/**
 * « Connecter mon compte OpenRouter » — the OAuth PKCE flow, plus the one thing every
 * caller must not forget: **refreshing `keyConfigured` afterwards**. The key is minted
 * and stored in the MAIN process (it never crosses IPC), so the renderer only learns a
 * key now exists by re-asking — without the refresh the UI keeps saying « Aucun accès »
 * over a connection that worked.
 *
 * ONE home (rule 9) because there are two call sites — the onboarding and Réglages →
 * Modèles — and a copied closure is exactly where the missing refresh comes back.
 *
 * Returns `undefined` when the platform has no such flow (browser preview, mobile), so
 * the caller can simply not draw the button rather than offer a dead one.
 */
export function makeConnectOpenRouter(
  host: Host,
  refreshKeys: () => void,
): (() => Promise<boolean>) | undefined {
  const connect = host.keys?.connectOpenRouter;
  if (!connect) return undefined;
  return async () => {
    const ok = await connect();
    if (ok) refreshKeys();
    return ok;
  };
}
