import type { RedactionRule } from "../../types";

// Additional vendor API tokens / secrets with DISTINCTIVE fixed prefixes (category
// "secret", via type "api_key"). Same philosophy as the built-in vendor-token rules
// in rules.ts: a real secret carries an unmistakable prefix, so these never fire on
// ordinary text. The SSH PRIVATE key block is already covered by rules.ts's
// `-----BEGIN … PRIVATE KEY-----` rule — here we add the SSH PUBLIC key line.
export const TOKEN_RULES: RedactionRule[] = [
  // The FOUNDING vendor prefixes (formerly inline in rules.ts — same family, one
  // home). Order preserved: they ran immediately before this table's own entries.
  { type: "api_key", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { type: "google_key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  // AKIA = long-lived access key; ASIA = STS TEMPORARY credentials — same 16-char
  // tail, equally distinctive, equally secret (a leaked ASIA key is live for hours).
  { type: "aws_key", pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { type: "github_token", pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g },
  { type: "slack_token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
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
  { type: "api_key", pattern: /\bxapp-\d-[A-Z0-9]+-\d+-[0-9a-f]+\b/g }, // Slack app-level token
  { type: "api_key", pattern: /\bdp\.pt\.[0-9A-Za-z]{40,}\b/g }, // Doppler
  // SSH PUBLIC key line (ssh-rsa / ssh-ed25519 / ecdsa-…): the key material after
  // the algorithm name is a long base64 run starting `AAAA`.
  {
    type: "api_key",
    pattern: /(?:ssh-(?:rsa|ed25519|dss)|ecdsa-sha2-nistp\d+) AAAA[0-9A-Za-z+/]{20,}={0,3}/g,
  },
];
