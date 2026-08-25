import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { Host, OrgProfileInfo } from "../../host";
import { orgProfileKeyFor } from "../orgProfileCache";

/**
 * Loads the member's org authorization (extracted from `store.ts`, rule 1).
 * Refreshed on sign-in/out, retried with backoff on failure, and reloaded on
 * WINDOW FOCUS (throttled) : créer ou rejoindre une organisation passe par la
 * console WEB, donc le moment exact où l'adhésion existe est le retour dans
 * l'app — sans ce déclencheur, la carte « Créer une organisation » survivait à
 * l'adhésion jusqu'au redémarrage.
 *
 * ⚠️ A FAILED fetch means "we don't know", NOT "this user is solo". It used to
 * `setOrgProfile(null)`, which silently downgraded a member to an unmanaged
 * user for the whole session — no retry — defeating mandated categories, the
 * suspended-member block and the blocked-model list at once. Blocking the org
 * host was therefore enough to escape the policy. Keep whatever we last knew
 * (the adopt effect seeds it from the per-account cache) and try again.
 */
export function useOrgProfile({
  host,
  setOrgProfile,
  storageUidRef,
  userId,
}: {
  host: Host;
  setOrgProfile: Dispatch<SetStateAction<OrgProfileInfo | null>>;
  storageUidRef: MutableRefObject<string | null | undefined>;
  /** The RESOLVED account (undefined = not yet). A dep on purpose : l'effet
   *  d'ADOPTION de compte sème le profil depuis le cache du compte — qui peut
   *  être VIDE (membre tout neuf) — et ce seed écrasait un profil que le
   *  premier fetch venait de poser, sans que rien ne re-fetch avant un focus.
   *  En re-déclenchant le chargement au même commit que l'adoption, le fetch
   *  repart et REMPLACE le seed en se résolvant (le serveur est le seul
   *  écrivain) ; un changement de compte rapide est couvert par `alive`. */
  userId: string | null | undefined;
}): void {
  useEffect(() => {
    if (!host.org) return;
    let alive = true;
    const loadOrg = () => {
      host
        .org!.getProfile()
        .then((p) => {
          if (!alive) return;
          setOrgProfile(p);
          // Remember it: the server is the only thing allowed to change a
          // policy, and it just spoke. Cached per account so the NEXT cold
          // start applies this policy even if the org API is unreachable then.
          const k = orgProfileKeyFor(storageUidRef.current ?? null);
          try {
            if (k) localStorage.setItem(k, JSON.stringify(p));
          } catch {
            /* localStorage unavailable — memory-only for this session */
          }
        })
        .catch(() => {
          if (alive) scheduleOrgRetry();
        });
    };
    // Retry with backoff so a transient outage self-heals without a restart;
    // capped so a genuinely offline solo user isn't polling forever.
    let retries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const scheduleOrgRetry = () => {
      if (retries >= 4) return;
      const delay = 2000 * 2 ** retries++;
      timer = setTimeout(() => alive && loadOrg(), delay);
    };
    loadOrg();
    const off = host.auth?.onChange(() => {
      retries = 0;
      loadOrg();
    });
    let lastFocusLoad = 0;
    const onFocus = () => {
      const now = Date.now();
      if (now - lastFocusLoad < 15_000) return;
      lastFocusLoad = now;
      retries = 0;
      loadOrg();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      off?.();
      window.removeEventListener("focus", onFocus);
    };
  }, [host, setOrgProfile, storageUidRef, userId]);
}
