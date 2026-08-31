import type { RedactionRule, RedactionType } from "../../types";
import { luhn, ibanValid, siret, latLong, isStructuredId, isRealIp, isIsin, isBenignConfigValue, deconfuseOcrDigits, isEpochMs, isDateTimeRun, luhnDigits } from "../validators";
import { ssnValid } from "../validators/validators.identifiers";
import { isValidIntlPhone } from "../phones";
import { ADDRESSED_URL } from "../urls";
import { INTERNATIONAL_RULES } from "./rules.international";
import { FRANCE_RULES } from "./rules.france";
import { UK_RULES } from "./rules.uk";
import { GLOBAL_RULES } from "./rules.global";
import { FULLWIDTH_RULES } from "./rules.fullwidth";
import { EMAIL_RULES } from "./rules.email";
import { CRYPTO_RULES } from "./rules.crypto";
import { TOKEN_RULES } from "./rules.tokens";
import { IDENTIFIER_RULES } from "./rules.identifiers";
import { HEALTH_RULES } from "./rules.health";
import { USERNAME_RULES } from "./rules.username";
import { WRAP, SP, gate, maxOneWrap } from "./rules.international.util";

// Absolute filesystem paths that leak the OS username / machine layout — the
// thing a local-filesystem MCP tool returns ("/Users/<you>/Downloads/…"). A path
// COMPONENT is a run of path chars, optionally extended by space-joined runs that
// start with an uppercase letter or digit, so a real folder name with a space
// ("Wine Atlas", "Application Support") is captured whole while ordinary prose
// after a path ("/Users/tom/Downloads et puis…") is NOT swallowed. ":" is excluded
// so "file.log:42" stops at the path. POSIX paths are anchored on a home/system
// root (and a look-behind avoids matching the path part of a URL); Windows uses a
// drive letter. Redacted reversibly, so the model gets a fake path and the real
// one is restored when it calls the tool back.
const PATH_SEG = `[^\\s/\\\\:,;"'\`<>|?*]+(?:[ \\t]+[A-Z0-9][^\\s/\\\\:,;"'\`<>|?*]*)*`;
const PATH_ROOTS =
  "Users|home|root|Volumes|private|var|tmp|opt|srv|mnt|media|etc|usr|bin|sbin|Applications|Library|System|Network|Desktop|Documents|Downloads|data|workspace";
const PATH_RE = new RegExp(
  `[A-Za-z]:\\\\(?:${PATH_SEG}[\\\\/]?)+` + // Windows drive path: C:\Users\…
    "|" +
    // Windows UNC share: \\srv-fichiers\compta\2026. Measured as a miss while every
    // other path shape (macOS/Windows/Linux) was caught — and a share path names an
    // internal server, which is exactly what a path is redacted for.
    `\\\\\\\\${PATH_SEG}(?:[\\\\/]${PATH_SEG})+` +
    "|" +
    `(?<![\\w:/\\\\])(?:~|/(?:${PATH_ROOTS}))(?:/${PATH_SEG})+`, // POSIX ~/… or /Users/…
  "g",
);

// Bare file names + relative paths a directory listing returns ("report.docx",
// "Downloads/Wine Atlas.pdf") — the file/folder NAMES, which are sensitive too.
// The extension is from a curated **document / media / archive** list, NOT
// source-code or web (.ts/.json/.html…) or TLDs (.com/.ai) — so a coding chat
// ("App.tsx", "package.json", "claude.ai") is left untouched while a user's actual
// documents are redacted. Case-sensitive on purpose (the upper-case continuation
// guard relies on it; an upper-case extension like ".PDF" is left to the model).
// A name COMPONENT, in two forms — the difference is what the R1 audit turned on.
//   LOOSE: a run that may CONTINUE over ` [A-Z0-9]…`, so "budget 2024.xlsx" and
//   "Wine Atlas.pdf" are captured whole.
//   ANCHORED: the same, but it may only START capitalised/digit, OR be a single
//   lowercase word with no continuation.
// A LOOSE run is only safe where a path CONTEXT proves the lowercase head is a path
// component, not prose (bare, "Mets à jour README.md" → span "jour README.md") — a BARE
// filename uses ANCHORED. Chars: `\w` + Latin-1 accents, + parens/`-` as CONTINUATION
// only — ASCII `\w` broke at "détaillé"/"(2025…" and shipped the whole name in CLEAR.
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

