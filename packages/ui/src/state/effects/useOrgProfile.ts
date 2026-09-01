import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { Host, OrgProfileInfo } from "../../host";
import { orgProfileKeyFor } from "../auth/orgProfileCache";

/**
 * Loads the member's org authorization (extracted from `store.ts`, rule 1).
 * Refreshed on sign-in/out, retried with backoff on failure, and reloaded on
 * WINDOW FOCUS (throttled): creating or joining an organization goes through the
 * web console, so the exact moment the membership exists is the return to the
 * app — without this trigger, the « Créer une organisation » card would survive
 * the membership until restart.
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
  /** The RESOLVED account (undefined = not yet). A dep on purpose: the account
   *  ADOPTION effect seeds the profile from the account's cache — which can
   *  be EMPTY (a brand new member) — and this seed used to overwrite a profile the
   *  first fetch had just set, with nothing re-fetching before a focus.
   *  By re-triggering the load in the same commit as the adoption, the fetch
   *  restarts and REPLACES the seed as it resolves (the server is the only
   *  writer); a fast account switch is covered by `alive`. */
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
