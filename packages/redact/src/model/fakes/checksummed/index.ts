// A checksum-VALID fake for a structured id (NATIONAL_ID / COMPANY_ID /
// BANK_ROUTE / ID): identify the SCHEME by running the engine's own validators
// over the original, then emit a fake that passes the SAME validator, re-laid
// under the original's separators. Returns null when no scheme recognises the
// value — the caller falls back to the plain digit swap, exactly as before, so
// this can only ever make a fake MORE plausible, never fail a redaction.
import { redactionCategory } from "../../../kinds";
import { AMERICAS_SCHEMES } from "./americas";
import { APAC_SCHEMES } from "./apac";
import { EUROPE_SCHEMES } from "./europe";
import { FRANCE_SCHEMES } from "./france";
import { compactId, relayId, rngFor } from "./helpers";
import type { IdScheme } from "./types";

export { ribKey } from "./france";

// ORDER MATTERS, like `RULES`: the first scheme whose validator recognises the
// original claims it. France first (the product is FR-first, and a SIRET is
// Luhn-valid by construction — it must win before any generic Luhn shape);
// checksummed schemes before structural-only ones (us_ssn, uk_nino, dk_cpr are
// last of their shapes so a REAL checksum always wins the ambiguity).
const ALL: IdScheme[] = [
  ...FRANCE_SCHEMES,
  ...EUROPE_SCHEMES,
  ...AMERICAS_SCHEMES,
  ...APAC_SCHEMES,
];
// Structural-only schemes (no checksum) go LAST: a real checksum, wherever it
// sits in the list, always wins the ambiguity over a shape that merely parses.
const SCHEMES: IdScheme[] = [...ALL.filter((s) => !s.structural), ...ALL.filter((s) => s.structural)];

// Fine category → the scheme families it may draw from. The split mirrors the
// rules' own category split (person documents / company registries / bank
// coordinates) so a person-id never receives a company-scheme fake.
const FAMILIES: Record<string, IdScheme["cat"]> = {
  national_id: "national_id",
  company_id: "company_id",
  iban: "bank_route",
};

/** The scheme that would claim `value` under `category` — exposed so the tests
 *  can pin the AMBIGUITY ordering (a 9-digit run validates several schemes). */
export function matchScheme(category: string, value: string): string | null {
  const fam = FAMILIES[redactionCategory(category)];
  if (!fam) return null;
  const compact = compactId(value);
  if (compact.length < 8 || compact.length > 24) return null;
  return (
    SCHEMES.find((s) => s.cat === fam && (s.is(compact, value) || s.is(compact.toUpperCase(), value)))?.id ?? null
  );
}

/**
 * Try to mint a checksum-valid same-scheme fake for `value`. `salt` is the
 * caller's combined attempt+conversation salt (the `fakeDigits` contract).
 * Deterministic per (digits-of-value, salt); guaranteed ≠ the original.
 */
export function fakeValidId(
  category: string,
  value: string,
  salt: number,
  convKey?: Uint8Array,
): string | null {
  // Only the id families — a quantity/date/health number must keep the plain
  // digit-swap path (categories are already split upstream in the dispatch).
  const fam = FAMILIES[redactionCategory(category)];
  if (!fam) return null;
  const compact = compactId(value);
  if (compact.length < 8 || compact.length > 24) return null;
  const scheme = SCHEMES.find(
    (s) => s.cat === fam && (s.is(compact, value) || s.is(compact.toUpperCase(), value)),
  );
  if (!scheme) return null;
  const canon = scheme.is(compact) ? compact : compact.toUpperCase();
  // A drawn body can admit no valid check (mod-11 bodies) or land on the
  // original — retry on a shifted seed; the loop is bounded and pure.
  for (let t = 0; t < 12; t++) {
    const fake = scheme.fake(canon, rngFor(canon, salt + t * 1013, convKey, t));
    if (fake && fake !== canon && fake.length === canon.length && scheme.is(fake)) {
      return relayId(value, fake);
    }
  }
  return null;
}
