// Atomic fake identity for PLAIN NAMES — the analogue of `email.ts`, same two mechanisms
// (`buildFakeName` reuses each token's canonical fake; `nameAliases` makes every
// fragment/casing reverse to it). `reconstructName` reuses an identity whose every token
// is already known. Pure + deterministic (the caller owns the vault).
import { FAKE_LAST, hashString, firstNamePool } from "../fakes";
import { isStopword, isGenericTerm } from "../detect";
import { isCountry } from "../../engine/geo/countries";
import { isParticle } from "../../engine/persons";
import { capitalize } from "../../util";
import { seedFrom } from "../fakes/primitives";

/** Civility/qualifier tokens that TRAIL a name in form and travel layouts ("MARTINEZ/CAROLINE
 *  MME"). Like a particle, such a token must never get its own fake or alias — the alias
 *  `<fake> → MME` would make `applyVault` redact every "MME" in the conversation. Leading
 *  titles are stripped upstream (`LEAD_HONORIFIC`); this closes the trailing side. */
const TITLE_PARTS = new Set([
  "m", "mr", "mme", "mrs", "ms", "mlle", "miss", "sr", "sra", "srta", "herr", "frau",
  "dr", "prof", "me", "enf", "chd", "inf", "adt", "sr.", "jr",
]);

/**
 * A WORD-shaped token — the only question that decides whether a token may be shipped
 * VERBATIM inside a fake. Script-agnostic (`\p{L}\p{M}`): a Latin-1 class made an NFD
 * combining mark (what a macOS paste and most PDF extractions emit) "not a name part", and
 * the REAL token was copied into the fake. `\p{M}` is in BOTH classes on purpose.
 */
