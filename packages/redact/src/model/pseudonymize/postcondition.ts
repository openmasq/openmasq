import type { RedactionMatch, Vault } from "../../types";
import { entityKey } from "../../util";

export const UNREVERSIBLE_ERROR = "redaction postcondition failed: a reported match was not vaulted";

/**
 * POSTCONDITION — "reported ⇒ vaulted ⇒ substituted". `matches` is what the UI shows as
 * redacted, what `redactedSpans` persists and what the privacy report counts; it is built
 * while gathering, BEFORE we know what actually got applied. A match that claims a
 * redaction which never happened tells the user a value is protected while it sits on
 * the wire. Reconciled here, at the single exit:
 *  - the placeholder is in `exclude` ⇒ the user turned that category off (or kept the
 *    value in clear). Not substituting is CORRECT, but it is not a redaction: drop the claim.
 *  - the placeholder restores ANOTHER CASING of the same entity (« McDonald » vaulted,
 *    « Mcdonald » now: `recaseLike` cannot spell the difference, so both land on one fake
 *    and the vault keeps the first). Reversible to the same identity — accepted ONLY when
 *    `text` no longer holds the value, i.e. the variant pass really substituted it.
 *  - anything else ⇒ UNREVERSIBLE and never substituted: fails CLOSED via `error`, which
 *    the send path turns into a refusal rather than a downgrade.
 * `uncertainKeys` re-attaches the surviving candidates' "to verify" flag by entity key
 * (the allocators don't thread it — the value is the join).
 */
export function reconcileMatches(
  matches: RedactionMatch[],
  ctx: { vault: Vault; exclude: Set<string>; text: string; uncertainKeys: Set<string> },
): { applied: RedactionMatch[]; error?: string } {
  const { vault, exclude, text, uncertainKeys } = ctx;
  const applied: RedactionMatch[] = [];
  let unreversible = false;
  for (const m of matches) {
    const restored = vault[m.placeholder];
    // `sameEntity` only matters when the vault restores something else — and its
    // `text.includes` is a scan of the whole text, so it is not paid per ordinary match.
    const sameEntity = () =>
      restored !== undefined && entityKey(restored) === entityKey(m.value) && !text.includes(m.value);
    if (restored !== m.value && !sameEntity()) {
      unreversible = true;
      continue;
    }
    if (exclude.has(m.placeholder)) continue;
    applied.push(uncertainKeys.has(entityKey(m.value)) ? { ...m, uncertain: true } : m);
  }
  return { applied, error: unreversible ? UNREVERSIBLE_ERROR : undefined };
}
