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
/* The money labels (subscription CTA, credits exhausted) live in the catalogue
   (`billing`): this file keeps only the RULE — the words the copy must no longer use —
   which `money.test.ts` enforces on the source. */

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
    // `d'appel` joins `de politesse`: they are the TWO terms of the letter, and they live
    // in the same sentence of the system prompt (« une formule d'appel, … une formule de
    // politesse »). Exempting only one caught the other — a false positive that pushes one
    // to rewrite a correct instruction, or worse to exempt the whole file and amnesty a
    // real « changez de formule » in the same move.
    /\b(?:la|le|les|une?|des|du|de|votre|vos|notre|nos|cette|ces|ma|sa|leur)\s+formules?\b(?!\s+(?:creuses?|d['’]appel|de\s+politesse|de\s+calcul|math[ée]matiques?|chimiques?))|\bformules?\s+(?:actuelles?|gratuites?|payantes?|sup[ée]rieures?|inf[ée]rieures?|premium|pro)\b/i,
};

/** The pattern the scan uses for `word` — the money-sense one when it has one. */
export function retiredMoneyPattern(word: string): RegExp {
  return RETIRED_MONEY_PATTERNS[word] ?? new RegExp(`\\b${word}`, "i");
}
