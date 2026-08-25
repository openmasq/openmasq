// Context-gated ORG detector — the lowercase-company hole the NER can't close:
// an invented org written in minuscules ("berlioz avocats", "acme sarl") is
// missed even by the title-cased second pass. Three families, each anchored on a
// signal ordinary prose can't produce by accident (the engine's precision bar):
//
//  1. LEGAL-form suffix ("berlioz sarl", "acme gmbh") — the suffix is
//     self-distinctive. Only UNAMBIGUOUS forms: bare "sa"/"co"/"ag"/"kg"/"spa"
//     are omitted (a possessive, a unit, a wellness spa).
//  2. Profession plural GATED by a leading org word ("chez berlioz avocats",
//     "cabinet ferrand notaires") — the bare plural is NOT enough ("salade
//     avocats crevettes" must never fire), the gate word carries the signal.
//  3. Conjunction family ("savary & fils", "muller & partners") — the
//     conjunction+suffix pair is the signal; kinship prose ("entre père et
//     fils") is excluded by a kinship deny on the leading token.
//  4. Financial-statement HEADER pair ("KARL STUDIO" ⏎ "91186429738250") — a
//     bilan/compte de résultat/liasse prints the denomination directly ABOVE its
//     bare SIREN/SIRET, with no label at all. Neither line is safe alone (a bare
//     number is any number, a bare caps line is any heading) — the PAIR is the
//     signal: the name line becomes the ORG and the digit line a COMPANY_ID. No
//     Luhn demand on the digits (OCR'd statements — same discipline as the
//     keyword-gated SIREN rules), and the name line must read as a DENOMINATION
//     (≤5 tokens, each cased or a particle) so a table label ("Total des
//     produits d'exploitation") above a fused number column never qualifies.
//
// The name tokens pass the shared stopword/generic/country/affix guards, so
// "la sarl", "une petite sarl" never yield a candidate. The gate word stays in
// clear, and the emitted value is canonicalised through `stripOrgAffixes` HERE —
// exactly like the NER/LLM detector paths — so "berlioz sarl" and the LLM's
// "Berlioz" share ONE `entityKey` (one company = one fake); the legal form ships
// in clear. (The deterministic sources do NOT pass through the detector-level
// strip, so skipping it here split the identity.)
import type { Detection } from "../types";
import { isStopword, isGenericTerm, isOrgAffix, stripOrgAffixes } from "../model/detect";
import { isCountry } from "./geo/countries";
import {
  LEGAL_SUFFIXES, PREFIX_FORMS, PROF_GATES, PROF_SUFFIXES, CONJ_SUFFIXES, KINSHIP,
  PREFIX_PARTICLES,
} from "./orgContext.vocab";

const TOKEN = "\\p{L}[\\p{L}'’-]*\\p{L}";
// 1-2 spaces, never a RUN: a run of 3+ is the COLUMN GUTTER of a two-column layout, and
// crossing it glued a company to the next column's label ("SARL BATIRENOV        Matricule"
// → one ORG whose fake then replaced the word « Matricule » everywhere). The value is
// normalised to single spaces downstream, so `lineSplit` cannot see the gutter afterwards
// — it has to be refused HERE. A real multi-word company name never carries one.
const GAP = "[^\\S\\r\\n]{1,2}";

const byLengthDesc = (a: string, b: string): number => b.length - a.length;
const alt = (words: string[]): string => [...words].sort(byLengthDesc).join("|");

/** Run `family` only in a WINDOW around each cheap suffix hit. The leading
 *  `TOKEN{1,3}` head makes every family startable at every position (the DOB_RULE
 *  lesson: judge a pattern by where it lets the match START) — anchored on the
 *  suffix instead, the quadratic head only ever scans ≤`before` chars per REAL
 *  suffix occurrence, and a text with no suffix costs one indexOf-grade probe.
 *  `before` bounds the longest lead (3 tokens + gaps); semantics are unchanged —
 *  the family regex re-judges the window in full, `push` dedups overlaps. */
