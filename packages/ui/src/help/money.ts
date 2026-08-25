/**
 * THE vocabulary of money — one word per concept, and the shared CTA labels.
 *
 * Why this exists: the same paid product was called *forfait*, *abonnement*, *offre* and
 * *formule* depending on the screen, and the three buttons that open the SAME billing tab
 * were labelled three different ways (« Voir les forfaits », « Passer à une offre
 * supérieure », « Voir les offres ») — landing on a page titled « VOTRE FORMULE ». Nothing
 * was false, but on a paid product the vocabulary of money is exactly where doubt is
 * expensive: a user reasonably wonders whether a *forfait* and an *abonnement* are two
 * different things they might be paying for twice.
 *
 * The rule, enforced by `money.test.ts`:
 *  - **abonnement** — the recurring paid product. Never *forfait* / *formule* / *offre*.
 *  - **crédits** — the metered balance it grants.
 *  - **tokens** — the units a model bills, in usage/billing surfaces ONLY. « Jetons » is
 *    reserved for the REDACTION placeholders ([PERSON1], [IBAN]); the two used to collide
 *    as the same word in adjacent settings tabs, one of them about what you pay.
 */

/** One action — open the billing tab — so one label per intent, everywhere. */
export const BILLING_CTA = {
  /** No subscription yet (or just browsing what exists). */
  see: "Voir les abonnements",
  /** Has one, needs a bigger one. */
  upgrade: "Passer à un abonnement supérieur",
} as const;

/**
 * What the user reads when the month's included model usage runs out.
 *
 * ONE string, because there were TWO — the usage meter and the billing block each had
 * their own, and they had already drifted on the one point that matters (whether the
 * redaction keeps working). Both said « les modèles fournis par la plateforme sont
 * bloqués jusqu'au prochain cycle » : *plateforme*, *cycle* and *clés API* are our
 * words, not the user's, and « bloqués » reads as a punishment for a budget that simply
 * refills.
 *
 * ⚠️ Two claims here are load-bearing and must stay TRUE (root rule 8):
 *  - « le mois prochain » — the allotment is a MONTHLY budget (`packages/credits`).
 *    Nothing in `CreditBalance` carries a renewal DATE, so we must not name one.
 *  - « votre protection ne s'arrête pas » — the redaction is on-device and does not
 *    depend on the metered budget at all. If that ever stops being true, this sentence
 *    is the first thing to fix.
 */
export const CREDITS_EXHAUSTED = {
  title: "Vous avez utilisé tout ce qui est inclus ce mois-ci.",
  body:
    "Tout revient au début du mois prochain. En attendant, votre protection ne s'arrête pas, " +
    "et vos propres clés continuent de fonctionner.",
} as const;

/** Words that must not come back as synonyms of `abonnement` in user-facing copy.
 *  The test scans the UI source for them; add a word here, not an exception. */
export const RETIRED_MONEY_WORDS = ["forfait", "formule", "offre supérieure"] as const;

/**
 * How the scan RECOGNISES each retired word. `forfait` and `offre supérieure` say only
 * one thing, so the bare word is the pattern.
 *
 * `formule` does not: it is also a VERB (« formuler », « je formule ») and an ordinary
 * noun (« une formule creuse »). A bare-word scan flagged both, and the fix must not be a
 * file exemption — that would amnesty a real « changez de formule » landing in the same
 * file later. So we match the MONEY sense itself: the word carries a determiner
 * (« VOTRE FORMULE », « voir les formules », « changez de formule ») or a plan qualifier
 * (« formule gratuite »). A verb never does either. The lookahead then drops the handful
 * of noun senses that DO take a determiner and still mean nothing about money.
 */
export const RETIRED_MONEY_PATTERNS: Record<string, RegExp> = {
  formule:
    // `d'appel` rejoint `de politesse` : ce sont les DEUX termes de la lettre, et ils
    // vivent dans la même phrase du prompt système (« une formule d'appel, … une formule
    // de politesse »). N'en exempter qu'un attrapait l'autre — un faux positif qui pousse
    // à réécrire une consigne correcte, ou pire à exempter le fichier entier et à
    // amnistier du même coup un vrai « changez de formule ».
    /\b(?:la|le|les|une?|des|du|de|votre|vos|notre|nos|cette|ces|ma|sa|leur)\s+formules?\b(?!\s+(?:creuses?|d['’]appel|de\s+politesse|de\s+calcul|math[ée]matiques?|chimiques?))|\bformules?\s+(?:actuelles?|gratuites?|payantes?|sup[ée]rieures?|inf[ée]rieures?|premium|pro)\b/i,
};

/** The pattern the scan uses for `word` — the money-sense one when it has one. */
export function retiredMoneyPattern(word: string): RegExp {
  return RETIRED_MONEY_PATTERNS[word] ?? new RegExp(`\\b${word}`, "i");
}
