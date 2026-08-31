/**
 * The language itself — the Settings picker and its options.
 *
 * A SLICE of the contract (`../messages.ts`), which stays the only list of namespaces.
 * The split holds the 300-LOC cap (rule 1) — same shape as `packages/emails/i18n/`.
 */

/** The language itself — the Settings picker (« Compte » tab, Apparence
 *  section) and its options. It is the ONLY surface that must stay readable to
 *  someone who does NOT understand the displayed language: hence the endonyms below, and
 *  a hint that says how far the choice reaches. */
export interface LanguageMessages {
  /** Title of the language setting. */
  label: string;
  /** Subtitle: what the choice changes — and what it does not. */
  hint: string;
  /** The name of EACH language, rendered in ITS own language (« Français », « English ») —
   *  an endonym, never translated, hence identical in every catalogue. */
  names: { fr: string; en: string };
}
