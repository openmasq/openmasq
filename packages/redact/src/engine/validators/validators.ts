// Post-match validators for shape-based rules: a regex hit is only redacted when
// the validator confirms it (checksum / range), so we never redact any long
// number or decimal pair. Pure, unit-testable.

/**
 * Recover the longest VALID prefix of a greedy match. A checksum-gated rule whose
 * pattern tolerates internal spaces (IBAN: `[ ]?[A-Z0-9]` repeated) can greedily
 * swallow a following separate token — e.g. an IBAN grabbing the trailing
 * `" BIC BNPAFRPPXXX"` — so the whole match fails mod-97 and the VALID IBAN inside
 * is lost entirely (leaks). When the full match is invalid, we trim trailing
 * WHITESPACE-delimited tokens one at a time and return the longest prefix that
 * DOES validate (a real IBAN is anchored at the start, so the junk is always at
 * the end), else null. General over any `validate`.
 *
 * Trims on WHITESPACE ONLY — never on `-`/`.`/`/` — so it can't chip a segment off
 * a `-`-joined structured id whose rule uses an EXCLUSION gate (the `api_token`
 * rule's `!isStructuredId`): there the sub-segments would spuriously "validate",
 * turning a spared id into a partial redaction. A greedy checksum over-match (IBAN)
 * only ever swallows a following SPACE-separated token, so whitespace trimming is
 * both sufficient and safe.
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

/** Luhn (mod-10) over the digit string. */
/** The PURE Luhn sum, with no length floor — for shapes whose
 *  length is already fixed by their regex (Maestro 12 digits). */
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
 * The classic OCR digit CONFUSABLES, repaired: O/o→0, I/l→1. Used as a SECOND reading
 * when a checksummed value fails validation raw — « FR76 3OO0 … » is the measured shape
 * of a scanned IBAN, and refusing its broken mod-97 shipped it in CLEAR (precision-bar
 * logic inverted on OCR text: the checksum-on-repaired-reading stays the verifier, at
 * its usual 1/97 or 1/10 rarity, so this rescues the scan without opening the bare-shape
 * door). Deliberately minimal: B/S/Z/G damage exists but each mapping also corrupts a
 * LEGIT letter (IBAN BBANs carry real letters), and the raw pass already failed — a
 * rescue that misfires is just the status quo.
 */
export function deconfuseOcrDigits(s: string): string {
  return s.replace(/[Oo]/g, "0").replace(/[Il]/g, "1");
}

/**
 * A checksum-VALID ISIN (2 country letters + 9 alnum + 1 Luhn check digit, e.g.
 * `FR0011871110`, `IE00B53L3W79`). Public security identifier — NOT the user's private
 * data — so it's spared from the generic `api_token` heuristic (which otherwise reads a
 * 12-char alnum ISIN as a "key"). Check-digit gated so a random 12-char string can't
 * masquerade as one (precision bar: shape-only rules must be checksum-validated). The
 * Luhn runs over the letter-expanded string (A=10 … Z=35), same as the official ISIN spec.
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

/** French SIRET (14 digits) with a DOUBLE checksum: the full 14 AND its first 9 (the
 *  embedded SIREN) both pass Luhn. That double gate is distinctive enough to fire on
 *  SHAPE without a keyword — a card/random 14-digit run passing BOTH is ~1% — so a bare
 *  SIRET is caught as `national_id` and not grabbed by the Luhn `card` rule (a SIRET is
 *  Luhn-valid by construction). The bare 9-digit SIREN stays context-gated (too common). */
export function siret(match: string): boolean {
  const d = match.replace(/\D/g, "");
  return d.length === 14 && luhnDigits(d) && luhnDigits(d.slice(0, 9));
}

/** French intra-community VAT — "FR <key2> <SIREN9>" (e.g. "FR 79 345 360 051"). The
 *  embedded 9-digit SIREN passes Luhn AND the 2-digit key equals the official French
 *  VAT checksum `(12 + 3·(SIREN mod 97)) mod 97`. That DOUBLE checksum is distinctive
 *  enough to fire on SHAPE without a "TVA/VAT" keyword (like `siret`) — a random
 *  `FR`+11-digit run passing both is ~0.1%. Numeric key only (the modern computable
 *  form); a rare alphabetical key stays covered by the keyword-gated generic EU-VAT rule. */
export function frVat(match: string): boolean {
  const s = match.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  if (!/^FR\d{11}$/.test(s)) return false;
  const key = Number(s.slice(2, 4));
  const siren = s.slice(4); // 9 digits
  return luhnDigits(siren) && key === (12 + 3 * (Number(siren) % 97)) % 97;
}

