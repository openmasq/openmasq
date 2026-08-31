import { BANK_OP_CODES } from "../vocab/vie";

/**
 * The edges of a detected span, without the punctuation surrounding it.
 *
 * ⚠️ This isn't cosmetic. A badly bounded span keeps a comma or a period — and the
 * value then stops being ITSELF for everything that compares strings: the
 * notoriety list (measured: « Github » is in it, « Github, » isn't — so the brand was going out
 * redacted), `keep`, the Vault, the generic-terms list. The punctuation also becomes
 * the first character of the FAKE, which the model then reads back as one word.
 *
 * INTERNAL hyphens and apostrophes are preserved (« Jean-Claude », « L'Oréal »): only
 * the edges are trimmed. ⚠️ PARENTHESES are NOT: they carry meaning in a
 * place+code composite (« ST OUEN (93400) »), and trimming them broke restoring the
 * city alone — `placeAliases.test.ts` caught it. A value that is entirely punctuation is
 * returned as-is rather than emptied: the next filter will handle it.
 */
export function trimSpanEdges(value: string): string {
  // Re-trim AFTER: « Paris » leaves the spaces the quotes were hiding.
  const t = value.trim().replace(/^[.,;:!?…"'«»“”‘’]+|[.,;:!?…"'«»“”‘’]+$/gu, "").trim();
  return t || value.trim();
}

/**
 * A CIVIL-STATUS MARKER glued at the head of a NAME span by the detector
 * (« née de La Roncheraye », « épouse N'Dranoh », « veuve Morvan ») is not a
 * first name: treated as a name token, it got its own fake and the civil status
 * DISAPPEARED from the wire — « née de La Roncheraye » became « sidonie de La
 * Guilbaud », which the model reads back as ANOTHER person in apposition (trap #2
 * of the notary persona, the unfaithful deed). The marker is stripped — it stays VERBATIM
 * in the text — and the rest of the span joins the ordinary identity machinery, which
 * can then reuse the family's canonical fake. Same family of move as
 * `stripLeadingArticle` for organizations.
 *
 * Deliberately narrow: WHOLE words, at the head only, and never to the point of emptying the span.
 */
/**
 * ⚠️ A PARENTHESIS CARRYING AN EMAIL ADDRESS IS EXCLUDED FROM THE SPAN — and it's a LEAK being
 * closed, not a courtesy.
 *
 * Measured on 15/08/2026: « Taavi Remmel (taavi.remmel@exemple.ee) » is detected as ONE
 * NAME span, parenthesis included (they're deliberately spared, for the
 * « ST OUEN (93400) » composite). The fake then becomes « Hortense Fressineau
 * (taavi.remmel@exemple.ee) »: **the real address goes out in clear**, inside the fake,
 * and the model reads it as the invented person's. The « Name (email) » form is
 * the idiom of contact lists, meeting notes and CRM exports — so not a lab-only
 * case.
 *
 * Excluded from the span, the email is detected ON ITS OWN and gets a fake derived from the fake name
 * (checked: « Taavi Remmel, e-mail taavi.remmel@… » already gives « Hilaire Mabille,
 * hilaire.mabille@… »). So the trimming can't lose anything.
 *
 * Deliberately narrow: it needs an « @ » INSIDE the final parenthesis. The place+code
 * composite (digits) and an ordinary parenthesis (« (bureau 12) ») don't move.
 */
const TRAILING_EMAIL_PAREN = /\s*[(\[][^()\[\]]*@[^()\[\]]*[)\]]\s*$/u;

export function stripTrailingEmailParen(value: string): string {
  const cut = value.replace(TRAILING_EMAIL_PAREN, "").trim();
  // Never to the point of emptying: a value that IS ONLY the parenthesis is left to the
  // following gates, same as for civil status.
  return /\p{L}/u.test(cut) ? cut : value;
}

/**
 * A bank OPERATION CODE glued at the head of a span (« VIR SARL REBOUR », « CHQ 4412
 * REBOUR ») doesn't belong to the entity: it's the statement's "type" column.
 *
 * Measured on 15/08/2026 on a general ledger: « VIR Rebour » was detected as ONE
 * organization and became « VOXA Group », while « REBOUR » alone became
 * « VANTEL » — so the SAME supplier carried two fakes (the model reads two
 * companies), and the operation type disappeared from the wire. Stripped, the remainder joins
 * the identity machinery, which gives back ONE fake for every form.
 *
 * Same move as `stripCivilStatusPrefix`: WHOLE words, at the head only, repeated (a
 * statement writes « VIR PRLV » on adjustments), and never to the point of emptying the span.
 * The list lives in `../vocab/vie.ts` (rule 9) — the same word already serves there to prevent a
 * code ALONE from becoming an entity.
 */
const BANK_OP_PREFIX = new RegExp(`^(?:${BANK_OP_CODES.join("|")})[\\s.:-]+`, "iu");

export function stripBankOpPrefix(value: string): string {
  let v = value;
  for (;;) {
    const next = v.replace(BANK_OP_PREFIX, "");
    if (next === v) break;
    if (!/\p{L}/u.test(next)) return value; // never empty out
    v = next;
  }
  return v.trim() || value;
}

const CIVIL_STATUS_PREFIX = /^(?:n[ée]e?|épouse|veuve?|veuf|dite?)\s+/iu;

export function stripCivilStatusPrefix(value: string): string {
  let v = value;
  // Repeated: « épouse née X » shows up on transcribed deeds.
  for (;;) {
    const next = v.replace(CIVIL_STATUS_PREFIX, "");
    if (next === v) break;
    // Never empty out: a span that IS ONLY a marker isn't a name, but
    // judging that is the next gates' job — we return the value intact.
    if (!/\p{L}/u.test(next)) return value;
    v = next;
  }
  return v;
}
