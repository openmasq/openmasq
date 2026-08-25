import { isStopword } from "@openmasq/redact";

/**
 * Le CLASSEMENT de `find_files`, pur et testable — l'appariement sémantique tourne
 * sur l'appareil, jamais dans le modèle.
 *
 * Pourquoi ici plutôt que côté modèle : le modèle ne voit QUE des chemins faux
 * (`@openmasq/redact` `model/paths.ts`), donc il ne peut pas choisir un fichier sur
 * son nom. Mais ce n'est pas la vraie raison — même en clair, il devait deviner une
 * SOUS-CHAÎNE (`search_files`), et « documents fiscaux » ne partage aucun mot avec
 * « Dépôt des comptes annuels … INPI … ». La machine, elle, voit les deux côtés en
 * clair : la requête est un-redacted avant l'appel (règle 11) et les noms sont sur
 * le disque. C'est donc ELLE qui doit apparier. Même montage que `memory_search`.
 *
 * Deux étages, et le lexical n'est PAS un simple dégradé du sémantique :
 *  1. LEXICAL — un nom qui contient vraiment le mot cherché doit gagner, toujours.
 *  2. SÉMANTIQUE — le cosinus e5, qui seul rattrape un vocabulaire différent.
 *
 * ⚠️ **Le cosinus e5 ne se lit qu'en RELATIF.** Sa ligne de base entre textes sans
 * rapport vaut ~0.85 sur l'export q8 livré (mesuré, cf. `../embed/knn.ts`), donc un
 * plancher absolu ne veut rien dire et un « 0.87 » n'est pas une pertinence. On
 * renormalise DANS le lot de candidats : seul l'ordre est porteur.
 */

export interface FindCandidate {
  /** Absolute REAL path (post-`grant.resolve`). */
  path: string;
  /** The basename — what the query is matched against. */
  name: string;
}

export interface RankedFind {
  path: string;
  score: number;
}

/** Lowercase + strip diacritics, so « Dépôt » matches « depot ». */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** Split on anything that is not a letter or a digit (a filename separates on
 *  `_ - . space` and camel boundaries are not worth the false splits). */
export function splitWords(text: string): string[] {
  return fold(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/**
 * Words that FRAME a search instead of describing what is sought. They match half a
 * disk, so a name containing one would outrank the semantically-right file —
 * « Documents divers.pdf » beating « Dépôt des comptes annuels » on the query
 * « documents fiscaux ». Dropped from the LEXICAL side only: the embedding still
 * receives the WHOLE query, where they legitimately shape the meaning.
 *
 * ⚠️ **This is NOT `@openmasq/redact`'s `isGenericTerm`, and must not be replaced by
 * it.** That list answers a different question — « ce mot n'est pas du PII » — and it
 * therefore covers exactly the document vocabulary a file search RUNS on: `fiscal`,
 * `comptes`, `annuel`, `bail`, `facture`, `bilan` are all generic there. Filtering on
 * it deleted the only useful word in « documents fiscaux ». Two questions, two lists;
 * the overlap is a coincidence, not a shared fact (root rule 9 cuts both ways).
 * `isStopword` IS reused — a function word is a function word in both readings.
 */
const QUERY_FRAMING = new Set([
  "liste", "lister", "trouve", "trouver", "cherche", "chercher", "recherche",
  "montre", "montrer", "donne", "donner", "affiche", "afficher", "retrouve",
  "document", "documents", "fichier", "fichiers", "dossier", "dossiers",
  "tous", "toutes", "tout", "quels", "quelles", "quel", "quelle",
  "list", "find", "search", "show", "file", "files", "folder", "folders",
]);

/** The query words worth matching LITERALLY (see {@link QUERY_FRAMING}). */
export function queryTerms(query: string): string[] {
  return splitWords(query).filter(
    (w) => w.length >= 3 && !isStopword(w) && !QUERY_FRAMING.has(w),
  );
}

/** Fraction of the query's distinctive terms present in `name`, in [0, 1]. */
export function lexicalScore(terms: string[], name: string): number {
  if (!terms.length) return 0;
  const hay = fold(name);
  let hits = 0;
  for (const t of terms) if (hay.includes(t)) hits++;
  return hits / terms.length;
}

/** Rescale cosines to [0, 1] WITHIN the batch — see the ⚠️ above: only the order is
 *  meaningful, so the batch is the only frame that means anything. A flat batch
 *  (every candidate equal) carries no signal and scores 0 throughout. */
export function relativeCosines(cosines: readonly number[]): number[] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const c of cosines) {
    if (c < lo) lo = c;
    if (c > hi) hi = c;
  }
  const span = hi - lo;
  if (!Number.isFinite(span) || span <= 1e-6) return cosines.map(() => 0);
  return cosines.map((c) => (c - lo) / span);
}

/**
 * Rank candidates for `query`. `cosines` is aligned with `candidates` and ABSENT when
 * the on-device embedder isn't available — the lexical tier then stands alone (the
 * embedder degrades a feature, never a guarantee: `../embed/CLAUDE.md`).
 *
 * A literal hit always outranks a purely semantic one (the `0.5 +` band), because a
 * user who types a word that IS in the filename means that file.
 */
export function rankCandidates(
  candidates: readonly FindCandidate[],
  query: string,
  cosines?: readonly number[],
  k = 10,
): RankedFind[] {
  const terms = queryTerms(query);
  const rel =
    cosines && cosines.length === candidates.length ? relativeCosines(cosines) : undefined;
  const scored = candidates.map((c, i) => {
    const lex = lexicalScore(terms, c.name);
    const sem = rel ? rel[i] : 0;
    return { path: c.path, score: lex > 0 ? 0.5 + 0.5 * lex : 0.5 * sem };
  });
  // Stable within equal scores: the walk order is the on-disk order, which is a more
  // useful tie-break than an arbitrary re-shuffle.
  return scored
    .map((s, i) => ({ s, i }))
    .sort((a, b) => b.s.score - a.s.score || a.i - b.i)
    .slice(0, k)
    .map(({ s }) => s)
    .filter((s) => s.score > 0);
}
