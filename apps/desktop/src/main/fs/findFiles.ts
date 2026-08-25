import { basename } from "node:path";
import { embedAvailable, embedTexts } from "../embed/client";
import { EMBED_MODEL_TAG, E5_PASSAGE_PREFIX, E5_QUERY_PREFIX } from "../embed/model";
import { FIND_TRUNCATED_MARKER } from "./protocol";
import { rankCandidates, type FindCandidate } from "./findRank";

/**
 * MAIN's half of `find_files`. The WORKER walks the granted subtree (it owns the gate
 * and the symlink rule); ranking happens HERE because the on-device embedder is a
 * main-process utilityProcess a plain-Node worker cannot reach — the same split as
 * `read_document` (see `./CLAUDE.md`).
 *
 * ⚠️ A filename is REAL user data. It goes to the BUNDLED on-device embedder and
 * nowhere else — never `../embeddings.ts`, the OpenAI-compatible network sibling
 * (`../embed/CLAUDE.md`). The query is real too: it arrives un-redacted because every
 * tool argument does (rule 11), and it is never logged.
 */

/** Vectors for filenames already embedded this session. Keyed by model tag + the exact
 *  passage text, so a re-export (`EMBED_MODEL_TAG` bump) can never serve stale vectors.
 *  In MEMORY only: a filename is user data and this cache is not a place to persist it. */
const vectorCache = new Map<string, number[]>();
const CACHE_MAX = 4000;

const cacheKey = (name: string): string => `${EMBED_MODEL_TAG}|${name}`;

/** Cosines of each candidate name against `query`, or `undefined` when the embedder is
 *  unavailable or fails — the caller then ranks lexically. Never throws: a missing
 *  bundle degrades the FEATURE, it must not break a filesystem tool. */
async function cosinesFor(
  names: readonly string[],
  query: string,
): Promise<number[] | undefined> {
  if (!embedAvailable() || !names.length) return undefined;
  try {
    const missing = [...new Set(names.filter((n) => !vectorCache.has(cacheKey(n))))];
    if (missing.length) {
      const vecs = await embedTexts(missing.map((n) => E5_PASSAGE_PREFIX + n));
      if (vecs.length !== missing.length) return undefined;
      missing.forEach((n, i) => vectorCache.set(cacheKey(n), vecs[i]));
      // Bounded: drop the oldest entries rather than growing without limit (a Map keeps
      // insertion order). A dropped vector costs one re-embed, never a wrong answer.
      if (vectorCache.size > CACHE_MAX) {
        const excess = vectorCache.size - CACHE_MAX / 2;
        for (const k of [...vectorCache.keys()].slice(0, excess)) vectorCache.delete(k);
      }
    }
    // e5 is trained ASYMMETRIC — the query carries its own prefix, and dropping it
    // measurably degrades the cosine (`../embed/CLAUDE.md`).
    const [q] = await embedTexts([E5_QUERY_PREFIX + query]);
    if (!q) return undefined;
    return names.map((n) => {
      const v = vectorCache.get(cacheKey(n));
      if (!v) return 0;
      // The worker L2-normalizes, so the dot product IS the cosine (`../embed/knn.ts`).
      let dot = 0;
      for (let d = 0; d < q.length; d++) dot += q[d] * v[d];
      return dot;
    });
  } catch {
    return undefined;
  }
}

/** Parse the worker's candidate list (one absolute path per line, plus the marker line
 *  when the walk hit its cap). Kept next to the producer's format on purpose. */
export function parseCandidates(raw: string): {
  candidates: FindCandidate[];
  truncated: boolean;
} {
  const lines = raw.split("\n").filter(Boolean);
  const truncated = lines[lines.length - 1] === FIND_TRUNCATED_MARKER;
  const paths = truncated ? lines.slice(0, -1) : lines;
  return { candidates: paths.map((p) => ({ path: p, name: basename(p) })), truncated };
}

/**
 * Rank the worker's candidates and render the tool result the model reads.
 *
 * The result deliberately says the list is ordered by PROXIMITY and is not a filtered
 * set of matches: the model cannot check — it only ever sees fake paths — so presenting
 * these AS the fiscal documents would put an assertion in its mouth that nothing
 * verified. (The user reads the reply UN-redacted, so the real filenames do reach the
 * person who can judge them.)
 */
export async function rankFindResults(raw: string, query: string, k = 10): Promise<string> {
  const { candidates, truncated } = parseCandidates(raw);
  if (!candidates.length) return "(aucun fichier dans ce périmètre)";

  const cos = await cosinesFor(candidates.map((c) => c.name), query);
  const ranked = rankCandidates(candidates, query, cos, k);
  const notes: string[] = [];
  if (!cos) {
    notes.push(
      "Appariement par MOTS seulement (moteur sémantique local indisponible) : un fichier " +
        "dont le nom emploie un autre vocabulaire n'est pas remonté.",
    );
  }
  if (truncated) {
    notes.push(
      `Le parcours s'est arrêté à ${candidates.length} entrées : l'arborescence est plus ` +
        "grande, le classement ne porte que sur cette partie.",
    );
  }
  if (!ranked.length) {
    return [
      `Aucun nom de fichier ne correspond à « ${query} » parmi ${candidates.length} entrées.`,
      ...notes,
    ].join("\n");
  }
  return [
    `${ranked.length} entrée(s) les plus PROCHES de « ${query} », de la plus proche à la ` +
      `moins proche, sur ${candidates.length} parcourue(s). Classement par proximité, pas ` +
      "une liste vérifiée. Pour LISTER ou proposer ces fichiers, réponds directement avec " +
      "cette liste — n'ouvre AUCUN fichier pour ça (pas de lecture ni de get_file_info en " +
      "série). N'ouvre un fichier que si la demande porte sur son CONTENU.",
    ...ranked.map((r) => r.path),
    ...notes,
  ].join("\n");
}
