import type { RedactionRule } from "../../types";
import { VENDOR_RULES } from "./rules.vendors";

// Additional vendor API tokens / secrets with DISTINCTIVE fixed prefixes (category
// "secret", via type "api_key"). Same philosophy as the built-in vendor-token rules
// in rules.ts: a real secret carries an unmistakable prefix, so these never fire on
// ordinary text. The SSH PRIVATE key block is already covered by rules.ts's
// `-----BEGIN … PRIVATE KEY-----` rule — here we add the SSH PUBLIC key line.
/** A documentation PLACEHOLDER cookie, not a credential: the RFC's own `name=value`, a
 *  `key=value`/`cookie-name=cookie-value` sample. A real cookie value is opaque and
 *  high-entropy — never the literal word « value » — so this only ever drops an example. */
const COOKIE_PLACEHOLDER = new Set([
  "value",
  "cookievalue",
  "cookie-value",
  "cookie_value",
  "yourvalue",
  "your-value",
  "xxx",
  "xxxx",
  "placeholder",
  "example",
  "abc123",
  "somevalue",
]);
function notPlaceholderCookie(m: string): boolean {
  const val = /^\s*[\w.-]+=([^\s;]+)/.exec(m)?.[1] ?? "";
  return !COOKIE_PLACEHOLDER.has(val.toLowerCase().replace(/^[<{[]+|[>}\]]+$/g, ""));
}

