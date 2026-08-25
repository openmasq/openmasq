import { formatReset } from "../../state/errors";

/**
 * When a REMAINING request quota is worth telling the user, and in what words.
 *
 * The counter rides every reply, so the cap can be announced while there is still room
 * to act — it used to be discovered at zero, in the middle of a turn, after six retries
 * (journal du 02/08/2026). Warning too early would be noise, so it stays quiet until the
 * end is genuinely near.
 */

/** Below this many remaining requests, say so whatever the cap. */
const NEAR_END = 5;
/** …and for a large cap, the last tenth is near enough to be worth a word. */
const NEAR_FRACTION = 0.1;

export function quotaNotice(left?: {
  remaining: number;
  limit?: number;
  resetAt?: number;
}): string | null {
  if (!left || left.remaining < 0) return null;
  const near = left.limit ? Math.max(NEAR_END, Math.floor(left.limit * NEAR_FRACTION)) : NEAR_END;
  if (left.remaining > near) return null;
  // Zero is its own sentence: the next send WILL be refused, and saying « il reste 0 »
  // reads as a countdown rather than as a wall the user is already against.
  const when = left.resetAt ? ` Elle repart ${formatReset(left.resetAt)}.` : "";
  if (left.remaining === 0) {
    return `Votre quota de requêtes sur ce modèle est épuisé.${when} Changez de modèle sous le message pour continuer.`;
  }
  const n = left.remaining;
  return (
    `Il vous reste ${n} requête${n > 1 ? "s" : ""} sur ce modèle` +
    `${left.limit ? ` (sur ${left.limit})` : ""}.${when} Passé cela, il faudra changer de modèle ou attendre.`
  );
}