/** ISO 7064 mod-97 — confirms an IBAN-shaped string actually checksums.
 *  Prose guard FIRST: « FR40182376 du 13 Mars 2023 » (an invoice reference followed by its
 *  date) passes mod-97 by pure chance (1/97) — the fake then produces an
 *  impossible date (« 98 Mars 4986 ») and the model "discovers" an inconsistency that
 *  doesn't exist (02/08 log). A token from a real spaced IBAN is alphanumeric OR entirely
 *  UPPERCASE (« GB29 NWBK … »); a purely alphabetic token carrying a lowercase letter
 *  (« du », « Mars ») is prose, never a BBAN. */
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
 * True when a generic-token match is really a **structured public identifier** — a
 * URL slug, a tracking/widget code, an Amazon ASIN ref, a timestamped filename — NOT
 * an API key, so the `api_token` rule can skip it (its `validate` returns
 * `!isStructuredId`). Such ids are `-`/`_`-separated and made of SHORT codes, pure
 * numbers or dictionary words (`SanDisk-Cards-Extreme-128GB-Memory`,
 * `hul_cgw_atf_d_fr_cc_0726_b2g25bj_cta`, `pd_hp_d_btf_unk_B0F1V4MY7K`,
 * `console-2026-07-08T15-38-42-180Z`). A real key/token differs: at least one segment
 * is a LONG (≥12), high-entropy run MIXING letters AND digits (`sk_live_4eC39Hq…`,
 * `x9K2m…20chars`) — the hallmark of a secret. Spare the value when it has a separator
 * and NO segment is key-like; a bare high-entropy run (no separator) is never spared.
 * This kills the FLOOD of false positives when the model browses a shopping/search
 * page (URLs are all slugs/ids). Conservative trade-off (also used elsewhere): a
 * grouped SHORT-segment secret — a `XXXXX-XXXXX-…` license key — isn't caught by THIS
 * generic rule, but dedicated vendor rules + the model detector + explicit `secrets`
 * still are.
 */
export function isStructuredId(match: string): boolean {
  const segs = match.split(/[-_]/);
  // No separator: spare a bare dictionary-word-glued-to-digits ("COEFFICIENT2",
  // "mensuelle160", "public86") — a table-extraction artefact, not a key.
  if (segs.length < 2) return isWordNumberGlue(match);
  // A segment counts as "key-like" (a real token) only if it's long, mixes letters
  // AND digits, AND is NOT itself a word+number glue ("restaurant20" in
  // "Titres-restaurant20"), so a label-glued numeric cell isn't read as a secret.
  const keyLike = (s: string) =>
    s.length >= 12 && /[A-Za-z]/.test(s) && /\d/.test(s) && !isWordNumberGlue(s);
  return !segs.some(keyLike);
}

/**
 * A natural word glued to a run of digits (or the reverse) with a SINGLE letter↔digit
 * transition — e.g. a PDF/table extraction concatenating a label and an adjacent
 * numeric cell ("COEFFICIENT2", "mensuelle160", "restaurant20", "Famille4"). A REAL
 * token interleaves letters and digits (many transitions) or is high-entropy, so it
 * never matches this; only the extraction false positives are spared. The letter
 * part must be word-like (≥3 letters with a vowel) — "AB12"/"a1" aren't spared.
 */
export function isWordNumberGlue(s: string): boolean {
  if (!/^[A-Za-z]+\d+$/.test(s) && !/^\d+[A-Za-z]+$/.test(s)) return false;
  const letters = /[A-Za-z]+/.exec(s)?.[0] ?? "";
  return letters.length >= 3 && /[aeiouyàâäéèêëïîôöùûü]/i.test(letters);
}

// ⚠️ DO NOT widen this guard to glued prose whose digit is ENCLAVED
// (« earticle3du », « ferontavantle5dumoisparvirement »): tried on 16/08/2026, rejected.
// The bench on real documents counts them as false positives, but this is a trade-off ALREADY
// made and pinned — `model/pseudonymize/gluedProse.test.ts`: "nothing in its SHAPE
// separates it from a key: we prefer a false positive over a leaked secret". The glued-prose
// mechanism lives over there (`gluedProse.ts`), not here.

/**
 * True when an `ip`-rule match is a genuine IP. IPv4 (no colon) is already octet-
 * validated by the rule's regex, so it always passes. The rule's "compact IPv6"
 * alternative, however, is loose enough to also grab colon-separated DECIMAL runs
 * that are really CLOCK TIMES (`21:21:09`, `10:50:28`) or short ids — a real IPv6 has
 * 8 hextets (or a `::` compression) and virtually always contains a hex letter or a
 * >2-char hextet. So a SHORT, all-simple-decimal colon match is rejected (it was
 * flooding the audit as "Adresses IP" false positives on timestamp columns).
 */
