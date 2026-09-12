import type { RedactionRule } from "../../types";

// The CONNECTION-STRING family — split out of rules.ts (300-LOC ratchet). Two rules, kept
// in the ORDER and at the POSITIONS they held in the table: the DB/broker URI first (before
// `email`, so `user:pass@host.com` is grabbed whole rather than eaten as an address), the
// generic `scheme://user:pass@host` after the token rules. Both redact the WHOLE URI —
// it embeds the credential — and both skip a PLACEHOLDER.

/** A password token that a real credential is essentially never equal to: it is the WORD a
 *  documentation example writes in place of one. Closed on purpose — a precision filter, not
 *  a capability gate — and it fails toward MASKING (an unknown password is still a secret). */
const PLACEHOLDER_SECRET = new Set([
  "pass",
  "password",
  "passwd",
  "pwd",
  "secret",
  "yourpassword",
  "your_password",
  "changeme",
  "xxxx",
  "xxxxxxxx",
  "placeholder",
  "motdepasse",
  "pa55word",
  "hunter2",
]);
const PLACEHOLDER_USER = new Set([
  "user",
  "username",
  "youruser",
  "your_user",
  "admin",
  "root",
  "dbuser",
  "utilisateur",
]);

/** A `scheme://user:pass@host…` whose credentials AND host are placeholders — a documented
 *  shape (`postgres://user:pass@host`), never a live secret. The host clinches it: a real
 *  connection points at an FQDN or an IP (a dot), so a dot-less host beside a placeholder
 *  password is an example. Anything with a real-looking host stays MASKED. */
function isPlaceholderConn(value: string): boolean {
  const at = value.indexOf("@");
  if (at < 0) return false;
  const creds = value.slice(value.indexOf("//") + 2, at);
  const colon = creds.indexOf(":");
  if (colon < 0) return false;
  const user = strip(creds.slice(0, colon));
  const pass = strip(creds.slice(colon + 1));
  const host = value.slice(at + 1).split(/[:/?#]/)[0];
  const hostPlaceholder = !host.includes(".") && !/^\[?[A-Fa-f0-9:]+\]?$/.test(host);
  if (!hostPlaceholder) return false;
  return PLACEHOLDER_SECRET.has(pass.toLowerCase()) || PLACEHOLDER_USER.has(user.toLowerCase());
}

/** A token stripped of the `<…>`, `{…}`, `[…]` a template wraps it in, so `<password>` and
 *  `{{PASS}}` read as their word. */
const strip = (s: string): string => s.replace(/^[<{[]+|[>}\]]+$/g, "").replace(/^\{+|\}+$/g, "");

const notPlaceholder = (m: string) => !isPlaceholderConn(m);

/** DB / broker connection URIs — redacted WHOLE because they embed credentials. */
export const DB_URI_RULE: RedactionRule = {
  type: "connection_string",
  pattern:
    /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|rediss?|amqps?|mssql|jdbc:[a-z0-9]+):\/\/[^\s"'<>`]+/gi,
  validate: notPlaceholder,
};

/** Credentials embedded in ANY URL — generalises the above to `scheme://user:pass@host…`. */
export const URL_CREDS_RULE: RedactionRule = {
  type: "connection_string",
  pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s@]+@[^\s"'<>`]+/gi,
  validate: notPlaceholder,
};
