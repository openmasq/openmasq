// Local, LLM-free PII detection via a NER model. This is the OFFLINE counterpart
// of `model/detect.ts`'s `detectWithModel`: same output contract (`Detection[]` of
// verbatim `{value, category}`), so `pseudonymize`/`discoverSecrets` consume it
// through the exact same machinery — but the spans come from an in-process
// token-classification NER model instead of a chat completion. No network, no LLM.
//
// Every `value` is a real slice of the input, so it is verbatim BY CONSTRUCTION
// (a model can't hallucinate a substring that isn't there) — the same safety
// property the LLM path enforces via `caseInsensitiveOccurrences`. We still drop
// ultra-common function words and generic document/type words, reusing the LLM
// detector's shared filters so both sources behave identically.
import type { Detection } from "../types";
import {
  isStopword,
  isGenericTerm,
  caseInsensitiveOccurrences,
  stripLeadingArticle,
  stripOrgAffixes,
} from "../model/detect";
import { isGenericWithArticle } from "../model/genericTerms";
import { isNotoriousEntity } from "../model/notorious";
import { isCountry } from "../engine/geo/countries";
import { isCjkText } from "../util";
import { CharacterChunker, type NerPredict, type ChunkerOptions, type LocalSpan } from "./chunker";
import { nerLabelToCategory } from "./labels";

export interface LocalDetectOptions extends ChunkerOptions {
  /**
   * Minimum score to keep a span. The inference factory (`./ner`) applies NO
   * floor of its own — every located run comes through — so this is the ONLY
   * score gate. Unset (the default, and what every shipping caller uses) accepts
   * everything: for a privacy product a low-confidence span erring toward
   * redaction is the safe side. Set it only from a bench, never by eye.
   */
  threshold?: number;
  /**
   * Extend a detected PERSON name forward over immediately-following Capitalized
   * surname tokens the cased model failed to tag ("Manon" → "Manon Verdolini").
   * Default ON — high precision (only fires after a model-confirmed person, and
   * only over Capitalized non-function/non-generic tokens). Set false to disable.
   */
  extendNames?: boolean;
  /**
   * Re-admit the `MISC` bucket (products / projects / orgs the classic PER/ORG/LOC
   * set drops) as ORG, but ONLY a confident, proper-noun-shaped span: score ≥ this
   * value AND Capitalized AND not a function/generic/country/notorious word.
   * `undefined` (default) keeps dropping MISC entirely. A PRECISION tradeoff — MISC
   * is where the model over-flags (nationalities, events), so pick the threshold
   * from `bench/`, never by eye.
   */
  miscThreshold?: number;
  /** Surface an inference failure (unloaded model, bad weights…) without throwing. */
  onError?: (err: unknown) => void;
}

/** Below this mean token score, a span the two reads DISAGREE on is flagged `uncertain`
 *  (« à vérifier » in the pre-send audit). The pair « désaccord ET score < 0,99 » is the
 *  measured best trigger of `bench/confidence.bench.ts` — re-pick it from the bench,
 *  never by eye. The flag is UX-only: it never gates redaction. */
const REVIEW_SCORE = 0.99;

/** Coarse label with any BIO/BILUES prefix stripped ("B-PER" → "PER"). */
const coarseLabel = (label: string): string =>
  label.replace(/^[BILUES]-/i, "").trim().toUpperCase();

/** Person labels the surname post-pass may extend (CoNLL + common synonyms). */
const PERSON_LABELS = new Set(["PER", "PERSON", "PERS", "PS"]);

/** A Capitalized token that plausibly CONTINUES a person's name (a surname the cased
 *  model missed): starts uppercase, ≥3 letters, no digit, and not a function / generic /
 *  country word. Notoriety is left to the downstream filter (a famous full name like
 *  "Marie Curie" is spared there, not here). */
function looksLikeSurname(word: string): boolean {
  if (word.length < 3 || /\d/.test(word)) return false;
  if (!/^\p{Lu}/u.test(word)) return false;
  return !isStopword(word) && !isGenericTerm(word) && !isCountry(word);
}

/** Extend each PERSON span forward over immediately-following Capitalized surname tokens
 *  the model failed to tag. Same-line only, ≤2 appended words, and never into a token
 *  another span already owns (so two distinct people stay distinct). */