/**
 * ⚠️ ACCEPTED RESIDUAL (audit R3): a 4-component VERSION string and a private IPv4 are the
 * same string — `10.2.4.1` is both "on passe en 10.2.4.1" and a valid RFC1918 address. No
 * signal inside the value separates them, and the only discriminator is context ("version",
 * "v"), which is locale-dependent prose. A context guard would therefore trade a certain
 * cost (a real internal IP, mentioned right after the word « version », left in CLEAR) for
 * a cosmetic gain. The engine's asymmetry decides it: over-redacting a version string is
 * noise, under-redacting an address is a privacy failure. So this is deliberately NOT
 * guarded — do not "fix" it without a discriminator that lives in the value.
 */
export function isRealIp(match: string): boolean {
  if (!match.includes(":")) return true; // IPv4 — octets already validated by the regex
  const groups = match.split(":");
  const structured = groups.some((g) => /[A-Fa-f]/.test(g) || g.length > 2);
  return groups.length >= 8 || structured;
}

/**
 * A config VALUE that can never be a credential — so the UPPER_SNAKE env rule
 * (`…_HOST=`, `…_ENDPOINT=`, `…_PROJECT=`) must not redact it.
 *
 * The rule fires on the KEY's suffix, which is the right signal for a secret but says
 * nothing about the value: `DATABASE_HOST=localhost` redacted « localhost », and the
 * model then reasons on a fake hostname in config it was asked to debug. Same rationale
 * as the `REGION` suffix already carved out of that rule — a closed list of values, never
 * a shape heuristic, so a real secret can never fall in by accident. Audit R2.
 */
const BENIGN_CONFIG_VALUES = new Set([
  // Loopback / any-interface hosts
  "localhost", "127.0.0.1", "0.0.0.0", "::1", "host.docker.internal",
  // Booleans + the empty-ish markers
  "true", "false", "1", "0", "null", "none", "undefined", "auto", "default",
  // Environments + log levels
  "production", "prod", "development", "dev", "staging", "test", "local", "ci",
  "debug", "info", "warn", "warning", "error", "trace", "silent", "verbose",
]);

export function isBenignConfigValue(value: string): boolean {
  return BENIGN_CONFIG_VALUES.has(value.trim().toLowerCase().replace(/^["']|["']$/g, ""));
}

/**
 * A bare CONTIGUOUS 13-digit run inside the plausible epoch-MILLISECONDS window
 * (2001→2055). File mtimes/revisions ride tool results constantly ("révision:
 * 1767643960092"), and a random 13-digit run passes Luhn ~1/10 and the Thai TNIN
 * mod-11 ~1/11 — so the BARE 13-digit checksum rules (card, TNIN) sporadically
 * redacted timestamps as « card »/« national_id » (01/08 log), corrupting
 * the value for the model. Contiguous-only: a real card is spaced/dashed on documents,
 * and a SEPARATED match never enters this guard. Residual: a genuine bare Visa-13 or
 * TNIN whose value falls in the window is skipped — the gated/labelled paths still
 * catch it in context.
 */
export function isEpochMs(match: string): boolean {
  if (!/^\d{13}$/.test(match)) return false;
  const n = Number(match);
  return n >= 1_000_000_000_000 && n < 2_700_000_000_000;
}

/**
 * `DD-MM-YYYY[ HH]` — the datetime layout of FR bank/accounting exports (Qonto CSV:
 * « 01-09-2025 01:24:55 »), which is ALSO 10 digits starting `0…` and matched the FR
 * national phone rule (01/08 log: dates faked as phone numbers, years like 8322 handed
 * to the model, the statement's chronology destroyed). Layout + calendar plausibility: a real
 * phone is never written dash-dash-GLUED-space, so nothing dialable is lost. The HOUR
 * is optional ON PURPOSE: after the full match fails, `longestValidPrefix` re-runs the
 * validator on the whitespace-trimmed prefix « 01-09-2025 » — the bare date must be
 * rejected too, or the trim re-blesses exactly what the guard refused. (The phone rule
 * alone can never match an 8-digit bare date, so only that recovery path is affected.)
 */
export function isDateTimeRun(match: string): boolean {
  const m = match.match(/^(\d{2})[-.](\d{2})[-.](\d{4})(?:\s(\d{2}))?$/);
  if (!m) return false;
  const [dd, mo, yyyy] = [+m[1], +m[2], +m[3]];
  const hourOk = m[4] === undefined || +m[4] < 24;
  return dd >= 1 && dd <= 31 && mo >= 1 && mo <= 12 && yyyy >= 1900 && yyyy < 2200 && hourOk;
}
