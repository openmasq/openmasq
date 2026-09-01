import type { RedactionCategory, RedactionKind } from "./types";

/** Map a type/category to the colour bucket used for highlighting. */
/** A health / medical category (regex `health` rules or a model `HEALTH` tag). */
function isHealthCategory(k: string): boolean {
  return (
    k === "health" ||
    k.includes("medical") ||
    k.includes("diagnos") ||
    k.includes("patholog") ||
    k.includes("blood") ||
    k.includes("mrn") ||
    k.includes("santé") ||
    k.includes("sante") ||
    k.includes("icd") ||
    k.includes("disease")
  );
}

/** A pseudo / handle / login (regex `username` `@`-rule or a labeled-field tag). */
function isUsernameCategory(k: string): boolean {
  return (
    k === "username" ||
    k === "handle" ||
    k === "login" ||
    k === "pseudo" ||
    k === "pseudonyme" ||
    k === "nickname"
  );
}

export function redactionKind(typeOrCategory: string): RedactionKind {
  const k = typeOrCategory.toLowerCase();
  if (k.includes("email")) return "email";
  if (k.includes("phone")) return "phone";
  if (isUsernameCategory(k)) return "username";
  if (isHealthCategory(k)) return "health";
  // IP and generic random tokens are their own toggleable kinds. Match exact
  // type/category strings so the specific *_token secret rules stay "secret".
  if (k === "ip" || k === "ipv4" || k === "ipv6" || k === "ip_address" || k === "ipaddress")
    return "ip";
  if (k === "api_token" || k === "token" || k === "apikey" || k === "api key" || k === "randomstring")
    return "apikey";
  if (isPathCategory(k)) return "path";
  if (
    k === "name" ||
    k.includes("firstname") ||
    k.includes("lastname") ||
    k.includes("surname") ||
    k.includes("person") ||
    k.includes("fullname")
  )
    return "name";
  if (
    k === "company_id" ||
    k.includes("org") ||
    k.includes("company") ||
    k.includes("employer") ||
    k.includes("customer")
  )
    return "company";
  if (k === "number" || k === "salary" || /^n\d+$/.test(k)) return "number";
  return "secret";
}

/** A path / filesystem-location category (regex `path` rule or a model tag). */
function isPathCategory(k: string): boolean {
  return (
    k === "path" ||
    k === "file" ||
    k === "filename" ||
    k === "file_name" ||
    k === "directory" ||
    k === "dir" ||
    k === "folder" ||
    k === "filesystem" ||
    k.includes("filepath") ||
    k.includes("file_path") ||
    k.includes("filename")
  );
}

/**
 * Map a rule type or model category to its FINE, user-toggleable category. Unlike
 * {@link redactionKind} (8 coarse colour buckets), this distinguishes the PII the
 * engine already detects (address / dob / location / card / iban / national_id) so
 * each can be switched on/off. `disabledKinds` is compared at THIS level.
 */
export function redactionCategory(typeOrCategory: string): RedactionCategory {
  const k = typeOrCategory.toLowerCase();
  if (k.includes("email")) return "email";
  if (k.includes("phone")) return "phone";
  if (isUsernameCategory(k)) return "username";
  if (
    k === "ip" || k === "ipv4" || k === "ipv6" || k === "ip_address" ||
    k === "ipaddress" || k === "mac" || k === "mac_address" || k === "macaddress"
  )
    return "ip";
  if (isHealthCategory(k)) return "health";
  if (k === "salary" || k === "salaire" || k.includes("wage") || k === "remuneration") return "salary";
  if (k === "number" || /^n\d+$/.test(k)) return "number";
  if (isPathCategory(k)) return "path";
  // A whole URL — its own toggle. ⚠️ Distinct from the deletion GATE of the same
  // name: off, the category protects URL sub-parts from noise; on, it
  // masks the address ITSELF. Both point the same way ("are URLs
  // sensitive?"), which is what lets a single toggle cover both behaviors.
  if (k === "url") return "url";
  // Financial — bank ROUTING coordinates (ABA/BSB/sort code/CLABE/IFSC/accounts)
  // ride the "iban" toggle: same nature (bank details), no extra toggle.
  if (k === "iban" || k === "bic" || k === "swift" || k === "bank_route") return "iban";
  // COMPANY identifiers (SIREN/SIRET, VAT, LEI, registries) — their own toggle,
  // grouped with Organisation, so "turn off TVA on my invoices" never drops the
  // person-document protection under national_id.
  if (k === "company_id") return "company_id";
  if (k === "card" || k.includes("credit") || k === "pan" || k === "creditcard") return "card";
  // Official identifiers (national id / passport / SSN / regional schemes)
  if (
    k === "id" ||
    k === "national_id" ||
    k.includes("passport") ||
    k.includes("ssn") ||
    k.includes("nino") ||
    k.includes("aadhaar") ||
    k.includes("curp") ||
    k.includes("cpf") ||
    k.includes("nric") ||
    k.includes("insee") ||
    k.includes("national")
  )
    return "national_id";
  // Identity / contact / place
  // `date` joins `dob`: it's ONE question for the user ("are my dates
  // redacted?"), not two. Without this line, a DEED's date fell into the `secret`
  // fallback — so under the wrong toggle, and with a fake drawn from the BIRTH
  // window (1940-2004) instead of the ±2 years `fakeDate` reserves for a generic date.
  if (k === "dob" || k === "date" || k === "dates" || k.includes("birth")) return "dob";
  if (k.includes("address")) return "address";
  if (
    k === "location" ||
    k.includes("city") ||
    k.includes("town") ||
    k.includes("postal") ||
    k.includes("postcode") ||
    k === "zip" ||
    k === "zipcode" ||
    k.includes("geo") ||
    k.includes("place") ||
    k === "department" ||
    k === "departement" ||
    k === "region"
  )
    return "location";
  if (
    k === "name" ||
    k.includes("firstname") ||
    k.includes("lastname") ||
    k.includes("surname") ||
    k.includes("person") ||
    k.includes("fullname")
  )
    return "name";
  if (k.includes("org") || k.includes("company") || k.includes("employer") || k.includes("customer"))
    return "company";
  // Generic heuristic random strings stay their own (noisy → off by default).
  if (k === "api_token" || k === "token" || k === "apikey" || k === "api key" || k === "randomstring")
    return "apikey";
  // Everything else (api_key, jwt, connection_string, aws/google/github/slack keys,
  // bearer, private_key, secret-assignment) → the grouped "Clés & secrets".
  return "secret";
}

