import type { Messages } from "@openmasq/i18n";
import { redactionCategory } from "@openmasq/redact";

/**
 * The user-facing name of a redaction kind, in the reader's language.
 *
 * A mark carries its kind as the engine's own key (`company`, `national_id`) — the
 * vocabulary of the code, not of the product. Rendering it raw put « Démasquer tous les
 * « company » » in a French interface. The words live in `@openmasq/i18n`
 * (`redactionCatalog.categories`, one home shared with the rules screen), so this only
 * resolves against them — the CATEGORY set still comes from `@openmasq/catalog`.
 *
 * A FINE kind normalises to its coarse category first (`company_id` → « Identifiants
 * d'entreprise »), and anything unknown falls back to the neutral « élément » rather than
 * to a key: an unrecognised string in the copy is the bug this exists to close.
 */

/** Words that make `redactionCategory`'s `secret` answer a real ANSWER rather than its
 *  default — see below. */
const SAYS_SECRET = /secret|key|token|password|credential|clé/i;

export function kindLabel(kind: string | undefined | null, t: Messages): string {
  const labels = t.redactionCatalog.categories;
  const neutral = t.redactionCatalog.neutralKind;
  const raw = (kind ?? "").trim();
  if (!raw) return neutral;
  const direct = labels[raw.toLowerCase()]?.label;
  if (direct) return direct;
  const coarse = redactionCategory(raw);
  // ⚠️ `secret` is ALSO `redactionCategory`'s fallback for anything it doesn't recognise,
  // so an unknown kind would be presented as « Clés & secrets » — a confident wrong answer
  // about what a value IS. Accept that category only when the kind itself says so.
  if (coarse === "secret" && !SAYS_SECRET.test(raw)) return neutral;
  return labels[coarse]?.label ?? neutral;
}
