/**
 * THE in-app GUIDE — the application explaining itself.
 *
 * ⚠️ Rule 8, at its peak: every assertion here is a PROMISE about where
 * someone's data goes. A sentence that over-sells the protection is a trust
 * bug, not a typo — and a translation that softens or hardens it is one
 * too. The ones that could silently become false are pinned by
 * `ui/src/help/guide.test.ts` against the real defaults, in EVERY language.
 *
 * ⚠️ Written under the public documentation's rules: plain language, for
 * l'utilisateur final. Aucun chemin de fichier, aucun nom de paquet, aucune architecture
 * internal, no acronym the interface never expands.
 *
 * The SECTION chapters are not here: they are rendered from `sections` (one single
 * home), so the guide cannot drift from the nav and the pages.
 *
 * A SLICE of the contract (`../messages.ts`), which stays the only list of namespaces.
 */
export interface GuideChapterCopy {
  title: (brand: string) => string;
  /** The opening paragraph — what it is, in two or three sentences. */
  lead: (brand: string) => string;
  /** Short, practical points. */
  points?: readonly ((brand: string) => string)[];
  /** Term → definition, for the glossary chapter. */
  terms?: readonly { term: (brand: string) => string; def: (brand: string) => string }[];
}

export interface GuideMessages {
  protection: GuideChapterCopy;
  firstMessage: GuideChapterCopy;
  models: GuideChapterCopy;
  sections: GuideChapterCopy;
  words: GuideChapterCopy;
  data: GuideChapterCopy;
  releases: GuideChapterCopy;
}
