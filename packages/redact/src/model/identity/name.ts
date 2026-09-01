// Atomic fake identity for PLAIN NAMES — the analogue of `email.ts`, same two mechanisms
// (`buildFakeName` reuses each token's canonical fake; `nameAliases` makes every
// fragment/casing reverse to it). `reconstructName` reuses an identity whose every token
// is already known. Pure + deterministic (the caller owns the vault).
import { FAKE_LAST, hashString, firstNamePool } from "../fakes";
import { isStopword, isGenericTerm } from "../detect";
import { isCountry } from "../../engine/geo/countries";
import { isParticle } from "../../engine/honorifics";
import { capitalize } from "../../util";
import { seedFrom } from "../fakes/primitives";

/**
 * A single name-like word we may fake/alias (letters incl. accents, apostrophes,
 * hyphens; ≥2 chars) — but NEVER an ultra-common function word. A NAME with a particle
 * ("Julien de la Croix", "Jean de La Fontaine") tokenises to include "de"/"la"; without
 * this guard `buildFakeName`/`nameAliases` would fake+alias them, and the alias
 * `<fake> → de` then makes `applyVault` redact EVERY "de"/"la" in the conversation —
 * the reported over-redaction of lowercase words. (The email path already dodges this
 * via its ≥3-char `isNameToken`.)
 */
/** Civility/qualifier tokens that TRAIL a name in form and travel-industry layouts
 *  ("MARTINEZ/CAROLINE MME", "MARTINEZ/HUGO ENF"). Like a particle, such a token must
 *  never get its own fake or alias — the alias `<fake> → MME` makes `applyVault`
 *  redact every "MME" in the conversation, the same failure the particle guard exists
 *  for. Leading titles are already stripped upstream (`LEAD_HONORIFIC`); this closes the
 *  trailing side, where no detector had a reason to look. */
const TITLE_PARTS = new Set([
  "m", "mr", "mme", "mrs", "ms", "mlle", "miss", "sr", "sra", "srta", "herr", "frau",
  "dr", "prof", "me", "enf", "chd", "inf", "adt", "sr.", "jr",
]);

/**
 * A WORD-shaped token — the only question that decides whether a token may be shipped
 * VERBATIM inside a fake. Deliberately script-agnostic (`\p{L}\p{M}`): the old
 * `[A-Za-zÀ-ÿ]` class was Latin-1 only, so a combining mark (NFD — what a macOS paste and
 * most PDF extractions emit for every accented French first name), a Cyrillic/Greek
 * homoglyph or a full-width letter made the token "not a name part" and
 * {@link buildFakeName} copied the REAL token into the fake. Measured 05/08: NFD
 * « Élodie Morvan » shipped as « Élodie Delsart » — half the real identity on the wire,
 * with the vault reporting the value as redacted. `\p{M}` is in BOTH classes on purpose:
 * a decomposed accent is a mark, and excluding it truncated the token instead.
 */
