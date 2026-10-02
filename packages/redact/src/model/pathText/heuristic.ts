/**
 * File-name RECALL: a file name is a few words with no sentence around them, so a detector
 * built for prose misses the people and companies in it. This net is NARROW (the precision
 * bar of `../../engine/CLAUDE.md`): it only ever looks at UNKNOWN capitalised words — not a
 * stopword, not a generic or path word, not a notorious entity, 3+ letters — and only names
 * one when its neighbourhood says so:
 *   - two or more of them in a row               → a person (« Ellen Prusik »);
 *   - one beside a detected entity               → the entity's kind;
 *   - beside a legal form or a trade word        → a company (« Tessaro Holdings », « SARL X »);
 *   - after a courtesy title, or before a family word → a person (« Dr. X », « X Family Trust »);
 *   - either side of `v.` / `vs` / `&`           → a party (« Harlan v. Whitcombe »).
 * A lone unknown word with none of these stays as it is: below Strict that is the accepted
 * residual, at Strict the segment builder replaces it anyway.
 */
import type { NotorietyOpts } from "../notorious";
import { isOrgAffix } from "../genericTerms";
import { isPathMeaningWord, HONORIFICS } from "./lexicon";
import { tokensOf, type Token } from "./words";

/** Words that make their unknown neighbour a company name (the trade, not the legal form). */
const TRADE_WORDS = new Set([
  "studio", "conseil", "consulting", "media", "analytics", "industries", "dental", "logistics",
  "menuiserie", "boulangerie", "partners", "associates", "holdings", "capital", "ventures",
  "labs", "solutions", "architectes", "avocats", "law", "legal", "realty", "construction",
]);
const PARTY_JOINERS = new Set(["v", "vs"]);
/** Words whose capitalised neighbour is a family NAME (« Thornquist Family Trust »). */
const FAMILY_WORDS = new Set([
  "family", "famille", "custody", "garde", "estate", "succession", "trust", "divorce",
  "adoption", "guardianship", "probate", "mariage", "wedding", "funeral", "obsèques", "obseques",
]);

export interface Finding {
  start: number;
  end: number;
  category: string;
}

const CAP_WORD = /^(?:\p{Lu}[\p{Ll}\p{M}'’]{2,}|\p{Lu}{4,})$/u;

/**
 * Probable entities in one segment's DETECTION text (`spacedForDetection`), given the spans
 * the detectors already claimed there. Returns offsets in that text.
 */
export function probableEntities(text: string, claimed: readonly Finding[], notoriety: NotorietyOpts): Finding[] {
  const toks = tokensOf(text);
  const inClaim = (t: Token) => claimed.some((c) => t.start < c.end && t.start + t.text.length > c.start);
  const unknown = toks.map((t) => !inClaim(t) && CAP_WORD.test(t.text) && !isPathMeaningWord(t.text, notoriety));
  // Only separators between two tokens (no other word) ⇒ adjacent.
  const gap = (a: Token, b: Token) => text.slice(a.start + a.text.length, b.start);
  const joined = (a: Token, b: Token) => /^[\s.,()'’-]*$/.test(gap(a, b));
  const out: Finding[] = [];
  for (let i = 0; i < toks.length; i++) {
    if (!unknown[i]) continue;
    let j = i;
    while (j + 1 < toks.length && unknown[j + 1] && joined(toks[j], toks[j + 1])) j++;
    const start = toks[i].start;
    const end = toks[j].start + toks[j].text.length;
    const prev = toks[i - 1];
    const next = toks[j + 1];
    const near = (t: Token | undefined, before: boolean) =>
      !!t && (before ? joined(t, toks[i]) : joined(toks[j], t));
    const word = (t: Token | undefined) => t?.text.toLowerCase() ?? "";
    const touchesClaim = claimed.some((c) => c.end <= start ? /^[\s.,()'’_-]*$/.test(text.slice(c.end, start)) : c.start >= end && /^[\s.,()'’_-]*$/.test(text.slice(end, c.start)));
    const party = (t: Token | undefined, before: boolean) => {
      if (!t) return false;
      const between = before ? text.slice(t.start + t.text.length, start) : text.slice(end, t.start);
      if (PARTY_JOINERS.has(word(t))) return /^[\s.]*$/.test(between);
      return /^\s*&\s*$/.test(between) && CAP_WORD.test(t.text); // « Marlow & Finchley »
    };
    let category: string | undefined;
    const org = (t: Token | undefined, before: boolean) =>
      near(t, before) && (isOrgAffix(word(t)) || TRADE_WORDS.has(word(t)));
    if (org(prev, true) || org(next, false)) category = "ORG";
    else if (j > i) category = "PERSON";
    else if (near(prev, true) && HONORIFICS.has(word(prev))) category = "PERSON";
    else if (near(next, false) && FAMILY_WORDS.has(word(next))) category = "PERSON";
    else if (party(prev, true) || party(next, false)) category = "PERSON";
    else if (touchesClaim) category = "PERSON";
    if (category) out.push({ start, end, category });
    i = j;
  }
  return out;
}
