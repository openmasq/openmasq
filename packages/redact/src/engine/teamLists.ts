import type { Detection } from "../types";
import { isStopword, isGenericTerm, isGenericCompound } from "../model/genericTerms";

/**
 * TEAM-ROSTER lists — the "Prénom / rôle" alternation of an about-page or org chart:
 *
 *     Aurélien          Milena            Tharsiga
 *     Product          go-to-market     Security
 *
 * The NER under-detects exactly this shape: a BARE first name has no prose context, an
 * uncommon one ("Tharsiga") is out-of-vocabulary, and the adjacent role lines drag its
 * span boundaries around. The gazetteer can't help either — its safety rule is that a
 * lone first name never fires (see `names/nameGazetteer.ts`). An audit roster shipped
 * 12/24 first names in CLEAR.
 *
 * The STRUCTURE is the missing context, and it is checkable deterministically: a line
 * that is nothing but 1–3 capitalized word-tokens, whose NEXT non-empty line is entirely
 * ROLE vocabulary ("Product", "TECH", "go-to-market", "Rédac. chef" — the generic-terms
 * role block), is a person entry. The role line is the precision gate (the same
 * discipline as `gate()`'s context words): prose almost never puts a bare capitalized
 * word directly above a bare role word.
 *
 * Additional guards, each against a measured false-positive shape:
 *  - the NAME line must carry no digit and no sentence punctuation (a heading like
 *    "Notre équipe." has punctuation; a versioned line has digits);
 *  - every token of the name line must be letters-only and start uppercase;
 *  - a name line that is ITSELF generic/stopword vocabulary ("Contact", "Support",
 *    "Notre équipe") never fires — section headings sit above role-ish words too;
 *  - ≥2 roster entries are required in the whole text before ANY is emitted: one
 *    isolated pair ("Paris\nTech") is ambiguous, a repeated alternation is a roster.
 *
 * Emitted as NAME candidates; the normal pipeline (dedup, identity, generic drop) does
 * the rest. Deterministic ⇒ every engine benefits (regex-only, NER, LLM, gateway).
 */

/** A line that is only 1–3 capitalized, letters-only word tokens (a person's name). */
const NAME_LINE = /^(?:[\p{Lu}][\p{L}'’-]*)(?:[ \t]+[\p{Lu}][\p{L}'’-]*){0,2}$/u;

/** Split a role line into words the way `isGenericCompound` does (incl. elision). */
const roleWords = (line: string): string[] => line.split(/[\s._/'’&-]+/u).filter(Boolean);

/** True when the line reads as a ROLE/label: every word is role/generic vocabulary. */
function isRoleLine(line: string): boolean {
  const l = line.trim();
  if (!l || l.length > 60 || /\d/.test(l)) return false;
  if (isGenericTerm(l) || isGenericCompound(l)) return true;
  const words = roleWords(l);
  return words.length > 0 && words.length <= 5 && words.every((w) => isStopword(w) || isGenericTerm(w));
}

/** True when the candidate name line is actually vocabulary ("Contact", "Support"). */
function isVocabularyLine(line: string): boolean {
  return isGenericTerm(line) || isGenericCompound(line) || roleWords(line).every((w) => isStopword(w) || isGenericTerm(w));
}

export function detectTeamRoster(input: string): Detection[] {
  if (!input.includes("\n")) return [];
  const lines = input.split(/\r?\n/);
  const hits: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const name = lines[i].trim();
    if (!name || !NAME_LINE.test(name) || isVocabularyLine(name)) continue;
    // The next NON-empty line must be a role line (blank separator lines tolerated —
    // rendered HTML→text inserts them between the name and its role).
    let j = i + 1;
    while (j < lines.length && !lines[j].trim()) j++;
    if (j >= lines.length || !isRoleLine(lines[j])) continue;
    hits.push(name);
  }
  // One isolated pair is ambiguous ("Paris" above "Tech" could be a header); a roster
  // repeats. Two entries is the smallest team page seen in the audit material.
  if (hits.length < 2) return [];
  return [...new Set(hits)].map((value) => ({ value, category: "PERSON" }));
}
