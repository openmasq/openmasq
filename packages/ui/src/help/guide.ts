
import type { Messages } from "@openmasq/i18n";
import { BRAND } from "@openmasq/branding";

/**
 * THE in-app guide — the app explaining itself, in the user's language.
 *
 * This file ASSEMBLES: the COPY lives in the catalogue (`guide`), in French and in
 * English; what stays here is the ORDER of the chapters, their ids, and the flags that
 * decide what to mount (`demo`, `sections`, `releases`) — structure, not prose.
 *
 * Written under the same rules as the public documentation (root rule 8): plain language,
 * for the end user. No file paths, no package names, no internal architecture, no
 * acronyms the UI never expands. And above all **accurate**: every claim here is a
 * promise about where someone's data goes, so a sentence that overstates the protection
 * is a trust bug, not a copy nit. The claims that could silently become false are pinned
 * by `guide.test.ts` against the real defaults.
 *
 * Section chapters are RENDERED from `SECTION_GUIDE`, never re-described here — one
 * vocabulary, so the guide cannot drift from the nav and the pages.
 */

export interface GuideChapter {
  id: string;
  title: string;
  /** The opening paragraph — what this is, in two or three sentences. */
  lead: string;
  /** Short practical points. Optional. */
  points?: readonly string[];
  /** Term → definition. Used by the lexicon chapter. */
  terms?: readonly { term: string; def: string }[];
  /** Render the six sections here (label + `guide`), from the single source. */
  sections?: boolean;
  /** This chapter shows the redaction DEMONSTRATION (the same one as first launch).
   *  A flag, not a component: `help/` stays text, and it is the guide that decides
   *  what to mount. */
  demo?: true;
  /** This chapter shows the HISTORY of the published versions (the team's notes).
   *  Same rule as `demo`: a flag, the content comes from elsewhere — here from the
   *  network, so the guide hides the chapter where that source does not exist. */
  releases?: true;
}

/**
 * The ORDER and the STRUCTURE of the chapters. A language does not reorder a guide, and
 * does not decide that a chapter shows the demonstration: these three flags stay here.
 */
const CHAPTERS: {
  id: string;
  key: keyof Messages["guide"];
  demo?: true;
  sections?: true;
  releases?: true;
}[] = [
  { id: "protection", key: "protection", demo: true },
  { id: "premier-message", key: "firstMessage" },
  { id: "modeles", key: "models" },
  { id: "sections", key: "sections", sections: true },
  { id: "mots", key: "words" },
  { id: "donnees", key: "data" },
  { id: "nouveautes", key: "releases", releases: true },
];

/** The chapter ids, in order — the modal's initial state needs them BEFORE the language
 *  has been resolved, and an id is not copy. */
export const CHAPTER_IDS = CHAPTERS.map((c) => c.id);

/** The guide in `t`'s language, with the brand name injected. */
export function guideChapters(t: Messages): readonly GuideChapter[] {
  const b = BRAND.name;
  return CHAPTERS.map(({ id, key, ...flags }) => {
    const c = t.guide[key];
    return {
      id,
      ...flags,
      title: c.title(b),
      lead: c.lead(b),
      ...(c.points ? { points: c.points.map((p) => p(b)) } : {}),
      ...(c.terms ? { terms: c.terms.map((x) => ({ term: x.term(b), def: x.def(b) })) } : {}),
    };
  });
}
