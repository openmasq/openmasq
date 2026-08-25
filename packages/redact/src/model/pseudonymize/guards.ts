import type { Detection, Vault } from "../../types";
import { redactionCategory } from "../../kinds";
import { variantOccurrences } from "../../util";
import { buildFakeFragments, isFakeFragment } from "../orgFragments";
import type { PseudonymizeOptions } from "./options";

/**
 * The "never re-fake a fake" predicate. A value we ALREADY issued as a fake (a vault
 * KEY), or a phrase built ENTIRELY from our fakes ("Nathan Cros" = two alias keys), or
 * a DISTINCTIVE FRAGMENT of a fake company ("Tyrell" of "Tyrell Corp"). Re-faking such a
 * value mints a SECOND identity for the same person and breaks reversibility (the
 * compounding "fake-of-a-fake" when a tool/browser RESULT echoes back a fake the model
 * typed). EXACT-case only: a case-INSENSITIVE test would leave a genuinely-sensitive REAL
 * value in CLEAR (leak) just because it equals a fake in another casing — the "france
 * typed after amiens → france" collision is prevented at the SOURCE instead (obscure-place
 * pool + the avoid guard never mint a common/present word).
 */
export function buildExistingFakeGuard(taken: Set<string>): (v: string) => boolean {
  const fakeFragments = buildFakeFragments(taken);
  return (v: string): boolean => {
    if (taken.has(v)) return true;
    const words = v.split(/\s+/).filter(Boolean);
    if (words.length > 1 && words.every((w) => taken.has(w))) return true;
    return isFakeFragment(v, fakeFragments);
  };
}

/**
 * Conversation-aware collision avoidance: a newly-minted fake must not REUSE a WORD that
 * already appears as a REAL token in the conversation — the caller's `avoid` blobs (prior
 * message contents) PLUS the CURRENT `input` PLUS every existing vault ORIGINAL (a value
 * already seen as real). Else "amiens → france" then a real "france" typed later collides
 * with the vault. The input is in the word set ON PURPOSE: the allocator's own
 * `!input.includes` guard is case-SENSITIVE and whole-candidate, so a Title-cased fake
 * ("Antoine Ravinal") sailed past an ALL-CAPS real occurrence ("Maître GERMAIN") and the
 * recase machinery then rendered the collision verbatim — un-redaction corrupts the REAL
 * person's mentions from then on.
 */
export function buildAvoidGuard(
  options: PseudonymizeOptions,
  vault: Vault,
  input = "",
): (c: string) => boolean {
  const AVOID_WORD = /\p{L}[\p{L}\p{M}'’-]*/gu;
  // A French elision glues its article to the word ("d'Amiens", "l'Yonne") — index
  // the apostrophe-split segments too, or the guarded word is invisible.
  const segments = (w: string): string[] => [w, ...w.split(/['’]/)];
  const avoidWords = new Set<string>();
  const addAvoid = (s?: string) => {
    if (!s) return;
    for (const w of s.match(AVOID_WORD) ?? [])
      for (const seg of segments(w)) if (seg.length >= 3) avoidWords.add(seg.toLowerCase());
  };
  addAvoid(input);
  for (const s of options.avoid ?? []) addAvoid(s);
  for (const v of Object.values(vault)) addAvoid(v);
  return (candidate: string): boolean => {
    if (avoidWords.size === 0) return false;
    for (const w of candidate.match(AVOID_WORD) ?? [])
      for (const seg of segments(w))
        if (seg.length >= 3 && avoidWords.has(seg.toLowerCase())) return true;
    return false;
  };
}

const ENTITY_CATS = new Set(["name", "company", "location", "address", "health", "username"]);

/**
 * Expand each ENTITY candidate to ALL its spelling variants present in the text — casing,
 * spacing, hyphen/underscore, glued ("Karl Studio"/"Karl studio"/"karl-studio"/"KarlStudio")
 * — so every form is DETECTED (and unified to one identity via the normalised `entityKey`).
 * Bounded: entity candidates only, one linear (no-backtracking) regex scan each; a high
 * candidate count (a huge tool result) SKIPS the pass to stay fast. Returns the EXTRA
 * detections to append (never mutates); structured values (numbers/emails/keys) are left exact.
 */
export function expandVariants(input: string, candidates: Detection[]): Detection[] {
  if (candidates.length > 300) return [];
  const seenVals = new Set(candidates.map((c) => c.value));
  const extra: Detection[] = [];
  for (const c of candidates) {
    if (c.forced || !ENTITY_CATS.has(redactionCategory(c.category))) continue;
    for (const occ of variantOccurrences(input, c.value)) {
      if (occ !== c.value && !seenVals.has(occ)) {
        seenVals.add(occ);
        extra.push({ ...c, value: occ });
      }
    }
  }
  return extra;
}