function extendPersonNames(input: string, spans: LocalSpan[]): LocalSpan[] {
  return spans.map((s) => {
    if (!PERSON_LABELS.has(coarseLabel(s.label))) return s;
    let end = s.end;
    for (let added = 0; added < 2; added++) {
      const m = /^([ \t ]+)(\p{Lu}[\p{L}'’-]*\p{L})/u.exec(input.slice(end));
      if (!m) break;
      const wordStart = end + m[1].length;
      const wordEnd = wordStart + m[2].length;
      // Don't swallow a token another span already covers.
      if (spans.some((o) => o !== s && o.start < wordEnd && o.end > wordStart)) break;
      if (!looksLikeSurname(m[2])) break;
      end = wordEnd;
    }
    return end === s.end ? s : { ...s, end };
  });
}

/** True when a dropped-label span is a CONFIDENT, proper-noun-shaped `MISC` worth
 *  re-admitting as ORG. Hard-gated because MISC is noisy. */
function readmitMisc(span: LocalSpan, input: string, threshold: number): boolean {
  if (coarseLabel(span.label) !== "MISC" || span.score < threshold) return false;
  const v = stripLeadingArticle(input.slice(span.start, span.end).trim());
  if (v.length < 3 || /\d/.test(v) || !/^\p{Lu}/u.test(v)) return false;
  if (isStopword(v) || isGenericTerm(v) || isCountry(v)) return false;
  // World knowledge, not the user's data — a famous brand/person ships in clear.
  return !isNotoriousEntity(v, "company") && !isNotoriousEntity(v, "name");
}

/**
 * Detect free-form PII in `input` using an injected NER `predict` function.
 * Returns verbatim `{value, category}` spans, de-duplicated. Never throws: a
 * failing model yields `[]` so callers fall back to the deterministic rules,
 * exactly like the LLM detector.
 */
export async function detectLocalNer(
  input: string,
  predict: NerPredict,
  options: LocalDetectOptions = {},
): Promise<Detection[]> {
  if (!input.trim()) return [];
  const chunker = new CharacterChunker(options);
  let spans;
  try {
    spans = await chunker.predict(input, predict);
  } catch (err) {
    console.warn("[redact] local NER failed — falling back to pattern rules.", err);
    options.onError?.(err);
    return [];
  }
  // Recover surnames the cased model tagged only the FIRST name of ("Manon" → "Manon
  // Verdolini"). ON by default (high precision); the span's [start,end) is extended
  // before value extraction so recase/occurrence expansion see the full name.
  if (options.extendNames !== false) spans = extendPersonNames(input, spans);

  const out: Detection[] = [];
  const pushed = new Set<string>();
  const min = options.threshold ?? 0;
  for (const span of spans) {
    if (span.score < min) continue;
    // « À vérifier » — the measured trigger of bench/confidence.bench.ts (« désaccord des
    // deux passes ET score moyen < 0,99 » : 47 % des FP rendus visibles pour 17 % des TP
    // marqués). UX-ONLY, fail closed: the flag never drops a span — an uncertain span is
    // redacted exactly like a sure one, it is just SHOWN as reviewable before the send.
    const uncertain = span.agreed === false && span.score < REVIEW_SCORE;
    if (span.start < 0 || span.end > input.length || span.end <= span.start) continue;
    let category = nerLabelToCategory(span.label);
    if (!category) {
      // Unmapped label (MISC/DATE/…) → normally dropped. Optionally re-admit a
      // CONFIDENT, proper-noun-shaped MISC ("Kelm", "Vaneau") as ORG. Off unless
      // `miscThreshold` is set (a benched precision tradeoff — MISC is noisy).
      if (options.miscThreshold === undefined || !readmitMisc(span, input, options.miscThreshold))
        continue;
      category = "ORG";
    }
    // Strip a leading lowercase article ("la Sacem" → "Sacem") — and, pour un ORG, la
    // PRÉPOSITION avalée par le NER (« de Karl Studio » → « Karl Studio ») : sans elle
    // le wire perdait le « de » ET l'org gagnait une seconde identité (journal 01/08).
    let value = stripLeadingArticle(input.slice(span.start, span.end).trim(), category === "ORG");
    // "société KARL STUDIO" / "KARL STUDIO Forme" → "KARL STUDIO": strip the legal
    // form / descriptor so one company is ONE identity (mirrors the LLM path).
    if (category === "ORG") value = stripOrgAffixes(value);
    // A NER entity here is only ever a person / place / org NAME. Reject spans that
    // can't be one — the model gets noisy on table-extracted text where cells glue
    // together (a payslip PDF):
    //  - too short: a 2-char LATIN fragment ("IE"/"PA"/"De") is a subword of a real
    //    word, and replacing it as a substring corrupts that word ("INGÉNIEURS", "PAIE").
    //    But a CJK glyph is a whole morpheme, so a 2-char CJK span ("张伟"/"김민준") is a
    //    FULL name — exempt CJK from the <3 drop (else every short CJK name was lost);
    //  - contains a digit: a name/place/org never does — "mensuelle160"/"COEFFICIENT2"
    //    are label↔number glue from the extraction, not entities.
    if (value.length < (isCjkText(value) ? 2 : 3)) continue;
    if (/\d/.test(value)) continue;
    // Same universal drops as the LLM path: a lone function word ("tes") or a
    // generic type word ("CV", "Facture") is never PII on its own — including
    // behind a CAPITALIZED article the strip keeps ("La réunion" ≠ a place).
    if (isStopword(value) || isGenericTerm(value) || isGenericWithArticle(value)) continue;
    // Emit EACH case-insensitive occurrence as its own candidate (mirrors the LLM
    // path's `caseInsensitiveOccurrences`). The NER tags ONE casing ("Karl studio"),
    // but the text may also hold "Karl Studio" / "KARL STUDIO" — and `pseudonymize`
    // applies the fake CASE-SENSITIVELY, so without this the untagged casings LEAK the
    // real value to the model (observed: a company name reaching a browser search).
    // The recase machinery then keeps all casings ONE identity. Whole-word only (the
    // shared guard skips a match glued inside a larger word).
    for (const actual of caseInsensitiveOccurrences(input, value)) {
      const key = `${category}::${actual}`;
      if (pushed.has(key)) continue;
      pushed.add(key);
      out.push(uncertain ? { value: actual, category, uncertain } : { value: actual, category });
    }
  }
  return out;
}
