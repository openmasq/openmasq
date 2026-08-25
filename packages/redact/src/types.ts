/**
 * Shared type vocabulary for the redaction engine. Pure declarations only — no
 * runtime — so every module (and consumers) can depend on it freely.
 *
 * A {@link Vault} maps `placeholder -> original value`. Pass the same vault
 * across turns so a given secret always gets the same stable placeholder (and
 * stays reversible). The vault is a plain object, so it serialises to JSON for
 * per-conversation persistence.
 */

export type RedactionType =
  | "path"
  | "url"
  | "secret"
  | "private_key"
  | "connection_string"
  | "jwt"
  | "api_key"
  | "google_key"
  | "aws_key"
  | "github_token"
  | "slack_token"
  | "bearer"
  | "ip"
  | "api_token"
  | "card"
  | "iban"
  | "bic"
  | "national_id"
  | "company_id"
  | "bank_route"
  | "dob"
  | "crypto"
  | "mac"
  | "geo"
  | "phone"
  | "health"
  | "username"
  | "email";

export interface RedactionRule {
  type: RedactionType;
  pattern: RegExp;
  /**
   * Optional post-match validator: when present, a regex hit is only redacted if
   * this returns true. Lets shape-based rules (credit card, IBAN…) confirm a
   * checksum so we don't redact any 16-digit number / random IBAN-shaped string.
   */
  validate?: (match: string) => boolean;
}

export interface RedactionMatch {
  type: RedactionType;
  value: string;
  placeholder: string;
  /** Raw semantic category when known (e.g. "NAME", "ORG" from the model). */
  category?: string;
  /** « À vérifier » — carried over from {@link Detection.uncertain} so the pre-send
   *  audit can style the span. UX-only: the match IS redacted either way. */
  uncertain?: boolean;
}

/** Coarse kind used to colour a redacted span in the UI. */
export type RedactionKind =
  | "name"
  | "email"
  | "phone"
  | "company"
  | "number"
  | "salary"
  | "ip"
  | "path"
  | "health"
  | "username"
  | "apikey"
  | "secret";

/**
 * FINE, user-toggleable category — what the per-category settings switch on/off.
 * Superset of {@link RedactionKind}: keeps email/phone/ip/name/company/apikey/secret
 * but also distinguishes the PII the engine already detects (address, dob, card,
 * iban, national_id, location). Drives `disabledKinds` filtering (which now holds
 * category ids); `redactionKind` still drives the coarse highlight tone.
 */
export type RedactionCategory =
  | "name"
  | "dob"
  | "email"
  | "phone"
  | "address"
  | "location"
  | "company"
  | "card"
  | "iban"
  | "national_id"
  | "company_id"
  | "ip"
  | "number"
  | "salary"
  | "path"
  | "health"
  | "username"
  | "url"
  | "apikey"
  | "secret";

export interface RedactionResult {
  /** The text with every detected secret replaced by a placeholder. */
  text: string;
  /** One entry per distinct secret redacted in this call. */
  matches: RedactionMatch[];
  /**
   * Set when the optional model detector was asked to run but FAILED (unreachable
   * endpoint, missing/invalid key, timeout…). Detection then degraded to the
   * regex rules, so free-form PII (names, addresses…) may be unmasked — callers
   * can surface this so the gap isn't silent. Absent on success or patterns-only.
   */
  modelError?: string;
}

/** placeholder -> original value. Plain object so it persists as JSON. */
export type Vault = Record<string, string>;

