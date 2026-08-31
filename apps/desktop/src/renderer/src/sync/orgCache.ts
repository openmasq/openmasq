import { BRAND } from "@openmasq/branding";
import type { OrgProfile } from "@openmasq/sync";

// Last-known-good org profile in localStorage, so the Organisation tab +
// enforcement survive a backend outage instead of collapsing to solo. @openmasq/
// sync reads/writes it via the `orgCache` option: it returns the cached value when
// the backend is UNREACHABLE, and CLEARS it on a reachable "no org" / sign-out.
// ⚠️ SCOPED TO THE ACCOUNT. The key used to be bare (`<slug>:org-profile`): on a
// shared machine, account B would inherit account A's policy as soon as its own read
// failed — so constraints that don't concern it, or the absence of its own
// (14/08 audit). `setOrgCacheUser` is called at the same moments as `keys.setUser` /
// `db.setUser`: an account's scoping is a single operation.
const ORG_PROFILE_KEY = `${BRAND.slug}:org-profile`;
let orgCacheUid: string | null = null;
const orgKey = (): string | null => (orgCacheUid ? `${ORG_PROFILE_KEY}:${orgCacheUid}` : null);

/** Re-scope the policy cache onto the signed-in account (`null` = signed out). */
export function setOrgCacheUser(uid: string | null): void {
  orgCacheUid = uid;
}

export const orgCache = {
  get(): OrgProfile | null {
    try {
      const k = orgKey();
      const raw = k ? localStorage.getItem(k) : null;
      return raw ? (JSON.parse(raw) as OrgProfile) : null;
    } catch {
      return null;
    }
  },
  set(profile: OrgProfile | null) {
    try {
      const k = orgKey();
      if (!k) return; // signed out: nothing to remember for anyone
      if (profile) localStorage.setItem(k, JSON.stringify(profile));
      else localStorage.removeItem(k);
    } catch {
      /* localStorage unavailable — the cache is best-effort. */
    }
  },
};
