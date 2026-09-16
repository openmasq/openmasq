import type { RedactionRule } from "../../types";
import {
  luhn,
  ibanValid,
  siret,
  latLong,
  isStructuredId,
  isRealIp,
  isReservedIp,
  isIsin,
  deconfuseOcrDigits,
  isEpochMs,
  isDateTimeRun,
  luhnDigits,
} from "../validators";
import { ssnValid } from "../validators/validators.identifiers";
import { isValidIntlPhone } from "../phones";
import { ADDRESSED_URL } from "../urls";
import { INTERNATIONAL_RULES } from "./rules.international";
import { FRANCE_RULES } from "./rules.france";
import { UK_RULES } from "./rules.uk";
import { GLOBAL_RULES } from "./rules.global";
import { FULLWIDTH_RULES } from "./rules.fullwidth";
import { DB_URI_RULE, URL_CREDS_RULE } from "./rules.connection";
import { EMAIL_RULES } from "./rules.email";
import { isCodeTerm, isIntegrityHash, isLowEntropyRun, isNumericLiteral } from "./codeTerms";
import { ENV_SECRET_RULES } from "./rules.envSecrets";
import { CRYPTO_RULES } from "./rules.crypto";
import { TOKEN_RULES } from "./rules.tokens";
import { IDENTIFIER_RULES } from "./rules.identifiers";
import { HEALTH_RULES } from "./rules.health";
import { USERNAME_RULES } from "./rules.username";
import { WRAP, SP, gate, maxOneWrap } from "./rules.international.util";

// Absolute filesystem paths (they leak the OS username and machine layout). A path
// component may continue over space-joined runs that start with an uppercase letter or
// digit ("Wine Atlas", "Application Support") without swallowing prose after the path.
// ":" is excluded so "file.log:42" stops at the path. POSIX paths are anchored on a
// home/system root with a look-behind that skips the path part of a URL; Windows uses a
// drive letter or a UNC share (a share path names an internal server).
const PATH_SEG = `[^\\s/\\\\:,;"'\`<>|?*]+(?:[ \\t]+[A-Z0-9][^\\s/\\\\:,;"'\`<>|?*]*)*`;
const PATH_ROOTS =
  "Users|home|root|Volumes|private|var|tmp|opt|srv|mnt|media|etc|usr|bin|sbin|Applications|Library|System|Network|Desktop|Documents|Downloads|data|workspace";
const PATH_RE = new RegExp(
  `[A-Za-z]:\\\\(?:${PATH_SEG}[\\\\/]?)+` + // Windows drive path: C:\Users\…
    "|" +
    // Windows UNC share: \\srv-fichiers\compta\2026.
    `\\\\\\\\${PATH_SEG}(?:[\\\\/]${PATH_SEG})+` +
    "|" +
    `(?<![\\w:/\\\\])(?:~|/(?:${PATH_ROOTS}))(?:/${PATH_SEG})+`, // POSIX ~/… or /Users/…
  "g",
);

// Bare file names + relative paths ("report.docx", "Downloads/Wine Atlas.pdf"). The
// extension comes from a curated document/media/archive list — never source code, web
// files or TLDs — so a coding chat ("App.tsx", "claude.ai") is left alone. Case-sensitive
// on purpose: the uppercase-continuation guard relies on it.
// A name component has two forms. LOOSE may continue over ` [A-Z0-9]…` ("budget 2024.xlsx")
// and is only safe under a path CONTEXT that proves the lowercase head is a path segment;
// a BARE filename uses ANCHORED (starts capitalised/digit, or one lowercase word), else
// "Mets à jour README.md" would span "jour README.md". Chars are `\w` + Latin-1 accents,
// with parens and `-` as continuation only.
const FC = "\\wÀ-ÖØ-öø-ÿ";
const FILE_SEG_LOOSE = `[${FC}][${FC}()-]*(?:[ \\t]+[A-Z0-9À-ÖØ-Þ(][${FC}()-]*)*`;
const FILE_SEG_ANCHORED = `(?:[A-Z0-9À-ÖØ-Þ][${FC}()-]*(?:[ \\t]+[A-Z0-9À-ÖØ-Þ(][${FC}()-]*)*|[${FC}][${FC}()-]*)`;
const FILE_EXT =
  "pdf|docx?|xlsx?|pptx?|csv|tsv|txt|rtf|odt|ods|odp|pages|numbers|key|md|epub|mobi" +
  "|png|jpe?g|gif|bmp|tiff?|webp|heic|svg|psd|eps|zip|rar|7z|tar|gz|tgz|dmg|pkg" +
  "|mp3|wav|flac|aac|m4a|mp4|mov|avi|mkv|webm";