export interface RedactOptions {
  /**
   * Exact strings to always redact (e.g. the user's stored API keys), applied
   * before the pattern rules. Empty / very short values are ignored.
   */
  secrets?: string[];
  /**
   * Reusable mapping. When provided it is read for stable placeholders and
   * mutated in place with any new secrets found — pass the same vault to
   * `unredact` to reverse the reply.
   */
  vault?: Vault;
  /**
   * Highlight kinds the user turned OFF in settings (e.g. ["email","phone"]).
   * Matching pattern rules are skipped so that category passes through in clear.
   * Structured secrets (keys/tokens) are always redacted regardless.
   */
  disabledKinds?: string[];
  /**
   * Allow-list: exact values that must NEVER be redacted (case-insensitive) —
   * e.g. the names of the user's CONNECTED integrations ("Stripe", "Canva"),
   * which the chat model needs verbatim to route its tool calls. Overrides both
   * the pattern rules and the model detector.
   */
  keep?: string[];
  /**
   * ALLOW-list of hosts whose URLs are STRUCTURAL: the domains a service the user has
   * CONNECTED addresses its own resources on (`notion.com`, `atlassian.net`,
   * `vercel.app`…). A URL on one of them gets the same sub-part suppression the `url`
   * category grants when it is OFF — **whatever that category's state**, so the Strict
   * level stops faking the page ids and query flags a connector needs back verbatim.
   *
   * Deliberately narrow, and each word matters: an ALLOW-list (any other host is
   * unaffected), matched on the registrable SUFFIX, per-VALUE like the rest of the URL
   * gate (a name that also appears in the page title is still redacted), and
   * `URL_EXEMPT_KINDS` still wins — a key or an e-mail in a query string stays masked.
   * The app fills it from what is ACTUALLY connected (`send/redactKeep.ts`).
   */
  structuralUrlHosts?: string[];
}

/**
 * The redaction palette's hue names — they ARE the `--hl-<hue>` CSS tokens. One hue per
 * redaction SECTION; which section carries which is declared once, in
 * `highlight/sections.ts` (`SECTION_HUE`), and everything else derives from there.
 */
export type Hue =
  | "violet"
  | "sky"
  | "mint"
  | "teal"
  | "amber"
  | "gold"
  | "pink"
  | "slate"
  | "red";

/**
 * Colour bucket for a redaction highlight pill.
 *
 * @deprecated An ALIAS of {@link Hue} — there is one colour vocabulary now. It used to be a
 * second set of names (`coral`/`blue`/`emerald`…) translated to hues by a hand-written map:
 * a parallel vocabulary that a nine-hue palette cannot express and a reviewer cannot verify.
 * Prefer `Hue`; this name survives so persisted/DOM `tone` fields keep type-checking.
 */
export type RedactionTone = Hue;

export interface RedactionSegment {
  kind: "text" | "redaction";
  value: string;
  /** Pretty category label, present on redaction segments (e.g. "email"). */
  label?: string;
  tone?: RedactionTone;
  placeholder?: string;
}

/** A single chat turn handed to the redaction model. */
export interface CompletionMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Non-streaming one-shot completion. Returns the assistant's full text. */
export type CompleteFn = (messages: CompletionMessage[]) => Promise<string>;

/** One detected sensitive span: the exact text and its category. */
export interface Detection {
  value: string;
  category: string;
  /**
   * The user MANUALLY forced this span (composer "Redact"). A forced candidate
   * bypasses the FP-prevention gates (disabled category, URL-only, bare-number) —
   * the user explicitly asked for it — but still yields to `keep` (reveal/undo).
   */
  forced?: boolean;
  /**
   * ISO-3166-1 alpha-2 country hint for a geographic span (address / place /
   * postal code), so `fakeFor` swaps it for a real place of the SAME country in
   * the country's own address FORMAT. Absent → inferred/defaulted (FR).
   */
  country?: string;
  /**
   * Character offset of this span's FIRST occurrence in the input. Optional, set only
   * by the pattern detectors (addresses / labeled fields / frGeo) that know their match
   * index. Used ONLY to GROUP nearby geographic fields of one address block so they are
   * faked from ONE coherent real place (`engine/geo/geoBlocks.ts`); replacement stays
   * value-based, so a missing `start` just means that span isn't block-grouped.
   */
  start?: number;
  /**
   * « À vérifier » : the ONLY probabilistic source (the NER) emitted this span AND its
   * own signals doubt it (two-pass disagreement + sub-threshold score — the measured
   * trigger of `bench/confidence.bench.ts`). Cleared in `gather` when ANY other source
   * corroborates the same entity. ⚠️ UX-ONLY, fail closed: the flag never changes what
   * is redacted — an uncertain span ships redacted exactly like a sure one; it is
   * surfaced in the pre-send audit so the USER can decide to keep it in clear.
   */
  uncertain?: boolean;
}
