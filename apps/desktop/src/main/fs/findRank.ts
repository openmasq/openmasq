import { isStopword } from "@openmasq/redact";

/**
 * The RANKING for `find_files`, pure and testable — the semantic matching runs
 * on-device, never in the model.
 *
 * Why here rather than model-side: the model sees ONLY fake paths
 * (`@openmasq/redact` `model/paths.ts`), so it can't pick a file by its
 * name. But that's not the real reason — even in the clear, it would have to guess a
 * SUBSTRING (`search_files`), and « documents fiscaux » shares no word with
 * « Dépôt des comptes annuels … INPI … ». The machine, on the other hand, sees both sides in
 * the clear: the query is de-redacted before the call (rule 11) and the names are on
 * disk. So IT is the one that must match. Same setup as `memory_search`.
 *
 * Two tiers, and lexical is NOT simply a degraded fallback of semantic:
 *  1. LEXICAL — a name that genuinely contains the sought word must always win.
 *  2. SEMANTIC — the e5 cosine, the only thing that catches a different vocabulary.
 *
 * ⚠️ **The e5 cosine can only be read in RELATIVE terms.** Its baseline between unrelated
 * texts sits at ~0.85 on the shipped q8 export (measured, cf. `../embed/knn.ts`), so an
 * absolute floor means nothing and a « 0.87 » is not relevance. We
 * renormalize WITHIN the batch of candidates: only the order carries signal.
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