const isWordToken = (t: string) => /^[\p{L}\p{M}][\p{L}\p{M}'’-]+$/u.test(t);

/**
 * May this REAL token be shipped verbatim inside the fake? Only a PARTICLE may
 * (`de`/`la`/`van` — never the user's data, and faking one would make an absurd fake) and
 * only a trailing civility (`MME`, `ENF`).
 *
 * ⚠️ This is NOT {@link isNamePart}, and conflating the two was the bug. `isNamePart`
 * answers « may I ALIAS this word conversation-wide? », which must stay narrow: aliasing
 * `de`/`FRANCE`/`signé` makes `applyVault` redact every occurrence of that word. But a
 * token that is unsafe to ALIAS is not therefore safe to SHIP — `Petit` and `Sala` are
 * top-French surnames the stopword/vocabulary lists carry, and `France` is a real
 * surname; all three left in clear inside their own fake. Faking them without aliasing
 * them keeps both properties: the whole-value vault entry still reverses the name, and no
 * single word is remapped conversation-wide.
 */
const isFakeableToken = (t: string) =>
  isWordToken(t) && !isParticle(t) && !TITLE_PARTS.has(t.replace(/[.'’]/g, "").toLowerCase());

const isNamePart = (t: string) =>
  isWordToken(t) &&
  !isStopword(t) &&
  // …nor a COUNTRY: « HSBC FRANCE » read as a name manufactured the alias FRANCE→<fake name>,
  // and `applyVault` then rewrote EVERY « FRANCE » in the conversation (log
  // 02/08) — the "countries are never masked" invariant broken by a word alias.
  !isCountry(t) &&
  // …nor a VOCABULARY word. Same failure as the particle and the civility, through a
  // third path: a detector proposes « Signé Hugo SAVEL » or « SARL BATIRENOV »,
  // the word alias is born anyway, and `applyVault` then redacts EVERY « signé » in
  // the conversation. The `filter.ts` choke point couldn't see anything wrong — it judges the
  // WHOLE value, and the whole value is indeed a name. Measured by `bench/sourceFp.bench.ts`.
  !isGenericTerm(t) &&
  !TITLE_PARTS.has(t.replace(/[.'’]/g, "").toLowerCase());

/**
 * Re-shape a pool/canonical fake token to the REAL token's casing. The pools are
 * Title-cased, so a first-seen LOWERCASE name ("madame keller") used to get a
 * Title-cased primary fake ("Nathan") whose vault key then BLOCKED the
 * [capitalize(fake) → capitalize(real)] alias `nameAliases` needs — leaving the
 * Title reading ("Mme Keller") with NO forward mapping, and `applyVault`
 * (case-sensitive) shipped it in CLEAR. Keying the primary in the real casing
 * ("nathan" → "keller") leaves "Nathan" free for the "Keller" alias.
 */
function matchTokenCase(fake: string, real: string): string {
  if (real === real.toLowerCase()) return fake.toLowerCase();
  if (real.length > 1 && real === real.toUpperCase()) return fake.toUpperCase();
  if (/^\p{Lu}/u.test(real)) return capitalize(fake);
  return fake;
}

/**
 * What JOINS the tokens of ONE name — space, `.`, `_` or `-` — capturing the separator so
 * a split round-trips (`"Julien_Sabourdin"` → `["Julien", "_", "Sabourdin"]`, even index =
 * token, odd = separator). It is the SAME set `util.ts` already treats as one entity's
 * inner separators (`entityKey` / `recaseLike` / `entityVariantRegex`), and that matters:
 * `variantOccurrences` EXPANDS a name candidate to every `[\s._-]`-joined spelling present
 * in the text, so a whitespace-ONLY split here left the engine unable to RECOGNISE the very
 * variants it had just gone looking for. A URL slug ("…/wiki/Julien_Sabourdin"), a dotted
 * handle ("julien.sabourdin") or a kebab slug ("julien-sabourdin") then failed `isNamePart`
 * as one un-resolvable blob, fell all the way through to the length-matched pool fallback,
 * and minted a BRAND-NEW identity for a person the vault already knew — one real person
 * behind several unrelated fakes ("Julien_Sabourdin" → "Anna Volneyhsjqj" while
 * "Julien Sabourdin" → "Louis Berthon"), which is the remapping bug this whole module
 * exists to prevent. Glued spellings ("JulienSabourdin") carry no separator and are
 * {@link reconstructGlued}'s job; whitespace and these separators are ours.
 */
const NAME_SEPARATORS = /([\s._-]+)/;

/** {@link NAME_SEPARATORS} without the capture — splits to the name TOKENS alone. */
const NAME_SEPARATORS_G = /[\s._-]+/;

/**
 * Build a fake full name whose every token keeps its canonical fake STABLE across
 * the whole conversation, the plain-name analogue of {@link buildFakeEmail}: each
 * real word REUSES its existing fake (`resolveFake`, case-insensitive) when one is
 * already in the vault — so "Julien" stays "Nathan" whether it appears standalone,
 * inside an email, or inside "Julien Sabourdin" — and a first-seen word gets a fresh
 * pool pick (first token → FAKE_FIRST, the rest → FAKE_LAST) avoiding `isTaken` and
 * the real value. Whitespace between tokens is preserved, so the fake keeps the same
 * token COUNT (letting {@link nameAliases} align it positionally). Non-name tokens
 * (initials, digits) pass through verbatim. Deterministic given (realName, attempt).
 * Trade-off (as with emails): the fake is no longer strictly length-matched — identity
 * consistency across fragments/casing wins over the size-hint property.
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
  // Fakes already picked for THIS name. Two tokens drawing from the SAME pool (the halves
  // of a compound "Jean-Pierre") seed identically off `h`, so without this they collapse
  // to the same pick — "Jean-Pierre" → "Hugo-Hugo". The vault's `isTaken` can't catch it:
  // nothing is registered until the whole name is allocated.
  const usedHere = new Set<string>();
  const out = parts.map((part, i) => {
    if (i % 2 === 1 || !part) return part; // keep the separator / empties verbatim
    // Which name ELEMENT (first / last) is this? A `-` joins the parts of ONE element —
    // "Jean-Pierre" is a single compound FIRST name, exactly as `gender.ts` reads it
    // ("compound → lead part") — so both halves stay element 0 and draw from the FIRST
    // pool. Space / `.` / `_` separate elements, per the first_last convention of a wiki
    // slug ("Julien_Sabourdin") or a handle ("julien.sabourdin"). Getting this wrong
    // faked "Pierre" from the SURNAME pool.
    if (i > 0 && /[\s._]/.test(parts[i - 1])) elementIdx++;
    // Verbatim ONLY for what is not the user's data: initials, digits, punctuation,
    // a particle, a trailing civility. Everything word-shaped gets a fake — see
    // `isFakeableToken` for why this is not `isNamePart`.
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
        // Never pick a fake that fails isNamePart — a pool surname that is ALSO a
        // stopword ("Petit") can never be aliased by `nameAliases` (aliasing a
        // stopword would redact every "petit" in the conversation), so the
        // person's surname canonical stays unresolvable and the next shorter
        // form ("Bilal BELMADANI" after "Bilal Hassadin BELMADANI") mints a
        // SECOND surname identity for the same person.
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
 * Reversible per-word aliases for a faked full name, the plain-name analogue of
 * {@link emailNameAliases}: align the real and fake name tokens positionally and
 * return `[fakeCap, realCap]` + `[fakeLower, realLower]` for each, so a later
 * STANDALONE token or a different CASING of the same person — extremely common in a
 * tool/search RESULT (the surname alone, Title-Cased) — substitutes to, and reverses
 * from, the SAME fake instead of minting a new identity. Only fires when both names
 * split into the SAME number of name-like tokens ({@link buildFakeName} preserves the
 * count); a token whose fake equals the real (unchanged) yields no alias. Pure.
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
 * Reconstruct a full name's fake ENTIRELY from tokens the vault already knows
 * (`resolveFake`, case-insensitive) — returns the reconstructed fake when EVERY
 * name token already has a canonical fake, else `null`. Used to reuse an existing
 * identity for a re-detected name (a different casing / the whole name reappearing
 * in a result) WITHOUT minting a new vault entry: the per-word aliases already do
 * the actual substitution, so this only supplies the placeholder for the match
 * chip. A stopword particle ("de"/"la" in "Julien de la Croix") is kept verbatim; any
 * OTHER non-name token (initial, digit) makes it bail (`null`) so only genuine names
 * take this path.
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
      // A PARTICLE (de/la/van…) is kept verbatim — it is not the user's data.
      // ⚠️ Any OTHER stopword is NOT: `Petit`, `Sala`, `France` are real surnames the
      // stopword/vocabulary lists carry, and pushing one here put the REAL token into
      // the reconstructed fake — the same leak `isFakeableToken` closes in
      // `buildFakeName`. Bail instead, so the name goes through full allocation.
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

