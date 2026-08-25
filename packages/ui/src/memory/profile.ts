import { isStopword } from "@openmasq/redact";
import { normalizeMem } from "./memory";

/**
 * PROFILE hygiene — the semantic-ish dedup the plain containment check couldn't do.
 *
 * The extractor phrases the same preference differently every run (« Préfère des
 * réponses courtes en français » / « Préfère les réponses courtes en français » /
 * « Utilisateur préférant les réponses courtes en français » / « Doivent être courtes
 * et en français »), and `normalizeMem(profile).includes(piece)` sees four DIFFERENT
 * strings — the reported profile with six copies of one preference. Equality can't
 * catch a reformulation; token COVERAGE can: a sentence whose every CONTENT word is
 * already covered by the kept profile adds nothing, whatever its function words and
 * inflections do around them.
 *
 * Deliberately conservative: dropping requires FULL coverage of the piece's content
 * words, so a sentence carrying one new fact (« préfère le tutoiement ») always stays.
 * The cost is that a fully-redundant sentence with an exotic word survives — fine, the
 * next pass is idempotent and the user can edit the profile.
 */

/** Framing nouns that name THE USER, not a fact — never content. ("Utilisateur
 *  préférant…" must dedup against "Préfère…".) */
const FRAMING = new Set(["utilisateur", "utilisatrice", "user", "personne", "assistant"]);

/** The CONTENT words of a sentence: normalized, ≥3 chars, minus function/framing words. */
function contentTokens(s: string): string[] {
  return normalizeMem(s)
    .split(" ")
    .filter((w) => w.length >= 3 && !isStopword(w) && !FRAMING.has(w));
}

/** Inflection-tolerant token equality: exact, or a shared 6-char stem when both are
 *  long enough ("prefere"/"preferant", "courte"/"courtes", "francais"/"francaise").
 *  Short tokens ("saas", "b2b", "claire") only ever compare EQUAL. La compaction des
 *  faits de fiche l'IMPORTE (`compaction.ts` `restates`) : une seule définition de
 *  « même mot fléchi », pas deux à tenir ensemble. */
export function sameStem(a: string, b: string): boolean {
  if (a === b) return true;
  return a.length >= 6 && b.length >= 6 && a.slice(0, 6) === b.slice(0, 6);
}

/** Split a profile blob into sentences, each kept VERBATIM (punctuation included) —
 *  the profile may be user-written, so dedup removes whole segments, never rewrites.
 *  Splits on end punctuation AND before a mid-blob Capitalized word: the old append
 *  glued pieces with a bare SPACE (« …en français Utilisateur préférant… »), so
 *  punctuation alone cannot separate what it accumulated. Over-splitting is safe:
 *  fragments that survive are rejoined in ORDER, so a text where nothing is dropped
 *  round-trips identically. */
export function profileSentences(profile: string): string[] {
  return (profile.match(/[^.!?]+[.!?]*/g) ?? [])
    .flatMap((c) => c.split(/\s+(?=\p{Lu}\p{Ll})/u))
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Does `covered` (content tokens of the kept profile) already cover EVERY content
 *  token of `piece`? An empty-content piece counts as covered (nothing to add). */
export function profileCovers(covered: string[], piece: string): boolean {
  return contentTokens(piece).every((t) => covered.some((u) => sameStem(t, u)));
}

/**
 * Append `pieces` to `profile`, skipping any piece the kept text already covers.
 * Returns the next profile + whether anything was added. Pure; the caller clamps.
 */
export function appendToProfile(
  profile: string | undefined,
  pieces: string[],
): { profile: string | undefined; changed: boolean } {
  let out = profile;
  let covered = contentTokens(out ?? "");
  let changed = false;
  for (const raw of pieces.flatMap(profileSentences)) {
    if (profileCovers(covered, raw)) continue;
    out = out ? `${out} ${raw}` : raw;
    covered = covered.concat(contentTokens(raw));
    changed = true;
  }
  return { profile: out, changed };
}

/**
 * Retroactive dedup of a stored profile: keep each sentence (verbatim, oldest first —
 * the user-authored part typically leads) unless the sentences already kept cover it.
 * Idempotent; returns the input UNCHANGED (same reference) when nothing is redundant.
 */
export function dedupeProfile(profile: string | undefined): string | undefined {
  if (!profile?.trim()) return profile;
  const kept: string[] = [];
  let covered: string[] = [];
  let dropped = false;
  for (const s of profileSentences(profile)) {
    if (profileCovers(covered, s)) {
      dropped = true;
      continue;
    }
    kept.push(s);
    covered = covered.concat(contentTokens(s));
  }
  return dropped ? kept.join(" ") : profile;
}