function* windowed(text: string, probe: RegExp, family: RegExp, before = 80): Generator<RegExpExecArray> {
  probe.lastIndex = 0;
  for (let p = probe.exec(text); p; p = probe.exec(text)) {
    let start = Math.max(0, p.index - before);
    // Never cut MID-WORD: a slice starting inside a word would fake the left
    // boundary the families' lookbehind checks, and admit a lead the full text
    // refuses. Walk back to the previous whitespace (bounded by one word).
    while (start > 0 && !/\s/.test(text[start - 1])) start--;
    const slice = text.slice(start, p.index + p[0].length + 4);
    family.lastIndex = 0;
    for (let m = family.exec(slice); m; m = family.exec(slice)) {
      m.index += start;
      yield m;
    }
  }
}

const RE_LEGAL = new RegExp(
  `(?<![\\p{L}'’-])((?:${TOKEN}${GAP}){1,3})(${alt(LEGAL_SUFFIXES)})(?![\\p{L}])`,
  "giu",
);
const RE_PROF = new RegExp(
  `(?<![\\p{L}])(?:${alt(PROF_GATES)})${GAP}((?:${TOKEN}${GAP}){1,2})(${alt(PROF_SUFFIXES)})(?![\\p{L}])`,
  "giu",
);
// The name FOLLOWING a prefix form: up to 4 whitespace-separated tokens. The CASING
// gate cannot live in this regex — the `i` flag (needed for the form itself, written
// "S.A.S." or "société") makes `\p{Lu}` match lowercase too, so "la SAS est assignée"
// captured the sentence. The gate is enforced in code below instead: every kept token
// is Uppercase-led or a name particle, which is what separates a denomination from
// the prose that follows it.
const PREFIX_NAME = `[\\p{L}'’&.-]+(?:${GAP}[\\p{L}'’&.-]+){0,3}`;
const RE_PREFIX = new RegExp(
  `(?<![\\p{L}'’-])(?:${alt(PREFIX_FORMS)})\\.?${GAP}(${PREFIX_NAME})`,
  "giu",
);

/** A token that may belong to a denomination FOLLOWING a legal-form prefix: either
 *  Uppercase-led ("FOURNIL", "Pont") or a lowercase name particle ("du", "d'", "del").
 *  A lowercase content word ends the name — it is the prose after it. */