// IP addresses. IPv4 has validated octets. IPv6 supports `::` compression (the
// common form — `fe80::1`, `2001:db8::1` — which the old `(?:h:){2,7}h` shape
// MISSED). Boundaries are `(?<![:.\w])…(?![:.\w])` (not `\b`, so a leading `::`
// still anchors); `isRealIp` then rejects the residual look-alikes (a clock time
// `21:21:09`, a C++ `std::vector` can't even form hextets). A valid uncompressed
// IPv6 is exactly 8 groups, so no loose 3-7-group alternative is needed.
const H4 = "[A-Fa-f0-9]{1,4}";
const IPV4_RE = "\\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\b";
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

// The WHOLE URL, when the « url » category is active. ⚠️ The pattern comes from `../urls.ts`
// — the SAME one that defines the spans for the suppression gate. Two definitions of "what
// a URL is" would sooner or later say two different things about the same address (rule
// 9), and here one decides to mask while the other decides to protect.
//
// The rule is placed EARLY and deliberately greedy: it claims the whole address, its
// query token included. A secret INSIDE a URL is therefore masked along with it rather than
// separately — same protection, one single vault entry, and no marker swallowed by the
// pattern on the next pass. When the category is OFF (the default), this rule
// doesn't run at all and the suppression gate resumes its usual role.
const URL_RULE: RedactionRule = { type: "url", pattern: new RegExp(ADDRESSED_URL.source, "gi") };

