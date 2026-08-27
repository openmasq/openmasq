import { BRAND } from "@openmasq/branding";
import type { OrgProfile } from "@openmasq/sync";

// Last-known-good org profile in localStorage, so the Organisation tab +
// enforcement survive a backend outage instead of collapsing to solo. @openmasq/
// sync reads/writes it via the `orgCache` option: it returns the cached value when
// the backend is UNREACHABLE, and CLEARS it on a reachable "no org" / sign-out.
// ⚠️ SCOPÉ AU COMPTE. La clé était nue (`<slug>:org-profile`) : sur une machine
// partagée, le compte B héritait de la politique du compte A dès que sa propre lecture
// échouait — donc de contraintes qui ne le concernent pas, ou de l'absence des siennes
// (audit 14/08). `setOrgCacheUser` est appelée aux mêmes moments que `keys.setUser` /
// `db.setUser` : la portée d'un compte est une seule opération.
const ORG_PROFILE_KEY = `${BRAND.slug}:org-profile`;
let orgCacheUid: string | null = null;
const orgKey = (): string | null => (orgCacheUid ? `${ORG_PROFILE_KEY}:${orgCacheUid}` : null);

/** Re-scoper le cache de politique sur le compte connecté (`null` = déconnecté). */
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
      if (!k) return; // déconnecté : rien à mémoriser pour personne
      if (profile) localStorage.setItem(k, JSON.stringify(profile));
      else localStorage.removeItem(k);
    } catch {
      /* localStorage unavailable — the cache is best-effort. */
    }
  },
};