function prefixNameToken(tok: string): boolean {
  if (/^\p{Lu}/u.test(tok)) return true;
  return PREFIX_PARTICLES.has(tok.replace(/[.'’]/g, "").toLowerCase());
}

// The optional SECOND leading token widens « MARQUET & FILS » to « CHARPENTES
// MARQUET & FILS » — the trade noun is part of the registered name. Guarded in the
// loop: every captured token must be name material.
const RE_CONJ = new RegExp(
  `(?<![\\p{L}'’-])((?:${TOKEN}${GAP})?${TOKEN})${GAP}(?:&|et|und|y|e)${GAP}(?:${alt(CONJ_SUFFIXES)})(?![\\p{L}])`,
  "giu",
);
// Family 6 — NORDIC/BENELUX legal suffixes (AS, ApS, AB, OY, BV, NV), in a
// case-SENSITIVE arm: lowercase « as » is an ordinary English/Norwegian word, so
// unlike LEGAL_SUFFIXES these may only fire as written on a registry line — an
// ALL-CAPS denomination (« HANSEN & BREKKE AS »), never Title-case prose. The
// negative lookahead refuses a following CAPS word: « SAVE AS PDF » / « MARKED AS
// PAID » are caps-header English, not a company; a real registry mention ends the
// line or hits punctuation.
const CAPS_TOKEN = "[\\p{Lu}][\\p{Lu}'’.-]+";
const RE_LEGAL_NORDIC = new RegExp(
  `(?<![\\p{L}'’-])((?:${CAPS_TOKEN}${GAP}(?:&${GAP})?){1,3})(AS|ApS|AB|OY|OYJ|BV|NV)(?![\\p{L}])(?!${GAP}[\\p{Lu}])`,
  "gu",
);

// The cheap ANCHOR probes for `windowed` — the suffix alone, boundary-guarded.
const P_LEGAL = new RegExp(`(?<![\\p{L}'’-])(?:${alt(LEGAL_SUFFIXES)})(?![\\p{L}])`, "giu");
const P_PROF = new RegExp(`(?<![\\p{L}'’-])(?:${alt(PROF_SUFFIXES)})(?![\\p{L}])`, "giu");
const P_CONJ = new RegExp(`(?<![\\p{L}'’-])(?:${alt(CONJ_SUFFIXES)})(?![\\p{L}])`, "giu");
const P_NORDIC = /(?<![\p{L}'’-])(?:AS|ApS|AB|OY|OYJ|BV|NV)(?![\p{L}])/gu;
// Family 4: a name-shaped line, optionally one blank line, then a line that is
// NOTHING but 9 or 14 digits (single space/dot separators tolerated). `d` flag:
// the digit group's own indices anchor its Detection.start.
const RE_HEADER_PAIR = new RegExp(
  "^[^\\S\\r\\n]*(\\S[^\\r\\n]{1,58}?)[^\\S\\r\\n]*\\r?\\n(?:[^\\S\\r\\n]*\\r?\\n)?" +
    "[^\\S\\r\\n]*((?:\\d[ .]?){13}\\d|(?:\\d[ .]?){8}\\d)[^\\S\\r\\n]*$",
  "dgmu",
);

function okToken(tok: string): boolean {
  if (tok.length < 3 || /\d/.test(tok)) return false;
  if (KINSHIP.has(tok.toLowerCase())) return false;
  return !isStopword(tok) && !isGenericTerm(tok) && !isOrgAffix(tok) && !isCountry(tok);
}

/** A CAPITALIZED token is denomination MATERIAL even when the word itself is generic:
 *  French denominations are MADE of ordinary words (« ATELIER VERNE », « KELVEA
 *  SANTÉ », « SCI DU VIEUX PORT ») and the legal form beside them certifies the whole
 *  name — dropping the generic half left « VERNE » alone, under the 60 % coverage the
 *  bench demands. Stopwords, kinship, digits and the org AFFIXES stay excluded
 *  (« La Sarl » must still die), and the callers require a second token or one
 *  distinctive token so a LONE capitalized generic (« société ANONYME ») never
 *  becomes a company on its own. */
function nameishToken(tok: string): boolean {
  if (okToken(tok)) return true;
  if (!/^\p{Lu}/u.test(tok) || tok.length < 3 || /\d/.test(tok)) return false;
  if (KINSHIP.has(tok.toLowerCase()) || isOrgAffix(tok)) return false;
  // An ALL-CAPS word is denomination material even when its lowercase twin is a
  // stopword: « SCI DU VIEUX PORT » — "vieux" the adjective never reaches here,
  // only the engraved form does. Title-case keeps the stopword rejection.
  return !isStopword(tok) || /^[\p{Lu}'’.-]+$/u.test(tok);
}

/** ≥2 tokens, or at least one token no generic word could explain. */
function denomEvidence(parts: string[]): boolean {
  return parts.length >= 2 || parts.some((t) => okToken(t));
}

/** The longest verbatim tail of `lead` whose tokens are ALL valid name tokens
 *  ("la berlioz " → "berlioz "; "berlioz la " → null — an invalid token between
 *  the name and the suffix disqualifies the whole match), or null. */
function survivingLead(lead: string): string | null {
  const parts = [...lead.matchAll(/\S+/g)];
  for (let i = 0; i < parts.length; i++) {
    const tail = parts.slice(i);
    if (tail.every((p) => nameishToken(p[0])) && denomEvidence(tail.map((p) => p[0])))
      return lead.slice(parts[i].index);
  }
  return null;
}

/**
 * Detect company names anchored on a legal/profession/conjunction context.
 * Returns verbatim `{value, category: "ORG"}` detections.
 */
export function detectOrgContext(text: string): Detection[] {
  if (!text) return [];
  const out: Detection[] = [];
  const seen = new Set<string>();
  const push = (raw: string, start: number): void => {
    // Canonicalise: drop the trailing legal form so every source agrees on the
    // org's identity key. Only TRAILING affixes can occur here (leading articles
    // are rejected by okToken), so `start` stays valid for the kept prefix.
    const value = stripOrgAffixes(raw.trim());
    if (value.length < 3 || seen.has(value)) return;
    seen.add(value);
    out.push({ value, category: "ORG", start });
  };
  for (const m of windowed(text, P_LEGAL, RE_LEGAL)) {
    const lead = survivingLead(m[1] ?? "");
    if (!lead) continue;
    push(`${lead}${m[2]}`, m.index + m[0].length - (lead.length + m[2].length));
  }
  for (const m of windowed(text, P_PROF, RE_PROF)) {
    const lead = survivingLead(m[1] ?? "");
    if (!lead) continue;
    push(`${lead}${m[2]}`, m.index + m[0].length - (lead.length + m[2].length));
  }
  for (const m of text.matchAll(RE_PREFIX)) {
    const raw = (m[1] ?? "").trim();
    const all = raw.split(/[^\S\r\n]+/).filter(Boolean);
    // Keep the leading run of denomination tokens; the first lowercase content word
    // ends the name ("SAS TECHNIVERT est assignée" → "TECHNIVERT").
    const parts: string[] = [];
    for (const tok of all) {
      if (!prefixNameToken(tok)) break;
      parts.push(tok);
    }
    // A name may not END on a particle ("SCI DU" alone is not a company).
    while (parts.length && !/^\p{Lu}/u.test(parts[parts.length - 1])) parts.pop();
    // …nor be a LONE generic/stopword token ("la société ANONYME"). Two capitalized
    // tokens or one distinctive token = a denomination (« SCI DU VIEUX PORT »).
    if (!parts.length || !denomEvidence(parts.filter((t) => nameishToken(t)))) continue;
    const name = parts.join(" ").replace(/[.,;:]+$/u, "");
    if (!name) continue;
    push(name, m.index + m[0].indexOf(name));
  }
  for (const m of windowed(text, P_CONJ, RE_CONJ)) {
    // 1-2 leading tokens: each must be name material, and the run must carry more
    // evidence than a lone generic (« entre père et fils » still dies via KINSHIP).
    const cap = m[1] ?? "";
    const lead = survivingLead(cap);
    if (!lead) continue;
    const leadOffset = cap.length - lead.length;
    push(lead + m[0].slice(cap.length), m.index + leadOffset);
  }
  for (const m of windowed(text, P_NORDIC, RE_LEGAL_NORDIC)) {
    // The « & » connector is name material here (survivingLead would reject it).
    const parts = (m[1] ?? "").trim().split(/[^\S\r\n]+/).filter(Boolean);
    const words = parts.filter((t) => t !== "&");
    if (!words.length || !words.every((t) => nameishToken(t)) || !denomEvidence(words)) continue;
    push(`${m[1]}${m[2]}`, m.index);
  }
  for (const m of text.matchAll(RE_HEADER_PAIR)) {
    const name = (m[1] ?? "").trim();
    if (!denominationLike(name)) continue;
    const [nameStart] = m.indices![1]!;
    const [idStart] = m.indices![2]!;
    push(name, nameStart);
    const id = m[2]!;
    const idKey = `COMPANY_ID::${id}`;
    if (!seen.has(idKey)) {
      seen.add(idKey);
      out.push({ value: id, category: "COMPANY_ID", start: idStart });
    }
  }
  return out;
}

/** A DENOMINATION-shaped header line: ≤5 tokens, ≥2 letters, no colon (a label),
 *  no digit-only tokens beyond the name, every token either a particle/stopword
 *  or Uppercase-led, at least one cased non-generic token. Rejects a table label
 *  ("Total des produits d'exploitation" — lowercase content words) and a document
 *  title whose every word is generic ("Compte de résultat 2024"). */
function denominationLike(name: string): boolean {
  if (name.length < 3 || /[:：]/.test(name)) return false;
  if (!/\p{L}[\s\S]*\p{L}/u.test(name)) return false;
  if (isGenericTerm(name)) return false;
  const tokens = name.split(/\s+/).filter(Boolean);
  if (tokens.length > 5) return false;
  let cased = 0;
  for (const tok of tokens) {
    if (isStopword(tok)) continue;
    if (!/^[\p{Lu}\d&'’.-]/u.test(tok)) return false; // a lowercase content word → prose/label
    if (/\p{L}/u.test(tok) && !isGenericTerm(tok) && !isCountry(tok)) cased++;
  }
  return cased >= 1;
}
