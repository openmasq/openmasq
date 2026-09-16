// Post-match validators for shape-based rules: a regex hit is only redacted when
// the validator confirms it (checksum / range), so we never redact any long
// number or decimal pair. Pure, unit-testable.
import { isCodeIdentifier } from "../rules/codeTerms";

/**
 * Recover the longest VALID prefix of a greedy match: a space-tolerant checksum rule (IBAN)
 * can swallow a following token (`" BIC BNPAFRPPXXX"`), fail mod-97 whole, and LOSE the
 * valid IBAN inside. Trailing WHITESPACE-delimited tokens are trimmed one at a time until
 * a prefix validates, else null. Whitespace ONLY — never `-`/`.`/`/` — so it can't chip a
 * segment off a `-`-joined structured id whose rule uses an EXCLUSION gate
 * (`!isStructuredId`), where sub-segments would spuriously "validate".
 */
export function longestValidPrefix(
  match: string,
  validate: (s: string) => boolean,
): string | null {
  if (validate(match)) return match;
  let s = match;
  for (let guard = 0; guard < 12; guard++) {
    const trimmed = s.replace(/\s+\S+\s*$/u, "").trimEnd();
    if (trimmed === s || trimmed.length < 4) break;
    s = trimmed;
    if (validate(s)) return s;
  }
  return null;
}

/** Fold FULLWIDTH forms (U+FF10-FF19 digits, U+FF21-FF3A/FF41-FF5A letters, the
 *  ideographic space U+3000) to their ASCII counterparts. CJK documents write
 *  Western ids in fullwidth — «４５３９…» — and every ASCII-classed rule is blind
 *  to them; the fullwidth rules match the RAW span and validate on this fold. */
export function foldWidth(s: string): string {
  return s
    .replace(/[０-９Ａ-Ｚａ-ｚ]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0),
    )
    .replace(/　/g, " ");
}

/** The PURE Luhn sum, with no length floor — for shapes whose length is fixed by their regex. */
export function luhnDigits(d: string): boolean {
  let sum = 0;
  let dbl = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = d.charCodeAt(i) - 48;
    if (dbl) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

/** Credit-card PAN: 13–19 digits confirmed by Luhn. */
export function luhn(match: string): boolean {
  const d = match.replace(/\D/g, "");
  return d.length >= 13 && d.length <= 19 && luhnDigits(d);
}

/**
 * The classic OCR digit CONFUSABLES, repaired: O/o→0, I/l→1. A SECOND reading when a
 * checksummed value fails raw (« FR76 3OO0 … »): the checksum on the repaired reading
 * stays the verifier, so the bare-shape door stays shut. Deliberately minimal: B/S/Z/G
 * mappings would also corrupt LEGIT letters (BBANs carry real letters).
 */
export function deconfuseOcrDigits(s: string): string {
  return s.replace(/[Oo]/g, "0").replace(/[Il]/g, "1");
}

/**
 * A checksum-VALID ISIN (2 country letters + 9 alnum + 1 Luhn check digit): a public
 * security identifier, spared from the generic `api_token` heuristic. Check-digit gated
 * so a random 12-char string can't masquerade as one; Luhn runs over the letter-expanded
 * string (A=10 … Z=35), as the spec says.
 */
export function isIsin(match: string): boolean {
  const s = match.trim().toUpperCase();
  if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(s)) return false;
  let expanded = "";
  for (const ch of s) expanded += /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
  return luhnDigits(expanded);
}

/** French SIREN (9) / SIRET (14) — Luhn over the stripped digits. */
export function sirenSiret(match: string): boolean {
  const d = match.replace(/\D/g, "");
  return (d.length === 9 || d.length === 14) && luhnDigits(d);
}

/** French SIRET (14 digits) with a DOUBLE checksum: the full 14 AND the embedded SIREN both
 *  pass Luhn — distinctive enough to fire on SHAPE (a random run passing BOTH is ~1%), so a
 *  bare SIRET is not grabbed by the `card` rule. The bare SIREN stays context-gated. */
export function siret(match: string): boolean {
  const d = match.replace(/\D/g, "");
  return d.length === 14 && luhnDigits(d) && luhnDigits(d.slice(0, 9));
}

/** French intra-community VAT — "FR <key2> <SIREN9>": the SIREN passes Luhn AND the key
 *  equals `(12 + 3·(SIREN mod 97)) mod 97`, a DOUBLE checksum distinctive enough to fire
 *  on SHAPE. Numeric key only; a rare alphabetical key is the keyword-gated EU rule's. */
export function frVat(match: string): boolean {
  const s = match.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  if (!/^FR\d{11}$/.test(s)) return false;
  const key = Number(s.slice(2, 4));
  const siren = s.slice(4); // 9 digits
  return luhnDigits(siren) && key === (12 + 3 * (Number(siren) % 97)) % 97;
}

/** ISO 7064 mod-97 — confirms an IBAN-shaped string actually checksums. Prose guard FIRST:
 *  « FR40182376 du 13 Mars 2023 » passes mod-97 by chance (1/97). A token of a real spaced
 *  IBAN is alphanumeric OR entirely UPPERCASE; a purely alphabetic token carrying a
 *  lowercase letter is prose, never a BBAN. */