export const TOKEN_RULES: RedactionRule[] = [
  // The FOUNDING vendor prefixes (formerly inline in rules.ts — same family, one
  // home). Order preserved: they ran immediately before this table's own entries.
  { type: "api_key", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { type: "google_key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  // AKIA = long-lived access key; ASIA = STS TEMPORARY credentials — same 16-char
  // tail, equally distinctive, equally secret (a leaked ASIA key is live for hours).
  // ABIA (bearer token) and ACCA (context credential) are AWS key ids exactly like AKIA and
  // ASIA, and A3T<x> is the fifth. Verified against gitleaks' `aws-access-token`: leaving
  // three of the five out meant three live key shapes walked past a rule written for them.
  { type: "aws_key", pattern: /\b(?:A3T[A-Z0-9]|AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}\b/g },
  { type: "github_token", pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g },
  // `o` = legacy workspace token, `e` = the config access/refresh pair (which also comes
  // as `xoxe.xoxb-` / `xoxe.xoxp-`). Both are live credentials and neither was in the class.
  { type: "slack_token", pattern: /\bxox[baeoprs](?:\.xox[bp])?-[A-Za-z0-9-]{10,}\b/g },
  { type: "bearer", pattern: /\bBearer\s+[A-Za-z0-9._-]{8,}/gi },
  // Vendor API keys / tokens with distinctive prefixes → category "secret" (ON by
  // default). The generic api_token rule is OFF by default, so these dedicated
  // rules ensure real vendor secrets are always caught.
  { type: "api_key", pattern: /\b(?:sk|rk|pk)_(?:live|test)_[0-9A-Za-z]{10,}\b/g }, // Stripe
  { type: "api_key", pattern: /\bwhsec_[0-9A-Za-z]{16,}\b/g }, // Stripe webhook signing
  { type: "github_token", pattern: /\bgithub_pat_[0-9A-Za-z_]{22,}\b/g }, // GitHub fine-grained PAT
  { type: "api_key", pattern: /\bSG\.[\w-]{16,}\.[\w-]{16,}\b/g }, // SendGrid
  { type: "api_key", pattern: /\b(?:AC|SK)[0-9a-f]{32}\b/g }, // Twilio SID / API key
  { type: "api_key", pattern: /\bnpm_[0-9A-Za-z]{36}\b/g }, // npm token
  { type: "api_key", pattern: /\bGOCSPX-[\w-]{20,}\b/g }, // Google OAuth client secret
  { type: "api_key", pattern: /\bkey-[0-9a-f]{32}\b/g }, // Mailgun
  { type: "api_key", pattern: /\b[MNO][\w-]{23}\.[\w-]{6}\.[\w-]{25,}\b/g }, // Discord bot token
  // One-time / verification / PIN codes — ephemeral but hot (pasted SMS/mail bodies).
  // Gated on an explicit code word so a postal code ("code postal : 75015") or an
  // order code never matches; the value is a bare 4-8 digit run.
  {
    type: "secret",
    pattern:
      // ⚠️ NO trailing `\b` after the context words — the same trap `gate()` documents,
      // and it was LIVE here: JS `\b` is ASCII-only, so an alternative that can END on an
      // accented letter never finds its boundary. `s[ée]curit[ée]` is exactly that, so
      // « Code de sécurité : 482913 » — an OTP behind its plain French label — was never
      // redacted, while « Code de vérification » (ends in `n`) was. The `\b` is redundant
      // anyway: the separator class and the `\d` core both exclude letters, so a longer
      // word cannot chain into a match. The LEADING `\b` stays.
      /(?<=\b(?:code(?:s)?\s+(?:de\s+)?(?:v[ée]rification|s[ée]curit[ée]|confirmation|validation|connexion|unique|secret|pin|otp|2fa)|verification code|security code|one[- ]time (?:password|code|pin)|otp|pin code|code pin)[\s:：=\-–—]{0,8})\d{4,8}\b/giu,
  },

  // A UUID — the shape a session id, a tracking cookie, an API key and an object id all
  // take when a system has no prefix to give them. It is `apikey`'s reason to exist: a
  // key-shaped string whose MISS is a credential in clear (`consent_tracking=<uuid>`,
  // `The API key 4d8e1c2e-…`). The RFC-4122 form is required — version nibble 1-8 AND
  // variant nibble 8/9/a/b — so an arbitrary hex-and-dashes run (a git range, a
  // hyphenated hash) does not match, and the nil UUID is excluded with it.
  {
    type: "api_key",
    pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
  },
  { type: "api_key", pattern: /\bglpat-[0-9A-Za-z_-]{20,}\b/g }, // GitLab PAT
  { type: "api_key", pattern: /\bshp(?:at|ca|pa|ss)_[0-9a-fA-F]{32}\b/g }, // Shopify
  { type: "api_key", pattern: /\bhf_[0-9A-Za-z]{34,}\b/g }, // Hugging Face
  { type: "api_key", pattern: /\bdo[oprt]_v1_[0-9a-f]{64}\b/g }, // DigitalOcean
  { type: "api_key", pattern: /\bPMAK-[0-9a-f]{24}-[0-9a-f]{34}\b/g }, // Postman
  { type: "api_key", pattern: /\bdapi[0-9a-f]{32}\b/g }, // Databricks
  { type: "api_key", pattern: /\blin_api_[0-9A-Za-z]{40}\b/g }, // Linear
  { type: "api_key", pattern: /\bsecret_[0-9A-Za-z]{43}\b/g }, // Notion internal integration
  { type: "api_key", pattern: /\bntn_[0-9A-Za-z]{36,}\b/g }, // Notion
  { type: "api_key", pattern: /\b\d{8,10}:AA[0-9A-Za-z_-]{32,}\b/g }, // Telegram bot token
  // ⚠️ Slack app-level token. The tail was `[0-9a-f]+` — HEX — and a real one is
  // `[a-z0-9]{64}`, base36. Every token carrying a letter past 'f' therefore failed the
  // rule that exists for it; the audit sample was masked only by the generic heuristic.
  { type: "api_key", pattern: /\bxapp-\d-[A-Z0-9]+-\d+-[a-z0-9]{32,}\b/g },
  { type: "api_key", pattern: /\bdp\.pt\.[0-9A-Za-z]{40,}\b/g }, // Doppler
  // SSH PUBLIC key line (ssh-rsa / ssh-ed25519 / ecdsa-…): the key material after
  // the algorithm name is a long base64 run starting `AAAA`.
  {
    type: "api_key",
    pattern: /(?:ssh-(?:rsa|ed25519|dss)|ecdsa-sha2-nistp\d+) AAAA[0-9A-Za-z+/]{20,}={0,3}/g,
  },
  // COOKIES. There was no cookie rule at all, and the gap was measured twice over: on the
  // Nemotron corpus 313 of the 402 secrets the rules missed were a cookie declaration; on
  // the product's own audit `Cookie: sessionid=…` matched nothing. The cookie NAME is an
  // open set (`_gh_sess`, `__Secure-1PSID`, `my_app_sess`) and the value is opaque — but
  // what follows is not: `; Path=`, `; Max-Age=`, `; HttpOnly`, `; SameSite=` and the
  // `Set-Cookie:` / `Cookie:` header are literals no prose ever produces. That is the
  // second clause of the precision bar, the same one that carries a vendor prefix.
  // Two forms. The HEADER takes its whole line — every pair on it is a credential. The
  // bare DECLARATION takes `name=value` only when a cookie attribute follows, and runs
  // through the attributes so the fake replaces one coherent declaration.
  {
    type: "cookie",
    pattern: /(?<=\b(?:set-cookie|cookie)[ \t]*:[ \t]*)(?!\[REDACTED_)[^\r\n]{8,}/gi,
    validate: notPlaceholderCookie,
  },
  {
    type: "cookie",
    pattern:
      /(?<![\w.=-])(?!\[REDACTED_)[\w.-]{2,}=[^\s;]{4,}(?:[ \t]*;[ \t]*(?:path|max-age|expires|httponly|secure|samesite|domain|priority)(?:=[^\s;]*)?)+/gi,
    validate: notPlaceholderCookie,
  },
  // The rest of the vendor prefixes, grouped by tail shape — `rules.vendors.ts`. Same
  // family, so they enter through the same door; they live in their own file only
  // because there are sixty of them and this one has a size to keep.
  ...VENDOR_RULES,
];
