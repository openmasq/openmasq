// Pure run-aggregation for the local NER — the half of `ner.ts` with NO inference deps,
// split out for the 300-LOC cap (root rule 1). Re-merges a token-classification "none"
// per-token stream into whole-entity runs, and locates a run verbatim in the source text.
// The WHY of the "none"+mergeRuns choice (vs "simple") is documented on `mergeRuns` and
// pinned by `ner.test.ts`.

import { escapeRegExp } from "../util";

/** One raw prediction from a token-classification pipeline (transformers.js). */
export interface RawNerEntity {
  entity_group?: string;
  entity?: string;
  score?: number;
  word?: string;
  start?: number | null;
  end?: number | null;
  /** Sequential TOKEN position — present in `aggregation_strategy: "none"` output. Lets us
   *  re-merge subwords the model over-split (see `mergeRuns`). Absent on injected mocks. */
  index?: number;
}

/** Strip WordPiece / SentencePiece / BPE subword markers from an aggregated word. */
function cleanWord(word: string): string {
  return word
    .replace(/^##/, "")
    .replace(/^▁/, "")
    .replace(/^Ġ/, "")
    .replace(/##/g, "")
    .trim();
}

/** Coarse entity type from a token label ("B-PER"/"I-PER" → "PER"). */
function nerCoarse(entity: string): string {
  return entity.replace(/^[BI]-/, "");
}

/** An entity re-merged from consecutive same-type subword tokens. */
interface EntityRun {
  label: string;
  /** The subword texts, in order (each markers-stripped). */
  subwords: string[];
  score: number;
}

/**
 * Re-merge a token-classification "none" (per-token) stream into whole-entity RUNS.
 *
 * WHY, not just `aggregation_strategy: "simple"`: the cased NER models over-emit `B-`
 * on the SUBWORDS of one wrapped/fragmented word — e.g. "Nathalie" tokenises to
 * Na·tha·lie and the model tags each `B-PER`, so "simple" (which starts a NEW entity on
 * every `B-`) SPLITS it into "Na" / "thalie…", and the short fragments are then dropped.
 * We instead group by CONSECUTIVE token `index`, IGNORING the B/I distinction, so all the
 * subwords of a word (and an adjacent multi-word name) form ONE run; a gap in `index`
 * (an `O` token in between) breaks the run. Injected mocks carry no `index` (they emit
 * pre-aggregated words) → each entity stays its own run, so behaviour there is unchanged.
 *
 * ⚠️ A `##` WordPiece CONTINUATION is the SAME orthographic word as the token before it, so
 * it is absorbed into the current run WHATEVER its own label — even `O`, even a DIFFERENT
 * entity type. The cased model routinely splits one rare proper noun into subwords it then
 * tags inconsistently — a one-letter lead tagged `PER`, its `##` tail coming back `ORG`, or
 * plain `O`. The old label-break shed those as sub-3-char fragments and the whole word was
 * LOST. Absorbing the continuation reconstructs the word; the run's label is the
 * score-weighted majority of its TAGGED subwords (`_votes`), so a lead `PER` at 0.79 beats a
 * tail `ORG` at 0.71 and the span reads NAME, instead of a dropped 3-char fragment.
 */
export function mergeRuns(list: RawNerEntity[]): EntityRun[] {
  type Run = EntityRun & { _last: number | null; _sum: number; _n: number; _votes: Record<string, number> };
  const runs: Run[] = [];
  let cur: Run | null = null;
  const vote = (r: Run, label: string, sc: number) => {
    if (label && label !== "O") r._votes[label] = (r._votes[label] ?? 0) + sc;
  };
  for (const e of list) {
    const raw = String(e.word ?? "");
    const isCont = raw.startsWith("##"); // WordPiece continuation of the previous token's word
    const label = nerCoarse(String(e.entity_group ?? e.entity ?? ""));
    const word = cleanWord(raw);
    const idx = typeof e.index === "number" ? e.index : null;
    const sc = Number(e.score ?? 1);
    const consecutive = cur !== null && idx !== null && cur._last !== null && idx === cur._last + 1;

    // Continuation → same word as `cur`: merge regardless of label (incl. O). Skip for an
    // index-less mock (can't prove adjacency) or a non-consecutive index (not a real split).
    if (isCont && cur && (consecutive || idx === null)) {
      if (word) cur.subwords.push(word);
      cur._last = idx ?? cur._last;
      cur._sum += sc;
      cur._n += 1;
      vote(cur, label, sc);
      continue;
    }
    // A real (non-continuation) O / unlabelled token breaks the run.
    if (!label || label === "O") {
      cur = null;
      continue;
    }
    if (!word) continue;
    // Adjacent same-label word → extend the run (a multi-word name); else start a new one.
    // Never merge index-less mocks (each stays its own run).
    if (cur && cur.label === label && consecutive) {
      cur.subwords.push(word);
      cur._last = idx;
      cur._sum += sc;
      cur._n += 1;
      vote(cur, label, sc);
    } else {
      cur = { label, subwords: [word], score: sc, _last: idx, _sum: sc, _n: 1, _votes: { [label]: sc } };
      runs.push(cur);
    }
  }
  for (const r of runs) {
    r.score = r._n ? r._sum / r._n : r.score;
    // Resolve the run's label to its highest-scored TAGGED type (a continuation may have
    // out-voted the lead — but if every subword was O the lead label stands).
    let best = r.label;
    let bestScore = -1;
    for (const [l, s] of Object.entries(r._votes)) {
      if (s > bestScore) {
        best = l;
        bestScore = s;
      }
    }
    r.label = best;
  }
  return runs;
}

/**
 * Locate an entity RUN's subwords in `lowerText`, returning the [start,end) of the REAL
 * occurrence (a verbatim slice) or null. The subwords are joined by `\s*`, so ONE pattern
 * matches whether the source GLUED them ("Nathalie"), SPLIT them across a line break / tab
 * / multiple spaces (a wrapped PDF/form: "Nathalie\nCros", "Jean-\nPierre"), or wrote a CJK
 * name one glyph per line ("张\n伟", "田中\n太郎"). `\s*` bridges ONLY whitespace — never any
 * other character — so it can never jump across an unrelated word (no mislocate). Each
 * subword is itself split on whitespace first, so a pre-aggregated word ("Jean Rebour" from
 * an injected mock) is handled identically. First hit wins; `pseudonymize` replaces by
 * value, so any occurrence suffices.
 */
export function locateRun(lowerText: string, subwords: string[]): { start: number; end: number } | null {
  const parts = subwords
    .flatMap((w) => w.toLowerCase().split(/\s+/))
    .filter((p) => p.length > 0);
  if (!parts.length || parts.join("").length < 2) return null;
  const m = new RegExp(parts.map(escapeRegExp).join("\\s*")).exec(lowerText);
  return m ? { start: m.index, end: m.index + m[0].length } : null;
}
