import type { Conversation } from "../types";

/**
 * « Comprendre mon masquage » — the small container under the FIRST answers, which
 * opens the redaction chapter of the guide (`help/guide.ts`, chapter `protection`).
 *
 * What it covers that the transparency card does NOT: the subtleties that stay invisible
 * in a given conversation — public figures left in the clear, the counter at zero for a
 * conversation WITHOUT any personal data (precisely the case where the transparency card
 * never shows itself), the Vault for code names. The transparency card shows a proof;
 * this one teaches the rules.
 *
 * Two decisions, and their reasons:
 *
 *  - **It waits for the first answer to ARRIVE.** Before that nothing has left: offering
 *    to « expliquer mon masquage » points at nothing yet, and the welcome screen already
 *    has its onboarding.
 *  - **« Fermer pour toujours » is global and final** (`Settings.redactionIntroSeen`,
 *    never a component state — otherwise it comes back on the next mount, the lesson of
 *    the neighbouring cards). Final because this knowledge stays reachable elsewhere: the
 *    SAME chapter lives in Help. A reminder coming back « au cas où » is the noise the
 *    user learns to get rid of.
 */
export function shouldShowRedactionIntro(
  conv: Conversation | null | undefined,
  seen: boolean | undefined,
): boolean {
  if (!conv || seen) return false;
  return (conv.messages ?? []).some((m) => m.role === "assistant" && !m.pending);
}
