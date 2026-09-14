import type { RedactionRule } from "../../types";
import { isBenignConfigValue, isCodeReference, isTemplatePlaceholder } from "../validators";

// The ENV / config SECRET-VALUE family — split out of rules.ts (300-LOC ratchet). Four rules,
// in the ORDER and at the POSITION they held: they redact the VALUE of a secret-named
// assignment (.env / config / JSON), never the key name, via a look-behind on the key.
// They run before email/token so the whole value is grabbed.

/** A captured « secret » that reads as PROSE, not a credential — the quoted rule (rule 1) spans
 *  spaces, so it can swallow a sentence (a compaction summary that quotes « `token: '...'` »
 *  then runs on). Sentence punctuation a token/passphrase never has: a comma-space, a period
 *  before a letter, a semicolon-space, the literal `\n`/`\r`/`\t` a pasted summary carries.
 *  Fail-CLOSED: only a value bearing one is dropped, never a token that could be a live secret
 *  (`__cases__/codeSecrets.test.ts`). */
const notProse = (m: string): boolean => !/,\s|\.\s*\p{L}|;\s|\\[nrt]/u.test(m);

/** Not a placeholder, not a REFERENCE, and carrying enough substance to be a secret at all.
 *  The three ways a captured « value » turns out to be none:
 *   - `<your-key>` — what a reader is told to replace;
 *   - `var.scaleway_secret_key`, `${SCW_SECRET_KEY}` — the secret is elsewhere BY DESIGN,
 *     and masking the reference corrupts the code while protecting nothing;
 *   - `...)`, `--`, `"` — the tail of a sentence a lookbehind reached into. A run with no
 *     letter AND no digit cannot be a credential, whatever the key beside it was called. */
const isValue = (m: string): boolean =>
  !isTemplatePlaceholder(m) &&
  !isCodeReference(m) &&
  /[A-Za-z0-9]/.test(m.replace(/^\W+|\W+$/g, ""));

export const ENV_SECRET_RULES: RedactionRule[] = [
  {
    // QUOTED value FIRST — its quotes are the bounds, so the value may legitimately contain
    // the characters the unquoted form must stop at. The unquoted rule below ends at `#` (the
    // env/YAML COMMENT marker, `KEY=val # note`), which inside quotes is an ordinary password
    // character: `pass: "Sm7p!Tanc2026#x"` was vaulted as `Sm7p!Tanc2026` and the tail shipped
    // in CLEAR. A truncated secret is a leaked secret. Lookbehind takes the opening quote,
    // lookahead the closing one, so the match stays the VALUE alone.
    type: "secret",
    pattern:
      /(?<=(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|client[_-]?secret|auth[_-]?token|mot[ -]de[ -]passe|code[ -]secret|phrase[ -]secr[eè]te|cl[eé][ -]secr[eè]te|(?:^|[\s{,])(?:pass|mdp|passe))[ \t]*[:=][ \t]*["'`])(?!\[REDACTED_)[^"'`\n\r]{6,}(?=["'`])/gim,
    validate: (m) => notProse(m) && isValue(m),
  },
  {
    // The bare `pass` / `mdp` KEY — ubiquitous in a YAML/compose/ini dump and absent from the
    // list above, so the value shipped in clear. Bounded by a key POSITION (line start, or
    // after whitespace/brace/comma) so a word ending in "pass" ("surpass:", "compass") cannot
    // open a secret.
    type: "secret",
    pattern:
      /(?<=(?:^|[\s{,])(?:pass|mdp|passe)["']?[ \t]*[:=][ \t]*["']?)(?!\[REDACTED_)[^\s"'`#,;]{6,}/gim,
    validate: isValue,
  },
  {
    type: "secret",
    // French key names included (FR-first app): « mot de passe : hunter2 » was only caught by
    // the OFF-by-default generic token rule — an EN/FR coverage asymmetry. `(?!\[REDACTED_)`
    // stops it re-redacting a value a structured rule already replaced.
    pattern:
      /(?<=(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|client[_-]?secret|auth[_-]?token|mot[ -]de[ -]passe|code[ -]secret|phrase[ -]secr[eè]te|cl[eé][ -]secr[eè]te)["']?\s*[:=]\s*["']?)(?!\[REDACTED_)[^\s"'#,;]{6,}/giu,
    validate: isValue,
  },
  {
    // The VALUE of an ENV assignment whose UPPER_SNAKE key ENDS in an identifier/credential/URL
    // component — `VITE_SUPABASE_PROJECT_ID=…`, `..._URL=…`, `DATABASE_URL=…`. A `.env` read via
    // a tool leaks these: a bare project id / slug or a URL escapes the jwt/api-key rules.
    // Case-SENSITIVE UPPER_SNAKE with a sensitive suffix — fires on config dumps, not on prose
    // ("id: …") or benign config (`LOG_LEVEL=debug`; `REGION` is out — `AWS_DEFAULT_REGION`).
    type: "secret",
    pattern:
      /(?<=\b[A-Z][A-Z0-9_]*_(?:ID|URL|URI|KEY|SECRET|TOKEN|PASSWORD|PASS|PWD|DSN|HOST|HOSTNAME|ENDPOINT|ACCOUNT|PROJECT|BUCKET|CREDENTIALS?|CERT|SALT|SEED|SIGNATURE|OAUTH|WEBHOOK|CONNECTION)["']?[ \t]*[:=][ \t]*["']?)(?!\[REDACTED_)[^\s"'#,;]{3,}/g,
    // The KEY suffix is the signal; the VALUE can be plainly benign (`DATABASE_HOST=localhost`).
    // A closed value list, never a shape guess (audit R2).
    validate: (m) => !isBenignConfigValue(m) && isValue(m),
  },
];
