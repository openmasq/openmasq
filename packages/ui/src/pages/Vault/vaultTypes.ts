import type { Messages } from "@openmasq/i18n";
import { REDACT_TYPES, redact, type RedactType } from "@openmasq/redact";
import { redactTypeLabel } from "../../privacy/redactTypeLabel";

/**
 * The Coffre's CATEGORY vocabulary, on the page's side: which of the engine's fourteen
 * types are offered first, what a term's category is called, and — the point of this
 * file — the category GUESSED from a value's shape, so adding a term is one gesture:
 * paste, add.
 */

/** The categories one actually files by hand, offered without unfolding. The rest
 *  (IP, path, date of birth…) sits behind « Plus de catégories » — and unfolds by
 *  itself when the guess lands there. */
export const FREQUENT_TYPE_KEYS: readonly string[] = ["name", "email", "phone", "company", "iban"];

/** The catch-all when nothing is recognised: a Coffre term is, by definition, a word
 *  no detector knows — most often a name. */
export const DEFAULT_TOKEN = "NAME";

function vaultTypeOf(token: string): RedactType | undefined {
  return REDACT_TYPES.find((t) => t.token === token);
}

/** The READ label of a term's category, in `t`'s language (engine label as fallback). */
export function vaultTokenLabel(token: string, t: Messages): string {
  const type = vaultTypeOf(token);
  return type ? redactTypeLabel(type, t) : token;
}

/** Engine kind → Coffre token, for the kinds the Coffre has a category for. The engine's
 *  own detectors decide (the same rules the send runs), never a second regex here. */
const TOKEN_FOR_KIND: Record<string, string> = {
  email: "EMAIL",
  phone: "PHONE",
  iban: "IBAN",
  card: "CARD",
  ip: "IP",
  dob: "DOB",
  path: "PATH",
  secret: "SECRET",
  api_key: "SECRET",
  api_token: "SECRET",
  bearer: "SECRET",
  jwt: "SECRET",
  private_key: "SECRET",
  connection_string: "SECRET",
};

const squash = (s: string): string => s.replace(/[\s.-]+/g, "").toLowerCase();

/**
 * The category a value's SHAPE suggests — `null` when no detector recognises the whole
 * value (a code name, a client's name: the Coffre's daily case).
 *
 * Runs the redaction rules on the value alone and keeps a match only when it covers the
 * value entirely (spacing and punctuation aside): a name that happens to CONTAIN a
 * number must not be filed as an identifier. A URL has no Coffre category, so it stays
 * unguessed on purpose.
 */
export function guessVaultToken(value: string): string | null {
  const v = value.trim();
  if (v.length < 4) return null;
  const { matches } = redact(v);
  const whole = matches.find((m) => squash(m.value) === squash(v));
  return whole ? (TOKEN_FOR_KIND[whole.type] ?? null) : null;
}