const FILE_RE = new RegExp(
  `(?<![${FC}:/\\\\.])(?:` +
    // Rooted or explicitly-relative (`/x`, `./x`, `~/x`) — a path context.
    `(?:(?:\\.\\.?|~)?[/\\\\])(?:${FILE_SEG_LOOSE}[/\\\\])*${FILE_SEG_LOOSE}` +
    // …or at least one directory segment before the name (`Downloads/budget 2024`).
    `|(?:${FILE_SEG_LOOSE}[/\\\\])+${FILE_SEG_LOOSE}` +
    // …or a BARE filename, which has no path context to lean on → anchored.
    `|${FILE_SEG_ANCHORED}` +
    `)\\.(?:${FILE_EXT})\\b`,
  "g",
);

// IP addresses. IPv4 has validated octets; IPv6 admits `::` compression (`fe80::1`).
// Boundaries are `(?<![:.\w])…(?![:.\w])`, not `\b`, so a leading `::` still anchors;
// `isRealIp` rejects the residual look-alikes (a clock time, a C++ `std::vector`).
const H4 = "[A-Fa-f0-9]{1,4}";
const IPV4_RE =
  "\\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\b";
const IPV6_RE =
  `(?<![:.\\w])(?:(?:${H4}:){7}${H4}` +
  `|(?:${H4}:){1,2}(?::${H4}){1,5}` +
  `|(?:${H4}:){1,3}(?::${H4}){1,4}` +
  `|(?:${H4}:){1,4}(?::${H4}){1,3}` +
  `|(?:${H4}:){1,5}(?::${H4}){1,2}` +
  `|(?:${H4}:){1,6}:${H4}` +
  `|${H4}:(?::${H4}){1,6}` +
  `|:(?::${H4}){1,7}` +
  `|(?:${H4}:){1,7}:)(?![:.\\w])`;
const IP_RE = new RegExp(`${IPV4_RE}|${IPV6_RE}`, "g");

// The WHOLE URL, when the « url » category is active. The pattern is the one of `../urls.ts`
// that also defines the suppression gate's spans: one definition of "what a URL is", or one
// side masks while the other protects. Placed EARLY and greedy so a secret inside a URL is
// masked with it (one vault entry, no marker swallowed on the next pass). When the category
// is OFF (the default) the rule does not run and the suppression gate keeps its role.
const URL_RULE: RedactionRule = { type: "url", pattern: new RegExp(ADDRESSED_URL.source, "gi") };

