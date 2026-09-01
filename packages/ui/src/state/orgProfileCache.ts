/**
 * The ORGANIZATION PROFILE cache — the per-account key, and the defensive re-read.
 *
 * Pulled out of `storePersistence.ts` in passing (rule 1: this file had just crossed
 * 300 lines) and pulled out THERE precisely: `orgProfileCache.test.ts` already existed with no
 * module of its own. One concern, one home, its test right beside it.
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
 * Only return a cached profile IF it carries the current shape — the ALLOW-list.
 *
 * An earlier version wrote a DENY list there (`blockedModelIds`). Read back as-is
 * after an update, such a profile has no `allowedModelIds`: depending on the reader it
 * crashes, or worse it allows everything while looking like an enforced policy. We'd rather
 * ignore it and let the next `getProfile()` overwrite it — a cache we no longer know how to
 * read isn't a policy, it's a guess.
 */
export function readCachedOrgProfile<T extends { allowedModelIds?: unknown; allowedMcpIds?: unknown }>(
  raw: T | null,
): T | null {
  if (!raw) return null;
  return Array.isArray(raw.allowedModelIds) && Array.isArray(raw.allowedMcpIds) ? raw : null;
}