export function ibanValid(match: string): boolean {
  for (const tok of match.split(/\s+/)) {
    if (/^[A-Za-zÀ-ÿ]+$/.test(tok) && !/^[A-ZÀ-Ý]+$/.test(tok)) return false;
  }
  const s = match.replace(/[\s.\-]/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  const rearranged = s.slice(4) + s.slice(0, 4);
  const expanded = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rem = 0;
  for (let i = 0; i < expanded.length; i++) {
    rem = (rem * 10 + (expanded.charCodeAt(i) - 48)) % 97;
  }
  return rem === 1;
}

/** A "lat, long" pair within valid geographic ranges (and not 0,0). */
export function latLong(match: string): boolean {
  const nums = match.match(/[-+]?\d+(?:\.\d+)?/g);
  if (!nums || nums.length < 2) return false;
  const lat = parseFloat(nums[0]);
  const lon = parseFloat(nums[1]);
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && (lat !== 0 || lon !== 0);
}

/**
 * True when a generic-token match is really a **structured public identifier** — a URL
 * slug, a tracking code, an ASIN ref, a timestamped filename — so the `api_token` rule can
 * skip it. Such ids are `-`/`_`-separated SHORT codes, numbers or words; a real key has at
 * least one LONG (≥12) segment MIXING letters AND digits. Spare the value when it has a
 * separator and NO segment is key-like; a bare high-entropy run is never spared. Accepted
 * trade-off: a grouped SHORT-segment licence key is left to the vendor rules and the model.
 */
export function isStructuredId(match: string): boolean {
  const segs = match.split(/[-_]/);
  // No separator: spare a word glued to digits ("COEFFICIENT2", a table-extraction
  // artefact) or a code identifier with an enclaved digit ("Uint8Array"), which renamed
  // would break the code a coding agent is reading (`isCodeIdentifier`).
  if (segs.length < 2) return isWordNumberGlue(match) || isCodeIdentifier(match);
  // A segment counts as "key-like" (a real token) only if it's long, mixes letters
  // AND digits, AND is NOT itself a word+number glue ("restaurant20" in
  // "Titres-restaurant20"), so a label-glued numeric cell isn't read as a secret.
  const keyLike = (s: string) =>
    s.length >= 12 && /[A-Za-z]/.test(s) && /\d/.test(s) && !isWordNumberGlue(s);
  return !segs.some(keyLike);
}

/**
 * A natural word glued to a run of digits (or the reverse) with a SINGLE letter↔digit
 * transition — a table extraction concatenating a label and a numeric cell. A REAL token
 * interleaves letters and digits. The letter part must be word-like (≥3 letters with a vowel).
 */
export function isWordNumberGlue(s: string): boolean {
  if (!/^[A-Za-z]+\d+$/.test(s) && !/^\d+[A-Za-z]+$/.test(s)) return false;
  const letters = /[A-Za-z]+/.exec(s)?.[0] ?? "";
  return letters.length >= 3 && /[aeiouyàâäéèêëïîôöùûü]/i.test(letters);
}

// ⚠️ DO NOT widen this guard to glued prose whose digit is ENCLAVED (« earticle3du »):
// nothing in its SHAPE separates it from a key, and a false positive beats a leaked secret
// (`model/pseudonymize/gluedProse.test.ts`; the mechanism lives in `gluedProse.ts`).


/**
 * A bare CONTIGUOUS 13-digit run inside the plausible epoch-MILLISECONDS window
 * (2001→2055): file mtimes ride tool results constantly, and a random 13-digit run passes
 * Luhn ~1/10 and the Thai TNIN mod-11 ~1/11. Contiguous-only: a SEPARATED match never
 * enters this guard. Residual: a genuine bare Visa-13 or TNIN in the window is skipped —
 * the gated/labelled paths still catch it in context.
 */
export function isEpochMs(match: string): boolean {
  if (!/^\d{13}$/.test(match)) return false;
  const n = Number(match);
  return n >= 1_000_000_000_000 && n < 2_700_000_000_000;
}

/**
 * `DD-MM-YYYY[ HH]` — the datetime layout of FR bank exports, ALSO 10 digits starting `0…`
 * like a FR national phone. Layout + calendar plausibility: a real phone is never written
 * dash-dash-GLUED-space. The HOUR is optional ON PURPOSE: `longestValidPrefix` re-runs the
 * validator on the trimmed prefix « 01-09-2025 », and the bare date must be rejected too.
 */
export function isDateTimeRun(match: string): boolean {
  const m = match.match(/^(\d{2})[-.](\d{2})[-.](\d{4})(?:\s(\d{2}))?$/);
  if (!m) return false;
  const [dd, mo, yyyy] = [+m[1], +m[2], +m[3]];
  const hourOk = m[4] === undefined || +m[4] < 24;
  return dd >= 1 && dd <= 31 && mo >= 1 && mo <= 12 && yyyy >= 1900 && yyyy < 2200 && hourOk;
}
