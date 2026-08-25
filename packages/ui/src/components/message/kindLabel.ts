import { REDACTION_CATEGORIES } from "@openmasq/catalog/redaction";
import { redactionCategory } from "@openmasq/redact";

/**
 * The user-facing FRENCH name of a redaction kind, for copy the user reads.
 *
 * A mark carries its kind as the engine's own key (`company`, `national_id`) — the
 * vocabulary of the code, not of the product. Rendering it raw put « Unredact tous les
 * « company » » in a French interface. The labels live in `@openmasq/catalog` (one home,
 * shared with the rules screen and the admin console), so this only resolves against them.
 *
 * A FINE kind normalises to its coarse category first (`company_id` → « Identifiants
 * d'entreprise »), and anything unknown falls back to the neutral « élément » rather than
 * to a key: an unrecognised string in the copy is the bug this exists to close.
 */
const LABEL_BY_KEY = new Map(REDACTION_CATEGORIES.map((c) => [c.key as string, c.label]));

export const NEUTRAL_KIND_LABEL = "élément";

/** Words that make `redactionCategory`'s `secret` answer a real ANSWER rather than its
 *  default — see below. */
const SAYS_SECRET = /secret|key|token|password|credential|clé/i;

export function kindLabelFr(kind: string | undefined | null): string {
  const raw = (kind ?? "").trim();
  if (!raw) return NEUTRAL_KIND_LABEL;
  const direct = LABEL_BY_KEY.get(raw.toLowerCase());
  if (direct) return direct;
  const coarse = redactionCategory(raw);
  // ⚠️ `secret` is ALSO `redactionCategory`'s fallback for anything it doesn't recognise,
  // so an unknown kind would be presented as « Clés & secrets » — a confident wrong answer
  // about what a value IS. Accept that category only when the kind itself says so.
  if (coarse === "secret" && !SAYS_SECRET.test(raw)) return NEUTRAL_KIND_LABEL;
  return LABEL_BY_KEY.get(coarse) ?? NEUTRAL_KIND_LABEL;
}
