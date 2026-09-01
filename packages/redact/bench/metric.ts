// Shared, dependency-free scoring for the redaction benchmarks. A "case" is a text plus its
// ground-truth (value, category) spans; a detector is any `(text) => detected value strings`.
// Recall is TOKEN-COVERAGE: a truth value counts as FOUND when ≥60% of its significant tokens
// appear in the union of the detected values (CJK is matched by separator-stripped substring,
// since CJK has no word tokens). This is deliberately value-based + lenient so it compares the
// regex engine, the local NER and the model detector on equal footing (all emit verbatim values).

export interface BenchCase {
  id: string;
  lang: string;
  text: string;
  truth: [value: string, category: string][];
}

export type Detector = (text: string) => string[] | Promise<string[]>;

const NAMEISH = new Set(["NAME", "CITY", "ORG"]);

/**
 * A REAL personal datum from the text, but outside the scope the recall floor
 * measures — counted for PRECISION only, never for recall.
 *
 * It exists because one corpus served two measures that contradict each other. The recall
 * floors (`*.recall.test.ts`) run on the DETERMINISTIC pipeline alone, with no model: that's
 * what makes them free, offline and stable. The annotated truth had therefore been written to
 * the measure of that pipeline — hence the absence of institutions (the pupil's school, the
 * patient's hospital, the student's university), which only the NER finds.
 *
 * Consequence measured before this category was added: the product correctly redacted
 * « COLLÈGE JEAN-BAPTISTE CARPEAUX » on a named minor's report card, and the precision
 * measure counted that redaction as an ERROR. Annotating them `CONTEXT` fixes precision
 * WITHOUT touching the recall floor: the ratchet keeps exactly its meaning.
 *
 * ⚠️ A deliberate conservative choice: even a value a deterministic detector finds is
 * annotated `CONTEXT` if it comes from this audit. Underestimating recall is harmless;
 * inflating it by widening the truth would not be.
 */
const RECALL_EXEMPT = new Set(["CONTEXT"]);

export function tokens(s: string): string[] {
  return (s || "")
    .toLowerCase()
    .split(/[\s\-_/.,]+/)
    .filter((t) => t.length >= 2 || /\d/.test(t));
}
export function norm(s: string): string {
  return (s || "").toLowerCase().replace(/[\s\-_/.,]/g, "");
}
export function isCjk(s: string): boolean {
  return /[぀-ヿ㐀-鿿가-힯]/.test(s);
}

/** Inclusion floor: under 3 characters, « né » would overlap half the corpus. */
const MIN_CONTAIN = 3;

/** Does `needle` appear in `hay` at the START of a token (word boundary)? Without this bound,
 *  « med » would overlap « immédiat » and inclusion would excuse anything. */
function atTokenStart(hay: string, needle: string): boolean {
  const h = hay.toLowerCase(), n = needle.toLowerCase();
  for (let i = h.indexOf(n); i !== -1; i = h.indexOf(n, i + 1)) {
    if (i === 0 || !/[\p{L}\p{N}]/u.test(h[i - 1])) return true;
  }
  return false;
}

/**
 * Does a DETECTED value overlap the annotated truth? Its complement is THE definition of
 * a false positive, for every bench.
 *
 * ⚠️ ONE SINGLE home, imported — not copy-pasted. The short version (`tokens(d).some(...)`) had
 * been duplicated across five benches, had lost the CJK branch there, and counted as an error
 * every correct detection in a language with no spaces. `sourceFp.bench.ts` pins the behavior.
 *
 * An annotation is a SPAN, not a word — hence three ways to overlap:
 *  1. a significant token in common;
 *  2. CJK: string inclusion, for lack of tokens;
 *  3. inclusion bounded to a token edge, in BOTH directions — « whitman » in
 *     « laura.whitman@… », « 63000 » in « NIORT (63000) », and conversely
 *     « 東京都渋谷区道玄坂1-2-3 » which contains the annotated address. Detecting a PART of an
 *     annotated datum is not a detection error: it's the same datum.
 *
 * What the edge rule REFUSES, and this is deliberate: « MrPaul » does not overlap « Paul VASSEUR »
 * — the honorific is glued to the first name, so the span is wrong even if the entity is right.
 */
