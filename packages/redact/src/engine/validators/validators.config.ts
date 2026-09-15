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
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "host.docker.internal",
  // Booleans + the empty-ish markers
  "true",
  "false",
  "1",
  "0",
  "null",
  "none",
  "undefined",
  "auto",
  "default",
  // Environments + log levels
  "production",
  "prod",
  "development",
  "dev",
  "staging",
  "test",
  "local",
  "ci",
  "debug",
  "info",
  "warn",
  "warning",
  "error",
  "trace",
  "silent",
  "verbose",
]);

export function isBenignConfigValue(value: string): boolean {
  const v = value.trim().replace(/^["']|["']$/g, "");
  if (BENIGN_CONFIG_VALUES.has(v.toLowerCase())) return true;
  // A loopback / special-use URL (`OPENAI_BASE_URL=http://127.0.0.1:8787/v1`) names no host
  // and holds no secret — the reserved-IP line, drawn for the URL-shaped config value.
  if (isReservedHostUrl(v)) return true;
  // A value that IS a template interpolation (`${url}/v1`, `${API_HOST}`) is a variable
  // REFERENCE, never a literal secret: masking it corrupts the code and protects nothing.
  if (isCodeReference(v)) return true;
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

/**
 * A value that REFERENCES a secret rather than being one.
 *
 * Configuration written as CODE is full of these, and they are the opposite of a leak: the
 * whole point of `secret_key = var.scaleway_secret_key` is that the secret is NOT in the
 * file. Masking the reference corrupts the code the model was asked to read — it can no
 * longer see which variable feeds which field — and protects nothing, because there was
 * nothing there to protect.
 *
 * The idioms, one per ecosystem, all saying "look it up elsewhere":
 *   `${VAR}` `$VAR`            shell / compose / CI interpolation
 *   `var.x` `local.x`          Terraform inputs and locals
 *   `data.x.y` `module.x.y`    Terraform lookups
 *   `each.value` `self.x`      Terraform iteration
 *   `secrets.X` `vars.X`       GitHub Actions contexts
 *   `env("X")` `getenv("X")`   a call whose ARGUMENT is a name, never a value
 *   `process.env.X`            Node
 *   `os.environ["X"]`          Python
 *
 * ⚠️ Anchored WHOLE, on purpose. A value that merely CONTAINS one of these still has
 * something else in it, and that something else may be the secret
 * (`sk_live_…${SUFFIX}`). Fails toward MASKING, like every gate in this file.
 */
const CODE_REFERENCE =
  /^(?:\$\{[^}]{1,80}\}|\$[A-Za-z_][A-Za-z0-9_]{0,60}|(?:var|local|each|self|data|module|secrets|vars|inputs|config)\.[A-Za-z_][\w.[\]"'-]{0,80}|(?:process\.env|os\.environ|import\.meta\.env)[.[][\w.[\]"']{0,80}|[A-Za-z_$][\w$.]{0,60}\([^()]{0,140}\))$/;

/**
 * A call the capture CUT. The rules that feed this stop at a comma or a quote, so a call
 * with arguments arrives beheaded — the four characters `env(` are a real example from a
 * session — and only its opening paren survives.
 *
 * ⚠️ An unclosed `(` is NOT enough on its own: `hunter2(sekret` is a password with a paren
 * in it and has exactly that shape. So either nothing follows the paren (`env(`,
 * `os.getenv(` — a value that stops there was cut, it was not chosen), or the callee is
 * unmistakably a function: dotted (`os.getenv`) or camelCase (`loadKey`). A password that is
 * also a dotted or camelCase identifier followed by an open paren is a shape we accept
 * losing; one that is a lowercase word plus a digit is not.
 */
const CUT_CALL_BARE = /^[A-Za-z_$][\w$.]{0,60}\($/;
const CUT_CALL_NAMED = /^(?:[A-Za-z_$][\w$]*\.[\w$.]{1,60}|[a-z_$][\w$]*[A-Z][\w$]*)\([^)]*$/;
const isCutCall = (v: string): boolean => CUT_CALL_BARE.test(v) || CUT_CALL_NAMED.test(v);

/**
 * Real code is not one reference per line — it is an EXPRESSION of them:
 *
 *   export const X_API_KEY   = env("X_API_KEY") || env("X_KEY");
 *   export const X_CLIENT_ID = env("X_CLIENT_ID") || (looksOauth1 ? "" : env("X_ACCESS_TOKEN"));
 *
 * Measured on the file this was reported from. Testing the whole value as a SINGLE reference
 * caught `var.x` and missed every line above, which is most of what a config module is made
 * of. So the value is cut on the operators that join alternatives, and it is a reference when
 * EVERY part is one — a literal anywhere in the chain still masks the whole expression,
 * because a key pasted between two `||` is exactly the leak this must not wave through.
 *
 * The trailing `;` and `,` go first: a statement's punctuation is not part of its value, and
 * the rules that feed this capture up to the end of the line.
 */
const JOINERS = /\s*(?:\|\||\?\?|\?|:|&&)\s*/;
const STRING_LITERAL = /^(?:""|''|``)$/;
/**
 * A bare name — the CONDITION of a ternary, the only part of these expressions that is not
 * itself one of the idioms above. `hunter2` has exactly this shape, so two things make it
 * safe: it is accepted only as a PART, never as the whole value, and only while a genuine
 * reference stands beside it in the same chain.
 * ⚠️ Residual, stated: an UNQUOTED literal sitting in such a chain would ride through. In
 * every language written this way a bare word IS an identifier — a literal is quoted, and a
 * quoted one is not this shape — so the residual is source that would not compile.
 */
const BARE_NAME = /^[A-Za-z_$][\w$]{0,40}$/;

/**
 * Cutting on the joiners unbalances the parentheses: the grouping paren of
 * `(looksOauth1 ? "" : env("X"))` falls on two different parts. Only the SURPLUS is stripped
 * — a part with as many opens as closes keeps them, because those are a CALL's own and
 * removing them turns `env("X")` into something no idiom matches.
 */
function balance(part: string): string {
  const opens = (part.match(/\(/g) ?? []).length;
  const closes = (part.match(/\)/g) ?? []).length;
  if (closes > opens) return part.replace(new RegExp(`\\){${closes - opens}}$`), "");
  if (opens > closes) return part.replace(new RegExp(`^\\({${opens - closes}}`), "");
  return part;
}

export const isCodeReference = (value: string): boolean => {
  const v = value.trim().replace(/[;,]+$/, "");
  if (CODE_REFERENCE.test(v) || isCutCall(v)) return true;
  // An EXPRESSION: every alternative must itself be a reference, and at least one must be a
  // genuine idiom — a chain of bare names says nothing, and a value that is ONE bare name is
  // a word, which is what a weak password is too.
  const parts = v
    .split(JOINERS)
    .map((p) => balance(p.trim()))
    .filter(Boolean);
  const part = (p: string) => STRING_LITERAL.test(p) || BARE_NAME.test(p) || CODE_REFERENCE.test(p);
  if (parts.length > 1 && parts.every(part) && parts.some((p) => CODE_REFERENCE.test(p)))
    return true;
  // An interpolation with something AROUND it — `${url}/v1`, `$HOST:8080`. Still a
  // reference, but only while what remains once the interpolations are removed could not
  // itself be the secret: `${PREFIX}sk_live_51H8xKLMN…` is not a reference, it is a key with
  // a prefix pasted on. Same residue test as `isTemplatePlaceholder`, for the same reason.
  const rest = v.replace(/\$\{[^}]{1,80}\}|\$[A-Za-z_][A-Za-z0-9_]{0,60}/g, "");
  if (rest === v) return false;
  // ⚠️ What is LEFT must be structural — a path, a port, a separator — and nothing else.
  // A password carries `$` like any other symbol (`)2B+Fr$o^`), so a bare `$o` inside one
  // would otherwise read as an interpolation and spare the whole thing. Anything a
  // credential is made of (brackets, `+`, `^`, `!`, `#`, quotes) says this is not a
  // reference; the length test then refuses a key with an interpolation pasted in front.
  return /^[\w./:@=,-]*$/.test(rest) && !/[A-Za-z0-9_-]{12,}/.test(rest);
};

/**
 * An UPPER_SNAKE identifier used AS a value — `token: X_ACCESS_TOKEN`.
 *
 * That is the NAME of a secret, and a name is a label: the engine already refuses to mask
 * `iban` or `siren` for the same reason. A real credential is drawn from a random alphabet,
 * so it carries lowercase; an all-caps run joined by underscores is how every ecosystem
 * spells a variable and how none of them spells a key. Requiring the underscore is what
 * keeps an all-caps HEX key (`ABCDEF0123456789`) out of this.
 */
export const isEnvVarName = (value: string): boolean =>
  /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/.test(value.trim());
