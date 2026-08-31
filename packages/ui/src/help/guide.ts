
import type { Messages } from "@openmasq/i18n";
import { BRAND } from "@openmasq/branding";

/**
 * THE in-app guide — the app explaining itself, in the user's language.
 *
 * Ce fichier ASSEMBLE : la COPIE vit dans le catalogue (`guide`), en français et en
 * anglais ; ici restent l'ORDRE des chapitres, leurs ids, et les drapeaux qui décident
 * quoi monter (`demo`, `sections`, `releases`) — de la structure, pas de la prose.
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
  /** Ce chapitre montre la DÉMONSTRATION du redaction (la même que le premier
   *  lancement). Un drapeau, pas un composant : `help/` reste du texte, et c'est le
   *  guide qui décide quoi monter. */
  demo?: true;
  /** Ce chapitre montre l'HISTORIQUE des versions publiées (les notes de l'équipe).
   *  Même règle que `demo` : un drapeau, le contenu vient d'ailleurs — ici du réseau,
   *  donc le guide masque le chapitre là où cette source n'existe pas. */
  releases?: true;
}

/**
 * L'ORDRE et la STRUCTURE des chapitres. Une langue ne réordonne pas un guide, et ne
 * décide pas qu'un chapitre montre la démonstration : ces trois drapeaux restent ici.
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

/** Les ids des chapitres, dans l'ordre — l'état initial du modal en a besoin AVANT
 *  d'avoir résolu la langue, et un id n'est pas de la copie. */
export const CHAPTER_IDS = CHAPTERS.map((c) => c.id);

/** Le guide dans la langue de `t`, le nom de marque injecté. */
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
