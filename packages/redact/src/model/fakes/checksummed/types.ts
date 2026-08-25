import type { Rng } from "./helpers";

/** One checksummed id scheme the fake generator understands. `is` recognises the
 *  COMPACT original (alphanumerics only) — reusing the ENGINE validator, so the
 *  generator can never call valid what detection would not; `fake` builds a
 *  same-length compact candidate that passes `is`, or null when the drawn body
 *  admits no valid check (the dispatcher retries with a fresh seed). */
export type IdScheme = {
  id: string;
  cat: "national_id" | "company_id" | "bank_route";
  /** `raw` is the ORIGINAL formatted value — a scheme whose checksum is weak
   *  (one mod-11) may also require its national LAYOUT (dots/dashes) so it
   *  doesn't claim every digit run of its length. */
  is: (compact: string, raw?: string) => boolean;
  fake: (compact: string, rng: Rng) => string | null;
  /** STRUCTURAL-only recognition (no checksum — dk_cpr, us_ssn): tried after
   *  every checksummed scheme, so a real checksum always wins the ambiguity. */
  structural?: boolean;
};
