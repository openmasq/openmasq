import type { SetCustomStackResult } from "../../../../host";

/** Les clés de refus que le catalogue sait dire (`t.selfHost.refusal`). */
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
 * Le vocabulaire de refus du processus privilégié → la clé de la phrase à montrer.
 * Pur et testé : un refus `invalid` porte la raison de VALIDATION dans `detail`
 * (`validateCustomStack`), les autres sont eux-mêmes leur raison ; l'inconnu (un `null`
 * sur une exception, un preload d'avant) tombe sur la phrase générique — jamais un silence.
 */
export function customStackRefusalKey(r: SetCustomStackResult | null | undefined): CustomStackRefusalKey {
  if (!r || r.ok) return "generic";
  const key = r.reason === "invalid" ? r.detail : r.reason;
  return key && KNOWN.has(key) ? (key as CustomStackRefusalKey) : "generic";
}