// Order matters: most specific shapes first.
export const RULES: RedactionRule[] = [
  URL_RULE,
  // Filesystem paths run early so the whole path is grabbed as ONE span before a
  // numeric/token rule could nibble a segment (a digit run, an api-token-ish word).
  // Absolute paths first, then bare file names / relative paths (so an absolute
  // path that ends in a file is grabbed whole, not split at its last component).
  { type: "path", pattern: PATH_RE },
  { type: "path", pattern: FILE_RE },
  {
    type: "private_key",
    pattern:
      /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
  },
  {
    type: "jwt",
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  },
  // DB / broker connection URIs — redacted WHOLE because they embed credentials.
  // Must run BEFORE `email`, else the `user:pass@host.com` part is eaten first.
  {
    type: "connection_string",
    pattern:
      /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|rediss?|amqps?|mssql|jdbc:[a-z0-9]+):\/\/[^\s"'<>`]+/gi,
  },
  // Vendor-prefixed API keys / tokens + SSH public keys — ONE family: rules.tokens.ts.
  ...TOKEN_RULES,
  // Crypto wallet addresses (category "secret").
  { type: "crypto", pattern: /\b0x[a-fA-F0-9]{40}\b/g }, // Ethereum
  // Bitcoin + the other chains — ONE family, ONE home: `rules.crypto.ts`.
  ...CRYPTO_RULES,
  // MAC address (network device id → category "ip").
  { type: "mac", pattern: /\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b/g },
  // Credentials embedded in ANY URL — generalises connection_string to
  // `scheme://user:pass@host…`. Runs before `email` so `pass@host` isn't eaten.
  {
    type: "connection_string",
    pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s@]+@[^\s"'<>`]+/gi,
  },
  // The VALUE of a secret-named assignment (.env / config / JSON): redact only the
  // value, not the key name, via a look-behind on the key. Covers `KEY=val`,
  // `KEY: val`, `"key": "val"`; the key may be a suffix of a longer name
  // (DATABASE_PASSWORD=…). Runs before email/token so the whole value is grabbed.
  {
    // QUOTED value FIRST — its quotes are the bounds, so the value may legitimately
    // contain the characters the unquoted form must stop at. The unquoted rule below
    // ends at `#` (the env/YAML COMMENT marker, `KEY=val # note`), which inside quotes
    // is an ordinary password character: `pass: "Sm7p!Tanc2026#x"` was vaulted as
    // `Sm7p!Tanc2026` and the tail shipped in CLEAR. A truncated secret is a leaked
    // secret. Lookbehind takes the opening quote, lookahead the closing one, so the
    // match stays the VALUE alone.
    type: "secret",
    pattern:
      /(?<=(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|client[_-]?secret|auth[_-]?token|mot[ -]de[ -]passe|code[ -]secret|phrase[ -]secr[eè]te|cl[eé][ -]secr[eè]te|(?:^|[\s{,])(?:pass|mdp|passe))[ \t]*[:=][ \t]*["'`])(?!\[REDACTED_)[^"'`\n\r]{6,}(?=["'`])/gim,
  },
  {
    // The bare `pass` / `mdp` KEY — ubiquitous in a YAML/compose/ini dump and absent
    // from the list below, so the value shipped in clear. Bounded by a key POSITION
    // (line start, or after whitespace/brace/comma) so an ordinary word ending in
    // "pass" ("surpass: …", "compass") can never open a secret.
    type: "secret",
    pattern: /(?<=(?:^|[\s{,])(?:pass|mdp|passe)["']?[ \t]*[:=][ \t]*["']?)(?!\[REDACTED_)[^\s"'`#,;]{6,}/gim,
  },
  {
    type: "secret",
    // The `(?!\[REDACTED_)` guard stops it from re-redacting a value a structured
    // rule already replaced (e.g. `STRIPE_SECRET=[REDACTED_API_KEY_1]`).
    pattern:
      // French key names included (FR-first app): « mot de passe : hunter2 » was only
      // caught by the OFF-by-default generic token rule — an EN/FR coverage asymmetry.
      /(?<=(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|client[_-]?secret|auth[_-]?token|mot[ -]de[ -]passe|code[ -]secret|phrase[ -]secr[eè]te|cl[eé][ -]secr[eè]te)["']?\s*[:=]\s*["']?)(?!\[REDACTED_)[^\s"'#,;]{6,}/giu,
  },
  // The VALUE of an ENV / config assignment whose UPPER_SNAKE key ENDS in an
  // identifier/credential/URL component — `VITE_SUPABASE_PROJECT_ID=…`,
  // `..._URL=…`, `..._KEY=…`, `DATABASE_URL=…`. A `.env` read via a filesystem
  // tool leaks these: a bare project id / slug or a URL escapes the structured
  // (jwt/api-key) rules. Case-SENSITIVE UPPER_SNAKE with a sensitive suffix, so it
  // fires on config dumps but NOT on lowercase prose ("id: …") or benign config
  // (`LOG_LEVEL=debug`, `NODE_ENV=production` — their suffix isn't in the list).
  // Only the value is taken (key kept); `(?!\[REDACTED_)` avoids double-redacting.
  {
    type: "secret",
    pattern:
      // `REGION` is deliberately NOT in the suffix list: `AWS_DEFAULT_REGION=eu-west-3`
      // is never sensitive, and redacting it corrupted config the model reasons on.
      /(?<=\b[A-Z][A-Z0-9_]*_(?:ID|URL|URI|KEY|SECRET|TOKEN|PASSWORD|PASS|PWD|DSN|HOST|HOSTNAME|ENDPOINT|ACCOUNT|PROJECT|BUCKET|CREDENTIALS?|CERT|SALT|SEED|SIGNATURE|OAUTH|WEBHOOK|CONNECTION)["']?[ \t]*[:=][ \t]*["']?)(?!\[REDACTED_)[^\s"'#,;]{3,}/g,
    // The KEY suffix is the signal for a secret; the VALUE can still be plainly benign
    // (`DATABASE_HOST=localhost`, `NODE_ENV=production`). A closed value list, never a
    // shape guess — same discipline as the `REGION` suffix carve-out above. Audit R2.
    validate: (m) => !isBenignConfigValue(m),
  },
  // Extra structured identifiers (IMEI/ICCID/VIN/MRZ + LATAM ids + RIB/sort-code/
  // VAT). All checksum-validated, distinctive, or context-gated. BEFORE `card` so a
  // checksummed IMEI/ICCID wins its `national_id` category instead of being grabbed
  // as a Luhn-passing card digit run. See `rules.identifiers.ts`.
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
  // French SIRET (14 digits) on SHAPE — BEFORE `card` so a bare SIRET (which is
  // Luhn-valid by construction) is categorised `national_id`, not redacted as a credit
  // CARD. The `siret` gate (full-14 Luhn AND first-9/SIREN Luhn) is a double checksum,
  // distinctive enough to fire without the SIREN/SIRET keyword (a 16-digit PAN can't
  // match the exactly-14 pattern; a 14-digit Diners card passing BOTH checksums is ~1%,
  // and it stays redacted either way). The 9-digit SIREN stays context-gated below.
  {
    type: "company_id",
    pattern: new RegExp(String.raw`\b\d(?:(?:${SP}|${WRAP})?\d){13}\b`, "g"),
    validate: (m) => maxOneWrap(m) && siret(m),
  },
  // FULLWIDTH twins of NIR/card/IBAN (CJK documents) — checksum-validated on the
  // ASCII fold, matched on the raw glyphs. See rules.fullwidth.ts.
  ...FULLWIDTH_RULES,
  // Financial + official ids — checksum-validated so we don't grab any long
  // number. Run BEFORE phone so a 16-digit PAN isn't split by the phone rule.
  // Separators tolerate ONE mid-value line wrap (`WRAP` + the `maxOneWrap` guard):
  // a hard-wrapped paste ("FR76 3000 2005\n5000 …") used to pass in CLEAR.
  {
    // 13–19 digits, confirmed by Luhn. The separator set is what real documents
    // actually emit: 1-2 spaces (a PDF column gap doubles them), the TYPOGRAPHIC
    // dashes Word auto-substitutes (– —) beside the ASCII one, and a hyphenated
    // line break (`14-\n86`) beside the plain wrap. Luhn + maxOneWrap keep the
    // widened separators from grabbing ordinary figures.
    type: "card",
    // ⚠️ `(?:${WRAP})?`, never `${WRAP}?` — WRAP ends in `*`, so a bare `?` turns
    // it LAZY instead of optional and the dash then REQUIRES a newline.
    // The digit class also admits the OCR confusables O/o (« 5453 O112 … » is how a
    // scan renders a PAN) — the SECOND Luhn reading over `deconfuseOcrDigits` is what
    // makes that widening safe, plus ≥10 REAL digits so a letter-heavy token never
    // reaches the checksum at all. Confusables INSIDE only: first and last chars are
    // REAL digits, or the pattern becomes STARTABLE on the trailing o of an ordinary
    // word (« cartão 5005-… » matched from the o, failed Luhn, and its rejection
    // CONSUMED the real card behind it — the DOB_RULE lesson yet again).
    pattern: new RegExp(String.raw`\b\d(?:(?:${SP}{1,2}|[-–—](?:${WRAP})?|${WRAP})?[0-9Oo]){11,17}(?:${SP}{1,2}|[-–—](?:${WRAP})?|${WRAP})?\d\b`, "g"),
    // ⚠️ `!isEpochMs` (13 CONTIGUOUS digits) before Luhn: an epoch-ms timestamp passes it
    // ~1 time in 10 — file revisions were going out as « card » (`validators.ts`).
    validate: (m) =>
      maxOneWrap(m) && !isEpochMs(m) &&
      (luhn(m) || ((m.match(/\d/g)?.length ?? 0) >= 10 && luhn(deconfuseOcrDigits(m)))),
  },
  {
    // SHORT Maestro: 12 digits, the only length under 13 a real network actually issues.
    // Any 12-digit run passes Luhn 1 time in 10 — far too common
    // (order number, invoice ref) for the shape alone — so TWO anchors: the
    // Maestro IIN prefix (5018/5020/5038/5893/6304/6759/6761-3) AND Luhn. After the
    // 13-19 rule: a longer run keeps priority. Found by the external bench
    // (the presidio-research generator emits these forms; 10 leaks measured).
    type: "card",
    pattern: new RegExp(String.raw`\b(?:5018|5020|5038|5893|6304|6759|676[123])(?:(?:${SP}{1,2}|[-–—](?:${WRAP})?|${WRAP})?\d){8}\b`, "g"),
    // `luhn()` carries the classic PAN's 13-19 floor — here the length is fixed
    // to 12 by the regex itself, only the pure checksum (`luhnDigits`) needs verifying.
    validate: (m) => { const d = m.replace(/\D/g, ""); return maxOneWrap(m) && d.length === 12 && luhnDigits(d); },
  },
  {
    // 12 digits WITHOUT a Maestro IIN: only under an EXPLICIT card label
    // (« credit card 587428561654 » — real forms from the external bench). The context
    // replaces the prefix as the second anchor, Luhn stays the first — same
    // logic as the SSN rule. gate()'s HEAD blocks « postcard »; « mastercard »
    // is never followed by a bare 12-digit run in the wild without being a card.
    type: "card",
    pattern: gate(
      String.raw`(?:credit|debit)\s+card|card|carte(?:\s+(?:bancaire|bleue|de\s+cr[ée]dit))?|kreditkarte|tarjeta|carta`,
      String.raw`\d(?:(?:${SP}{1,2})?\d){11}\b`,
    ),
    validate: (m) => { const d = m.replace(/\D/g, ""); return d.length === 12 && luhnDigits(d); },
  },
  {
    // Country(2) + check(2) + 10–30 alnum, confirmed by ISO 7064 mod-97 — in ANY
    // case: "FR76…" (documents), "fr76…" (hand-typed), "Fr76…" (an auto-capitalised
    // chat message). One case-insensitive rule, not three case-locked arms: the
    // adversarial battery showed each locked arm leaking the next casing, and the
    // 1/97 checksum is the precision gate a case class never was.
    type: "iban",
    pattern: new RegExp(String.raw`\b[A-Za-z]{2}\d{2}(?:(?:${SP}|\.|${WRAP})?[A-Za-z0-9]){10,30}\b`, "g"),
    // The second reading (`deconfuseOcrDigits`) rescues the SCANNED form « FR76
    // 3OO0 … » whose broken mod-97 used to ship it in CLEAR — the checksum on the
    // repaired reading stays the verifier (1/97), so the bare-shape door stays shut.
    validate: (m) => maxOneWrap(m) && (ibanValid(m) || ibanValid(deconfuseOcrDigits(m))),
  },
  {
    // US SSN (dashed) — CONTEXT-GATED. A bare 3-2-4 dashed number is an extremely
    // common ref/order-number shape (`123-45-6789`, `100-20-3000` were false-
    // positived), so it fires ONLY after an SSN context word; the structural
    // `ssnValid` then still rejects impossible area (000/666/900+), group (00) and
    // serial (0000).
    type: "national_id",
    pattern: gate("ssn|social security(?: number| no)?", String.raw`\d{3}-\d{2}-\d{4}\b`),
    validate: ssnValid,
  },
  // French identity / tax / residency family (NIR glued + spaced/Corse, VAT, SIREN,
  // passeport, CNI, permis, titre de séjour) — moved to `rules.france.ts` whole so the
  // FR surface reads at a glance; the spread keeps the exact ordering (after card/IBAN,
  // before the international spread).
  ...FRANCE_RULES,
  // United Kingdom, distinctive forms (`rules.uk.ts`) — ⚠️ order matters: BETWEEN FR and EIN.
  ...UK_RULES,
  // US EIN — context-gated (bare `\d\d-\d{7}` is too generic).
  { type: "company_id", pattern: gate("ein", String.raw`\d{2}-\d{7}\b`) },
  // International identity / tax / health / licence / vehicle / bank schemes
  // ported from presidio-ts (dozens of country ID formats + context-gated DOB).
  // Placed here so a numeric ID is grabbed AFTER card(Luhn)/IBAN win first and
  // BEFORE the phone rule could nibble a digit run. See `rules.international.ts`.
  ...INTERNATIONAL_RULES,
  // BIC / SWIFT bank code — context-gated (8/11 upper-alnum matches plain ALLCAPS
  // words otherwise), so it's precise enough to be on by default. The keyword may
  // be separated from the code by a few LOWERCASE filler words + separators
  // ("mon BIC est X", "code BIC : X", "le BIC de la banque : X", "SWIFT/BIC X") —
  // lowercase-only filler so an ALLCAPS code is never consumed as a filler word.
  // ⚠️ The SEPARATOR is half the guard, and it was too narrow: a SERIALISED
  // PAIR (`"bic":"AGRIFRPP812"`) and a value in PARENTHESES (« le BIC saisi
  // (BSUIFRPPXXX) ») left the code in clear — the quote and the parenthesis weren't
  // separators. The keyword itself is now case-insensitive (a JSON key is
  // written `bic`), letter by letter: passing the `i` flag to the WHOLE rule would have
  // made `[A-Z]{6}` match lowercase and turned any eight-letter word following
  // « bic » into a bank code. The value therefore stays strictly capitalised.
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
  // Phone — INTERNATIONAL (+/00 prefix), tolerant of spaces / dots / dashes. The
  // regex alone is far too loose (the optional separator lets every digit be its own
  // group, so ANY `00`-prefixed run matches — `008-2014`, `001800`, `00260520` were
  // all false-positived). So it's libphonenumber-VALIDATED: only a real, dialable
  // number survives. See `phones.ts` `isValidIntlPhone`.
  {
    type: "phone",
    // Separator class = the SHARED `SP` (plain + NO-BREAK + NARROW no-break space) plus
    // tab/dot/dash. French typography groups digits with U+00A0/U+202F and PDF extraction
    // emits them verbatim, so a plain `[ ]` shipped an NBSP-grouped number in CLEAR — the
    // same hole card/IBAN/NIR/SIRET/VAT were already fixed for. Audit-verified.
    // ⚠️ This rule does NOT need to handle the parenthesised form `+1 (212) 736-5000`:
    // widening it is a MEASURED no-op — `phones.ts` `detectPhones` already covers all the
    // libphonenumber forms, brackets included; a benchmark of THIS pattern alone says the
    // opposite (the unit that counts is the pipeline). Pinned in `isolatedFormats.test.ts`.
    pattern: new RegExp(String.raw`(?:\+|00)\d{1,3}(?:(?:${SP}|[\t.\-])?\d{1,4}){3,8}`, "g"),
    validate: isValidIntlPhone,
  },
  // Phone — French national `0X XX XX XX XX` (exactly 10 digits, leading 0). Tight
  // shape; kept WITHOUT libphonenumber so unusual-but-real allocations aren't
  // dropped. Doesn't swallow plain figures like "850 000" (needs the leading 0).
  {
    type: "phone",
    // Same NBSP-bearing separator class as the intl rule above. `!isDateTimeRun`: a bank
    // export datetime « 01-09-2025 01:24:55 » is ALSO ten digits starting 0 → was faked.
    pattern: new RegExp(String.raw`\b0\d(?:(?:${SP}|[\t.\-])?\d{2}){4}\b`, "g"),
    validate: (m) => !isDateTimeRun(m),
  },
  // The three EMAIL arms (plain unicode, obfuscated [at], OCR-split space) —
  // ONE family: rules.email.ts. Order preserved: they ran exactly here.
  ...EMAIL_RULES,
  // IPv4 (validated octets) + IPv6 incl. `::` compression (see IP_RE above).
  // `isRealIp` rejects colon look-alikes (clock `21:21:09`, short decimal ids).
  {
    type: "ip",
    pattern: IP_RE,
    validate: isRealIp,
  },
  // Generic API-key-ish token: ≥8 chars of [A-Za-z0-9_-] that mix at least one
  // digit AND at least one NON-HEX letter (g–z / G–Z). Requiring a non-hex letter
  // spares hexadecimal IDs/hashes/UUIDs — e.g. Notion page/view ids in a URL like
  // `…/p/354d95933ece42d7850ff96243743181?v=2ad7f1ed…` — which are not secrets;
  // real high-entropy keys almost always contain a non-hex letter. The trade-off:
  // a purely-[0-9a-f] secret isn't caught here (dedicated rules + the model
  // detector + explicit `secrets` still apply). The (?!REDACTED_) guard keeps it
  // from re-matching the [REDACTED_…] placeholders. Toggleable "apikey".
  {
    type: "api_token",
    // `(?<!%)` — never START a match right after a `%`: a percent-encoded URL
    // (`…%2Fmakemefamily`, `…%2Dsabourdin`, `…%25A9couvrez`) puts a `\b` between the
    // `%` and the hex, so the rule captured the encoded tail (`2Fmakemefamily`) as a
    // "key". A model browsing a site returns such URLs constantly → FP flood. A real
    // token is never glued to a leading `%`.
    pattern:
      /\b(?<!%)(?!REDACTED_)(?=[A-Za-z0-9_-]*[G-Zg-z])(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{8,}\b/g,
    // Spare structured public IDs (slugs / tracking codes / ASIN refs / timestamps:
    // `SanDisk-Cards-Extreme-128GB-Memory`, `hul_cgw_atf_d_fr_cc_0726_b2g25bj_cta`) —
    // short/word/number `-`_-separated segments, no long high-entropy run. A real key
    // (a ≥12 mixed-alnum segment) still matches. Kills the FP flood on shopping/search
    // pages the model browses. Also spare a checksum-valid ISIN (`FR0011871110`) — a
    // public security identifier the model needs verbatim (financial data), not a secret.
    validate: (m) => !isStructuredId(m) && !isIsin(m),
  },
];

/** Placeholder label per rule type, e.g. `email` → `[REDACTED_EMAIL_1]`. */
export const LABELS: Record<RedactionType, string> = {
  path: "PATH",
  url: "URL",
  secret: "SECRET",
  private_key: "PRIVATE_KEY",
  connection_string: "CONNECTION_STRING",
  jwt: "JWT",
  api_key: "API_KEY",
  google_key: "GOOGLE_KEY",
  aws_key: "AWS_KEY",
  github_token: "GITHUB_TOKEN",
  slack_token: "SLACK_TOKEN",
  bearer: "BEARER_TOKEN",
  ip: "IP",
  api_token: "TOKEN",
  card: "CARD",
  iban: "IBAN",
  bic: "BIC",
  national_id: "NATIONAL_ID",
  company_id: "COMPANY_ID",
  bank_route: "BANK_ROUTE",
  health: "HEALTH",
  username: "USERNAME",
  dob: "DOB",
  crypto: "CRYPTO",
  mac: "MAC",
  geo: "GEO",
  phone: "PHONE",
  email: "EMAIL",
};
