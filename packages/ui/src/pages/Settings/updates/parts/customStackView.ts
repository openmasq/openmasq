import type { SetCustomStackResult } from "../../../../host";

/** The refusal keys the catalogue knows how to phrase (`t.selfHost.refusal`). */
export type CustomStackRefusalKey =
  | "backend_required"
  | "not_absolute"
  | "not_https"
  | "userinfo"
  | "query_or_hash"
  | "supabase_pair"
  | "custom_not_allowed"
  | "custom_not_configured"
  | "declined"
  | "write_failed"
  | "generic";

const KNOWN = new Set<string>([
  "backend_required",
  "not_absolute",
  "not_https",
  "userinfo",
  "query_or_hash",
  "supabase_pair",
  "custom_not_allowed",
  "custom_not_configured",
  "declined",
  "write_failed",
]);

/**
 * The privileged process's refusal vocabulary → the key of the phrase to show.
 * Pure and tested: an `invalid` refusal carries the VALIDATION reason in `detail`
 * (`validateCustomStack`), the others are their own reason; the unknown case (a `null`
 * on an exception, an older preload) falls to the generic phrase — never silence.
 */
export function customStackRefusalKey(r: SetCustomStackResult | null | undefined): CustomStackRefusalKey {
  if (!r || r.ok) return "generic";
  const key = r.reason === "invalid" ? r.detail : r.reason;
  return key && KNOWN.has(key) ? (key as CustomStackRefusalKey) : "generic";
}