const isWordToken = (t: string) => /^[\p{L}\p{M}][\p{L}\p{M}'’-]+$/u.test(t);

/**
 * May this REAL token be shipped verbatim inside the fake? Only a PARTICLE (`de`/`van` —
 * never the user's data) and a trailing civility (`MME`). ⚠️ NOT {@link isNamePart}, which
 * answers « may I ALIAS this word conversation-wide? » and must stay narrow. A token unsafe
 * to ALIAS is not therefore safe to SHIP: `Petit`, `Sala`, `France` are surnames the
 * stopword lists carry. Faking without aliasing keeps both properties.
 */
const isFakeableToken = (t: string) =>
  isWordToken(t) && !isParticle(t) && !TITLE_PARTS.has(t.replace(/[.'’]/g, "").toLowerCase());

const isNamePart = (t: string) =>
  isWordToken(t) &&
  !isStopword(t) &&
  // …nor a COUNTRY (« HSBC FRANCE » read as a name would alias FRANCE→<fake>, and
  // `applyVault` rewrites EVERY « FRANCE »), nor a VOCABULARY word (« Signé Hugo SAVEL »
  // would alias « signé »). The `filter.ts` choke point judges the WHOLE value and cannot
  // see this; the guard belongs to the per-word alias.
  !isCountry(t) &&
  !isGenericTerm(t) &&
  !TITLE_PARTS.has(t.replace(/[.'’]/g, "").toLowerCase());

/**
 * Re-shape a pool fake token to the REAL token's casing. The pools are Title-cased; keying
 * the primary in the real casing ("nathan" → "keller") leaves "Nathan" free for the
 * "Keller" alias `nameAliases` needs, else the Title reading has no forward mapping and
 * `applyVault` (case-sensitive) ships it in CLEAR.
 */
function matchTokenCase(fake: string, real: string): string {
  if (real === real.toLowerCase()) return fake.toLowerCase();
  if (real.length > 1 && real === real.toUpperCase()) return fake.toUpperCase();
  if (/^\p{Lu}/u.test(real)) return capitalize(fake);
  return fake;
}

/**
 * What JOINS the tokens of ONE name — space, `.`, `_` or `-` — capturing the separator so a
 * split round-trips (even index = token, odd = separator). The SAME set `util.ts` treats as
 * one entity's inner separators (`entityKey` / `recaseLike` / `entityVariantRegex`):
 * `variantOccurrences` EXPANDS a candidate to every `[\s._-]`-joined spelling, so a
 * whitespace-only split here would mint a BRAND-NEW identity for a slug or dotted handle of
 * a person the vault already knows — the remapping bug this module exists to prevent. Glued
 * spellings ("JulienSabourdin") are {@link reconstructGlued}'s job.
 */
const NAME_SEPARATORS = /([\s._-]+)/;

/** {@link NAME_SEPARATORS} without the capture — splits to the name TOKENS alone. */
const NAME_SEPARATORS_G = /[\s._-]+/;

/**
 * Build a fake full name whose every token keeps its canonical fake STABLE across the
 * conversation, the plain-name analogue of {@link buildFakeEmail}: each real word REUSES its
 * existing fake (`resolveFake`, case-insensitive), a first-seen word gets a fresh pool pick
 * (first element → FAKE_FIRST, the rest → FAKE_LAST) avoiding `isTaken` and the real value.
 * Separators are preserved so the fake keeps the token COUNT ({@link nameAliases} aligns
 * positionally). Deterministic given (realName, attempt). Trade-off: no longer strictly
 * length-matched — identity consistency wins over the size hint.
 */
export function buildFakeName(
  realName: string,
  attempt: number,
  resolveFake: (real: string) => string | undefined,
  isTaken: (fake: string) => boolean,
  salt = 0,
  convKey?: Uint8Array,
): string {
  const h = seedFrom(convKey, `name:${attempt}`, realName, hashString(realName) + salt + attempt * 101);
  const parts = realName.split(NAME_SEPARATORS); // even index = token, odd = separator
  let elementIdx = 0;
  // Fakes already picked for THIS name: two tokens drawing from the SAME pool (the halves of
  // "Jean-Pierre") seed identically off `h` and would collapse to "Hugo-Hugo"; the vault's
  // `isTaken` sees nothing until the whole name is allocated.
  const usedHere = new Set<string>();
  const out = parts.map((part, i) => {
    if (i % 2 === 1 || !part) return part; // keep the separator / empties verbatim
    // Which name ELEMENT (first / last) is this? A `-` joins the parts of ONE element
    // ("Jean-Pierre" is one compound FIRST name, as `gender.ts` reads it); space / `.` / `_`
    // separate elements (the first_last convention of a slug or a handle).
    if (i > 0 && /[\s._]/.test(parts[i - 1])) elementIdx++;
    // An INITIAL is the user's data too: in an anonymised ruling « C. » is all that is left
    // of the person. It gets another letter, seeded like a name token. SAFE for the vault:
    // `nameAliases` refuses a single letter, so no « C » elsewhere is ever rewritten.
    if (/^\p{Lu}$/u.test(part)) {
      const seed = h + attempt + i * 7;
      for (let k = 0; k < 26; k++) {
        const cand = String.fromCharCode(65 + ((seed + k) % 26));
        if (cand !== part) return cand;
      }
    }
    // Verbatim ONLY for what is not the user's data (`isFakeableToken`).
    if (!isFakeableToken(part)) return part;
    const canon = resolveFake(part); // reuse the person's canonical fake for this word…
    if (canon) {
      usedHere.add(canon.toLowerCase());
      return matchTokenCase(canon, part); // …recased to THIS occurrence's casing
    }
    // …else pick a fresh, un-taken pool name (first element → same-gender FIRST, rest → LAST).
    // Seed off the token's POSITION too, so sibling tokens of one pool start apart.
    // Each candidate is recased to the REAL token's casing BEFORE the taken check —
    // the recased form is what becomes the vault key (see matchTokenCase).
    const pool = elementIdx === 0 ? firstNamePool(part) : FAKE_LAST;
    const seed = h + attempt + i * 7;
    let fake = matchTokenCase(pool[seed % pool.length], part);
    for (let k = 0; k < pool.length; k++) {
      const cand = matchTokenCase(pool[(seed + k) % pool.length], part);
      if (
        cand.toLowerCase() !== part.toLowerCase() &&
        !isTaken(cand) &&
        !usedHere.has(cand.toLowerCase()) &&
        // Never pick a fake that fails isNamePart: a pool surname that is ALSO a stopword
        // ("Petit") can never be aliased, so the surname canonical stays unresolvable and
        // the next shorter form mints a SECOND identity for the same person.
        isNamePart(cand)
      ) {
        fake = cand;
        break;
      }
    }
    usedHere.add(fake.toLowerCase());
    return fake;
  });
  return out.join("");
}

/**
 * Reversible per-word aliases for a faked full name, the analogue of {@link emailNameAliases}:
 * align real and fake tokens positionally and return `[fakeCap, realCap]` +
 * `[fakeLower, realLower]` for each, so a STANDALONE token or another CASING of the same
 * person (the surname alone in a tool result) reverses to the SAME fake. Only when both
 * split into the SAME token count; an unchanged token yields no alias. Pure.
 */
export function nameAliases(realName: string, fakeName: string): [string, string][] {
  const realToks = realName.split(NAME_SEPARATORS_G).filter(Boolean);
  const fakeToks = fakeName.split(NAME_SEPARATORS_G).filter(Boolean);
  const out: [string, string][] = [];
  if (realToks.length !== fakeToks.length) return out; // can't align safely → no alias
  for (let i = 0; i < realToks.length; i++) {
    const real = realToks[i];
    const fake = fakeToks[i];
    if (!isNamePart(real) || !isNamePart(fake)) continue;
    if (fake.toLowerCase() === real.toLowerCase()) continue;
    out.push([capitalize(fake), capitalize(real)]); // "Brivetonyv" -> "Sabourdin"
    out.push([fake.toLowerCase(), real.toLowerCase()]); // "brivetonyv" -> "sabourdin"
  }
  return out;
}

/**
 * Reconstruct a full name's fake ENTIRELY from tokens the vault already knows — the fake
 * when EVERY name token has a canonical fake, else `null`. Reuses an identity for a
 * re-detected name WITHOUT minting a new vault entry (the aliases already substitute; this
 * only supplies the chip's placeholder). A particle is kept verbatim; any OTHER non-name
 * token bails, so only genuine names take this path.
 */
export function reconstructName(
  value: string,
  resolveFake: (real: string) => string | undefined,
): string | null {
  const parts = value.split(NAME_SEPARATORS);
  let sawName = false;
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1 || !parts[i]) {
      out.push(parts[i]);
      continue;
    }
    if (!isNamePart(parts[i])) {
      // A PARTICLE is kept verbatim. Any OTHER stopword is NOT (`Petit`, `Sala`, `France` are
      // surnames): pushing one would put the REAL token into the fake. Bail instead.
      if (isParticle(parts[i])) {
        out.push(parts[i]);
        continue;
      }
      return null; // not a pure name we can reconstruct
    }
    const canon = resolveFake(parts[i]);
    if (!canon) return null; // a token with no canonical fake → cannot reconstruct
    sawName = true;
    out.push(canon);
  }
  return sawName ? out.join("") : null;
}

