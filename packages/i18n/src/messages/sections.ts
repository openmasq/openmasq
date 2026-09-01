/**
 * The vocabulary of the content sections, assembled by `ui/src/help/sections.ts`.
 *
 * A SLICE of the contract (`../messages.ts`), which stays the only list of namespaces.
 * The split holds the 300-LOC cap (rule 1) — same shape as `packages/emails/i18n/`.
 */

/**
 * The content sections' VOCABULARY — label, rail tooltip, page subtitle,
 * guide paragraph, and the words one TYPES to find them from ⌘K. Five
 * strings describing the same thing to the same person: they live together
 * (rule 9), and `ui/src/help/sections.ts` assembles them.
 *
 * ⚠️ `tip` follows the « Label — what it is for » shape IN EVERY LANGUAGE. The
 * first launch derives its short sentence from it by cutting at the EM DASH
 * (`sectionOneLiner`), and `sections.test.ts` pins it: a plain hyphen, or a `tip`
 * that does not start with its label, breaks the test — not the display, which would be
 * pire.
 *
 * ⚠️ `keywords` is not prose: it is a space-separated list of words,
 * folded without accents before comparison. Put the real alternatives in it (the other
 * language's word, the thing it contains), never a thesaurus.
 */
export interface SectionsMessages {
  chats: { label: string; tip: string; guide: (brand: string) => string; keywords: string };
  library: { label: string; tip: string; subtitle: string; guide: string; keywords: string };
  skills: { label: string; tip: string; subtitle: string; guide: string; keywords: string };
  memory: {
    label: string;
    tip: (brand: string) => string;
    subtitle: (brand: string) => string;
    guide: string;
    keywords: string;
  };
  vault: {
    label: string;
    tip: string;
    subtitle: string;
    guide: (brand: string) => string;
    keywords: string;
  };
  /** The ⌘K's pseudo-destination « Aide » — not a section, but it is searched from
   *  the same list and must therefore be translated with it. */
  helpEntry: { title: (brand: string) => string; sub: (brand: string) => string; keywords: string };
}