export function overlapsTruth(detected: string, truth: readonly string[]): boolean {
  if (!detected.trim()) return false;
  const truthTokens = new Set(truth.flatMap(tokens));
  if (tokens(detected).some((t) => truthTokens.has(t))) return true;
  const d = norm(detected);
  for (const t of truth) {
    const n = norm(t);
    // The floor is LATIN: a han/kana/hangul glyph is a whole morpheme, so « 张伟 »
    // is a COMPLETE name — the same exemption as the engine (`local/CLAUDE.md`). Applying it
    // to everything counted every short CJK name as an error.
    if (isCjk(detected) || isCjk(t)) {
      if (n && d.includes(n)) return true;
      if (d && n.includes(d)) return true;
      continue;
    }
    if (n.length < MIN_CONTAIN || d.length < MIN_CONTAIN) continue;
    if (atTokenStart(t, detected) || atTokenStart(detected, t)) return true;
  }
  return false;
}

/** Is an annotated truth COVERED by what was detected? The recall-side counterpart of
 *  {@link overlapsTruth}, exposed so the benches that break down by
 *  category don't recode a variant of it (rule 9 — this is exactly how
 *  `overlapsTruth` had drifted across five files). */
export function coversTruth(value: string, detected: readonly string[]): boolean {
  const d = [...detected];
  return isCovered(value, d, norm(d.join(" ")), new Set(d.flatMap(tokens)));
}

function isCovered(value: string, detected: string[], bag: string, bagTokens: Set<string>): boolean {
  if (isCjk(value)) return bag.includes(norm(value));
  const tk = tokens(value);
  if (!tk.length) return false;
  const hit = tk.filter((t) => bagTokens.has(t) || bag.includes(norm(t))).length;
  return hit / tk.length >= 0.6;
}

export interface CaseScore {
  found: number;
  total: number;
  foundNameish: number;
  totalNameish: number;
  fp: number;
  misses: string[];
}

export function scoreCase(c: BenchCase, detected: string[]): CaseScore {
  const bag = norm(detected.join(" "));
  const bagTokens = new Set(detected.flatMap(tokens));
  const truthValues = c.truth.map(([v]) => v);
  const s: CaseScore = { found: 0, total: 0, foundNameish: 0, totalNameish: 0, fp: 0, misses: [] };
  for (const [value, cat] of c.truth) {
    if (RECALL_EXEMPT.has(cat)) continue;
    s.total++;
    if (NAMEISH.has(cat)) s.totalNameish++;
    if (isCovered(value, detected, bag, bagTokens)) {
      s.found++;
      if (NAMEISH.has(cat)) s.foundNameish++;
    } else s.misses.push(`${c.id}/${cat}:${value}`);
  }
  for (const d of detected) {
    if (!overlapsTruth(d, truthValues)) s.fp++;
  }
  return s;
}

export interface CorpusScore extends CaseScore {
  cases: number;
  byLang: Record<string, [found: number, total: number]>;
}

export async function scoreCorpus(cases: BenchCase[], detect: Detector): Promise<CorpusScore> {
  const agg: CorpusScore = {
    cases: cases.length, found: 0, total: 0, foundNameish: 0, totalNameish: 0,
    fp: 0, misses: [], byLang: {},
  };
  for (const c of cases) {
    const detected = await detect(c.text);
    const s = scoreCase(c, detected);
    agg.found += s.found; agg.total += s.total;
    agg.foundNameish += s.foundNameish; agg.totalNameish += s.totalNameish;
    agg.fp += s.fp; agg.misses.push(...s.misses);
    const l = (agg.byLang[c.lang] ??= [0, 0]);
    l[0] += s.found; l[1] += s.total;
  }
  return agg;
}

export const pct = (a: number, b: number): number => (b ? Math.round((100 * a) / b) : 0);
