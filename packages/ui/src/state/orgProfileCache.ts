/**
 * Le cache du PROFIL D'ORGANISATION — la clé par compte, et la relecture défensive.
 *
 * Sorti de `storePersistence.ts` en passant (règle 1 : ce fichier venait de franchir les
 * 300 lignes) et sorti LÀ précisément : `orgProfileCache.test.ts` existait déjà sans
 * module à lui. Une préoccupation, un foyer, son test à côté.
 */
// The last-known org profile, cached per ACCOUNT so a policy the member already has
// survives a restart while offline. It holds no secret — org name/slug, the forced
// redaction categories, blocked model/MCP ids, the caller's role + status.
//
// ⚠️ This is a SECURITY cache, not a perf one. `getProfile()` failing means "we don't
// know", NOT "this user is solo", and the two used to collapse into `orgProfile = null`
// — so an org API blip, an expired token, or a member simply blocking the host defeated
// every org control at once (mandated categories un-forced, a suspended member sending,
// a blocked model allowed) while the admin console still reported the policy enforced.
// The cache means the last policy we saw keeps applying until the server tells us
// otherwise. Pinned by `orgProfileCache.test.ts`.
export const ORG_PROFILE_KEY = "openmasq.orgProfile";
export const orgProfileKeyFor = (uid: string | null): string | null =>
  uid ? `${ORG_PROFILE_KEY}:${uid}` : null;

/**
 * Ne rendre un profil caché QUE s'il porte la forme courante — la liste d'AUTORISATION.
 *
 * Une version antérieure y écrivait une liste de REFUS (`blockedModelIds`). Relu tel quel
 * après mise à jour, un tel profil n'a pas de `allowedModelIds` : selon le lecteur il
 * plante, ou pire il autorise tout en ayant l'air d'une politique appliquée. On préfère
 * l'ignorer et laisser le prochain `getProfile()` réécrire — un cache qu'on ne sait plus
 * lire n'est pas une politique, c'est une supposition.
 */
export function readCachedOrgProfile<T extends { allowedModelIds?: unknown; allowedMcpIds?: unknown }>(
  raw: T | null,
): T | null {
  if (!raw) return null;
  return Array.isArray(raw.allowedModelIds) && Array.isArray(raw.allowedMcpIds) ? raw : null;
}