// Order matters: most specific shapes first.
export const RULES: RedactionRule[] = [
  URL_RULE,
  // Paths run early so the whole path is ONE span before a numeric/token rule nibbles a
  // segment; absolute first so a path ending in a file is not split at its last component.
  { type: "path", pattern: PATH_RE },
  { type: "path", pattern: FILE_RE },
  {
    type: "private_key",
    pattern: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
  },
  {
    type: "jwt",
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  },
  // DB / broker connection URIs — before `email`, else `user:pass@host.com` is eaten first.
  // A placeholder (`postgres://user:pass@host`) is skipped (`rules.connection.ts`).
  DB_URI_RULE,
  // Vendor-prefixed API keys / tokens + SSH public keys — ONE family: rules.tokens.ts.
  ...TOKEN_RULES,
  // Crypto wallet addresses (category "secret").
  { type: "crypto", pattern: /\b0x[a-fA-F0-9]{40}\b/g }, // Ethereum
  // Bitcoin + the other chains — ONE family, ONE home: `rules.crypto.ts`.
  ...CRYPTO_RULES,
  // MAC (→ "ip"). Adjacency guards reject a 6-pair run inside a longer hex dump (`rules.mac.test.ts`).
  {
    type: "mac",
    pattern:
      /(?<![0-9A-Fa-f]{2}[:-])(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}(?![:-][0-9A-Fa-f]{2})/g,
  },
  // Credentials embedded in ANY URL — `scheme://user:pass@host…`, before `email`.
  URL_CREDS_RULE,
  // The VALUE of a secret-named assignment (.env / config / JSON) — the key stays, the value
  // goes. Four rules (quoted first, bare `pass`, generic FR/EN, UPPER_SNAKE), before email/token
  // so the whole value is grabbed; a value that reads as PROSE is dropped. `rules.envSecrets.ts`.
  ...ENV_SECRET_RULES,
  // Structured identifiers (IMEI/ICCID/VIN/MRZ, LATAM ids, RIB/sort-code/VAT), all
  // checksummed or context-gated. BEFORE `card` so a checksummed IMEI/ICCID keeps its
  // `national_id` category instead of reading as a Luhn-passing card. `rules.identifiers.ts`.
  ...IDENTIFIER_RULES,
  // Health data (blood group / MRN / ICD-10 diagnosis code) — all context-gated, so
  // an ordinary "A+", "F32" or bare number never false-positives. See rules.health.ts.
  ...HEALTH_RULES,
  // Pseudo / handle (`@drovaksinatra`) → category "username" (OFF by default). A bare
  // leading-`@` handle, excluding emails / npm scopes / CSS at-rules. See rules.username.ts.
  ...USERNAME_RULES,
  // Country-independent artifacts (MRZ lines, VIN) — EARLY, so a whole MRZ line is
  // ONE span before card/IBAN/phone can nibble digit runs out of it.
  ...GLOBAL_RULES,
  // French SIRET (14 digits) on SHAPE, BEFORE `card`: a SIRET is Luhn-valid by
  // construction and must be categorised `company_id`, not card. The double checksum
  // (full-14 AND first-9/SIREN) is distinctive enough to fire without a keyword; the
  // 9-digit SIREN stays context-gated below.
  {
    type: "company_id",
    pattern: new RegExp(String.raw`\b\d(?:(?:${SP}|${WRAP})?\d){13}\b`, "g"),
    validate: (m) => maxOneWrap(m) && siret(m),
  },
  // FULLWIDTH twins of NIR/card/IBAN (CJK documents) — checksum-validated on the
  // ASCII fold, matched on the raw glyphs. See rules.fullwidth.ts.
  ...FULLWIDTH_RULES,
  // Financial + official ids, checksum-validated. BEFORE phone so a 16-digit PAN is not
  // split. Separators tolerate ONE mid-value line wrap (`WRAP` + the `maxOneWrap` guard).
  {
    // 13–19 digits confirmed by Luhn. Separators are what documents emit: 1-2 spaces (a
    // PDF column gap), the typographic dashes Word substitutes, a hyphenated line break.
    type: "card",
    // ⚠️ `(?:${WRAP})?`, never `${WRAP}?` — WRAP ends in `*`, so a bare `?` turns it LAZY
    // and the dash then REQUIRES a newline.
    // The digit class admits the OCR confusables O/o INSIDE only (a scan renders a PAN as
    // « 5453 O112 … »); the second Luhn reading over `deconfuseOcrDigits` plus ≥10 real
    // digits make that safe. First and last chars are real digits, or the pattern becomes
    // startable on the trailing o of a word and its failed match CONSUMES the real card.
    // The two lookarounds keep the rule OUT of a longer hexadecimal identifier: a dash-group
    // carrying a hex LETTER is a UUID continuing, a dashed PAN is digits all the way.
    pattern: new RegExp(
      String.raw`(?<![0-9a-f]-)\b\d(?:(?:${SP}{1,2}|[-–—](?:${WRAP})?|${WRAP})?[0-9Oo]){11,17}(?:${SP}{1,2}|[-–—](?:${WRAP})?|${WRAP})?\d\b(?!-[0-9a-f]*[a-f])`,
      "g",
    ),
    // `!isEpochMs` before Luhn: a 13-digit epoch-ms timestamp passes Luhn one time in ten.
    validate: (m) =>
      maxOneWrap(m) &&
      !isEpochMs(m) &&
      (luhn(m) || ((m.match(/\d/g)?.length ?? 0) >= 10 && luhn(deconfuseOcrDigits(m)))),
  },
  {
    // SHORT Maestro: 12 digits, the only length under 13 a network issues. Any 12-digit
    // run passes Luhn one time in ten, so TWO anchors: the Maestro IIN prefix AND Luhn.
    // After the 13-19 rule so a longer run keeps priority.
    type: "card",
    pattern: new RegExp(
      String.raw`\b(?:5018|5020|5038|5893|6304|6759|676[123])(?:(?:${SP}{1,2}|[-–—](?:${WRAP})?|${WRAP})?\d){8}\b`,
      "g",
    ),
    // `luhn()` carries the 13-19 floor; the regex fixes the length, only the checksum is needed.
    validate: (m) => {
      const d = m.replace(/\D/g, "");
      return maxOneWrap(m) && d.length === 12 && luhnDigits(d);
    },
  },
  {
    // 12 digits WITHOUT a Maestro IIN: only under an explicit card label — the context
    // replaces the prefix as the second anchor, Luhn stays the first (same logic as SSN).
    // gate()'s HEAD blocks « postcard ».
    type: "card",
    pattern: gate(
      String.raw`(?:credit|debit)\s+card|card|carte(?:\s+(?:bancaire|bleue|de\s+cr[ée]dit))?|kreditkarte|tarjeta|carta`,
      String.raw`\d(?:(?:${SP}{1,2})?\d){11}\b`,
    ),
    validate: (m) => {
      const d = m.replace(/\D/g, "");
      return d.length === 12 && luhnDigits(d);
    },
  },
  {
    // Country(2) + check(2) + 10–30 alnum, confirmed by ISO 7064 mod-97, in ANY case
    // ("FR76", "fr76", "Fr76"): the 1/97 checksum is the precision gate, not the casing.
    type: "iban",
    pattern: new RegExp(
      String.raw`\b[A-Za-z]{2}\d{2}(?:(?:${SP}|\.|${WRAP})?[A-Za-z0-9]){10,30}\b`,
      "g",
    ),
    // The second reading (`deconfuseOcrDigits`) accepts the scanned form « FR76 3OO0 … »;
    // the checksum on the repaired reading stays the verifier.
    validate: (m) => maxOneWrap(m) && (ibanValid(m) || ibanValid(deconfuseOcrDigits(m))),
  },
  {
    // US SSN (dashed), CONTEXT-GATED: a bare 3-2-4 number is a common order-ref shape.
    // `ssnValid` then rejects impossible area/group/serial values.
    type: "national_id",
    pattern: gate("ssn|social security(?: number| no)?", String.raw`\d{3}-\d{2}-\d{4}\b`),
    validate: ssnValid,
  },
  // French identity / tax / residency family (`rules.france.ts`) — after card/IBAN,
  // before the international spread.
  ...FRANCE_RULES,
  // United Kingdom, distinctive forms (`rules.uk.ts`) — ⚠️ order matters: BETWEEN FR and EIN.
  ...UK_RULES,
  // US EIN — context-gated (bare `\d\d-\d{7}` is too generic).
  { type: "company_id", pattern: gate("ein", String.raw`\d{2}-\d{7}\b`) },
  // International identity / tax / health / licence / vehicle / bank schemes
  // (`rules.international.ts`) — after card/IBAN, before phone can nibble a digit run.
  ...INTERNATIONAL_RULES,
  // BIC / SWIFT bank code — context-gated (8/11 upper-alnum matches plain ALLCAPS words).
  // Up to four LOWERCASE filler words may sit between keyword and code ("le BIC de la
  // banque : X"), lowercase-only so an ALLCAPS code is never eaten as filler. Separators
  // include quotes and parentheses (a serialised pair, a bracketed value). The keyword is
  // case-insensitive letter by letter: an `i` flag on the whole rule would let `[A-Z]{6}`
  // match any eight-letter word after « bic ». The value stays strictly capitalised.
  {
    type: "bic",
    pattern:
      /(?<=\b(?:code\s+)?(?:[Bb][Ii][Cc]|[Ss][Ww][Ii][Ff][Tt])(?:\s*\/\s*(?:[Bb][Ii][Cc]|[Ss][Ww][Ii][Ff][Tt]))?\b[\s:.=/,;"'«»()[\]-]*(?:[a-zà-ÿ]+[\s:.=/,;"'«»()[\]-]+){0,4})[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b/g,
  },
  // GPS coordinates "lat, long" — 4+ decimals + valid geographic range.
  {
    type: "geo",
    pattern: /[-+]?\d{1,3}\.\d{4,}\s*,\s*[-+]?\d{1,3}\.\d{4,}/g,
    validate: latLong,
  },
  // Phone — INTERNATIONAL (+/00 prefix). The regex alone matches any `00`-prefixed run,
  // so only a libphonenumber-valid, dialable number survives (`phones.ts`).
  {
    type: "phone",
    // Separator class = the shared `SP` (plain + no-break + narrow no-break space, which
    // French typography and PDF extraction emit) plus tab/dot/dash. The parenthesised form
    // `+1 (212) 736-5000` is deliberately NOT here: `detectPhones` covers it, and widening
    // this pattern is a no-op for the pipeline (`isolatedFormats.test.ts`).
    pattern: new RegExp(String.raw`(?:\+|00)\d{1,3}(?:(?:${SP}|[\t.\-])?\d{1,4}){3,8}`, "g"),
    validate: isValidIntlPhone,
  },
  // Phone — French national `0X XX XX XX XX`, kept WITHOUT libphonenumber so unusual but
  // real allocations survive. The leading 0 keeps plain figures ("850 000") out.
  {
    type: "phone",
    // `!isDateTimeRun`: a datetime « 01-09-2025 01:24:55 » is also ten digits starting 0.
    pattern: new RegExp(String.raw`\b0\d(?:(?:${SP}|[\t.\-])?\d{2}){4}\b`, "g"),
    validate: (m) => !isDateTimeRun(m),
  },
  // The three EMAIL arms (plain unicode, obfuscated [at], OCR-split space): rules.email.ts.
  ...EMAIL_RULES,
  // IPv4 (validated octets) + IPv6 `::` compression. `isRealIp` rejects colon look-alikes;
  // `isReservedIp` drops a special-use constant that names no host (`validators.network`).
  {
    type: "ip",
    pattern: IP_RE,
    validate: (m) => isRealIp(m) && !isReservedIp(m),
  },
  // Generic API-key-ish token: ≥8 chars of [A-Za-z0-9_-] mixing a digit AND a NON-HEX
  // letter. The non-hex letter spares hexadecimal ids/hashes/UUIDs, which are not secrets;
  // a purely-hex secret is left to the dedicated rules and the model detector. The
  // (?!REDACTED_) guard keeps it off the placeholders. Toggleable "apikey".
  {
    type: "api_token",
    // `(?<!%)`: a percent-encoded URL puts a `\b` between `%` and the hex, and the encoded
    // tail would read as a key; a real token is never glued to a leading `%`.
    // `(?<!sha…-[base64])`: never start INSIDE a subresource-integrity hash — `+` and `/`
    // split it in two matches, and renaming the second half breaks the page's SRI check.
    pattern:
      /\b(?<!%)(?<!sha(?:1|224|256|384|512)-[A-Za-z0-9+/_=-]{0,128})(?!REDACTED_)(?=[A-Za-z0-9_-]*[G-Zg-z])(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{8,}\b/g,
    // Spare structured public ids (slugs, tracking codes, ASIN refs: short `-`/`_`-separated
    // segments with no long high-entropy run) and a checksum-valid ISIN, which the model
    // needs verbatim. A real key (a ≥12 mixed-alnum segment) still matches.
    validate: (m) =>
      !isStructuredId(m) &&
      !isIsin(m) &&
      !isCodeTerm(m) &&
      !isNumericLiteral(m) &&
      !isIntegrityHash(m) &&
      !isLowEntropyRun(m),
  },
];

export { LABELS } from "./rules.labels";