/**
 * Categories NEVER suppressed by the `url`-off gate: a real credential embedded in a
 * URL (`?token=sk_live_…`, a connection string, a presigned `scheme://user:pass@…`)
 * must still be redacted — the url gate only exists to stop URL *structure*
 * (paths/asset filenames/CDN cache-busters) flooding the audit, not to leak a secret
 * to the model/provider (audit H-3).
 *
 * The DISTINCTIVE `secret` class (vendor-prefixed keys, connection strings,
 * `user:pass@`) is exempt, and so are the CHECKSUMMED identity/payment categories
 * (`card`, `iban`, `national_id`): a Luhn-valid PAN or a mod-97 IBAN sitting in a
 * query string (`?iban=FR76…`) is never benign URL structure, and the url-off gate
 * used to ship it in clear. The generic `apikey` heuristic is deliberately NOT
 * exempt — it matches CDN asset ids / cache-busters inside URLs
 * (`GettyImages-…-<hash>.jpg`), the exact noise the url gate suppresses; it is also
 * OFF by default. `dob`/dates stay suppressible too (`/2026/07/23/` paths).
 */
export const CREDENTIAL_KINDS: ReadonlySet<RedactionCategory> = new Set<RedactionCategory>([
  "secret",
  "card",
  "iban",
  "national_id",
]);

/**
 * The categories the URL-off gate must NEVER suppress — the set both URL gates actually
 * read (`engine/redact.ts` and `model/pseudonymize/filter.ts`). It is `CREDENTIAL_KINDS`
 * plus CONTACT identity, and it has its own name because "credential" stopped describing
 * the role once an e-mail joined.
 *
 * ⚠️ `email` + `phone` are exempt because the gate's whole justification does not apply to
 * them. It exists to stop URL STRUCTURE being redacted — asset filenames, cache-busters,
 * CDN ids, the noise that flooded the audit. But nothing in that noise has the shape of
 * `local@domain.tld` or of a libphonenumber-VALIDATED dialable number, while a browsed
 * page, a CRM deep link and a `mailto:` carry exactly those (`?email=…`, `?tel=…`) — and
 * the gate shipped them to the model in CLEAR. Audit F2, pinned in `urlCredentials.test.ts`.
 */
export const URL_EXEMPT_KINDS: ReadonlySet<RedactionCategory> = new Set<RedactionCategory>([
  ...CREDENTIAL_KINDS,
  "email",
  "phone",
]);

/** A value shaped like an MRZ (ISO 9303 machine-readable zone, OCR-B font): ≥4 filler
 *  chevrons and ≥6 alphanumerics in one run. ONE home, two consumers (rule 9):
 *  the detection RULE (`rules.international`) and the fake GENERATOR (`fakes`) — the
 *  LETTERS of an MRZ carry the name, and a fake that keeps them leaks the identity it
 *  claims to mask. */
export function isMrzShaped(value: string): boolean {
  // ≥2 chevrons only: a CNI's LINE 2 ("…JULIEN<<LOUIS<…") has only 3,
  // and 4 left it in the digits-only mix — letters (so first names) intact. The
  // precision comes from the rest: PURE MRZ alphabet in one run (A-Z, 0-9, <), ≥20 characters,
  // ≥6 alphanumerics — neither code nor prose ever lines that up.
  const flat = value.replace(/\s+/g, "");
  return (
    /^[A-Z0-9<]{20,}$/.test(flat) &&
    (flat.match(/</g) ?? []).length >= 2 &&
    flat.replace(/[^A-Z0-9]/g, "").length >= 6
  );
}
