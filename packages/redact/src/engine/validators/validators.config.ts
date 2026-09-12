// The CONFIG-VALUE gates — what the env/config secret rules must NOT take for a secret.
// Split out of `validators.ts` (300-LOC ratchet); one family, one file, reached through the
// same barrel. Both are PRECISION filters on rules that fire on a KEY's name, and both fail
// toward MASKING: a value they do not recognise is still a secret.
import { isReservedHostUrl } from "./validators.network";

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
  const v = value.trim().replace(/^["']|["']$/g, "");
  if (BENIGN_CONFIG_VALUES.has(v.toLowerCase())) return true;
  // A loopback / special-use URL (`OPENAI_BASE_URL=http://127.0.0.1:8787/v1`) names no host
  // and holds no secret — the reserved-IP line, drawn for the URL-shaped config value.
  if (isReservedHostUrl(v)) return true;
  // A value that IS a template interpolation (`${url}/v1`, `${API_HOST}`) is a variable
  // REFERENCE, never a literal secret: masking it corrupts the code and protects nothing.
  if (/^\$\{[\w.]+\}/.test(v)) return true;
  return isTemplatePlaceholder(v);
}

/** `<your-ref>`, `{{GITHUB_TOKEN}}` — the other two ways documentation writes "put yours
 *  here". Spared only when REMOVING the placeholders leaves nothing a secret could hide in:
 *  `https://<your-ref>.supabase.co` reduces to `https://.supabase.co`, while
 *  `https://<region>.amazonaws.com/AKIAIOSFODNN7EXAMPLE` still carries its key and stays
 *  MASKED. That residue test is the whole guard — brackets alone would let a real value ride
 *  beside a placeholder. Fails toward masking, like every gate here. */
const PLACEHOLDER = /<[\w.\- ]{1,40}>|\{\{[\w.\- ]{1,40}\}\}/g;
const SECRET_RUN = /[A-Za-z0-9_-]{12,}/;
export function isTemplatePlaceholder(value: string): boolean {
  const rest = value.replace(PLACEHOLDER, "");
  if (rest !== value) return !SECRET_RUN.test(rest);
  // ⚠️ A capture CUT inside a placeholder still has to read as one. A rejected match is
  // retried one whitespace-token SHORTER (`longestValidPrefix`), so `"<votre mot de passe>"`
  // comes back as `<votre mot de` — the closing `>` gone and the guard blind. An UNCLOSED
  // opener is that cut; anchored at the head, so a real secret merely CONTAINING a `<`
  // (`Sm7p!<Tanc2026`) is untouched, and the residue test still refuses a long run.
  return /^(?:<|\{\{)/.test(value) && !SECRET_RUN.test(value.replace(/^[<{]+/, ""));
}
