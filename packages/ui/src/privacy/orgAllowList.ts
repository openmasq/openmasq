import { connectorIdFromInstance } from "@openmasq/catalog/mcp";

/**
 * The "does this organization allow this connector?" decision, in ONE place.
 *
 * It lives here and not in the agent nor in settings because BOTH used to make it,
 * each with its own identifier normalization — and they had already diverged:
 * settings did not know about multi-account instances (`gmail--a1b2`), so a
 * refused connector stayed unlocked as soon as it carried a second account. A
 * behaviour copied "to keep the same shape" is the same bug with more surface
 * (rule 9): the legitimate point of variation is what you DO with a refusal, not how
 * you compute it.
 *
 * ⚠️ ALLOW-list semantics, and the two absences don't say the same
 * thing: `undefined` = no organization (solo account, everything is permitted); `[]` = a
 * managed account whose organization has not opened anything yet, so NOTHING is permitted. Reading the two
 * the same way turns the allow-list into a deny-list, which rule 7 forbids.
 */
export function isConnectorAllowed(id: string | undefined, allowedIds: string[] | undefined): boolean {
  if (!allowedIds) return true; // no organization
  if (!id) return false; // an unknown identifier is never allowed
  const allowed = new Set(allowedIds);
  // A live server announces itself as `broker-<id>` / `local-<id>`; a
  // multi-account instance as `<id>--<hash>`. The policy itself is written in catalogue ids.
  const bare = id.replace(/^(broker|local)-/, "");
  return (
    allowed.has(id) ||
    allowed.has(bare) ||
    allowed.has(connectorIdFromInstance(id)) ||
    allowed.has(connectorIdFromInstance(bare))
  );
}

/** The mirror for models. Same absent/empty distinction, same reason. */
export function isModelAllowed(id: string | undefined, allowedIds: string[] | undefined): boolean {
  if (!allowedIds) return true;
  return !!id && allowedIds.includes(id);
}
