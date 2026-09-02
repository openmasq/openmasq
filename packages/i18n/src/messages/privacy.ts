/**
 * REDACTION as it is shown: levels, data types, the web-search card.
 *
 * A SLICE of the contract (`../messages.ts`), which stays the only list of namespaces.
 * The split holds the 300-LOC cap (rule 1) — same shape as `packages/emails/i18n/`.
 */

/**
 * THE translation CONTRACT — the interface EVERY language implements.
 *
 * This is the heart of the « typed catalogue, no library » choice (see `CLAUDE.md`): a
 * key missing from or extra in `fr.ts`/`en.ts` is a `tsc` error, not a silent runtime
 * fallback. No ICU parser, no runtime loader in a product
 * whose posture is « nothing unverified runs » — interpolation and
 * plurals are typed TypeScript FUNCTIONS, and numbers/dates/currencies go
 * through `Intl` (present in Electron and every browser).
 *
 * ## How to add a key
 *
 * 1. add it HERE (in the right namespace);
 * 2. `tsc` breaks on `fr.ts` AND `en.ts` until both have it — that is the point;
 * 3. an entry with a variable is a `(x) => string` function, never a template with holes.
 *
 * ## How to add a LANGUAGE
 *
 * A new `xx.ts` that `satisfies Messages`, added to `MESSAGES` in
 * `locale.ts` and to the `Locale` union. The compiler then demands every key: the door
 * is open, and it refuses an incomplete language.
 *
 * Namespaces follow SURFACES, not files — one word rendered in two
 * places has a single entry (rule 9 applied to copy).
 */
/** A protection level, in its three registers (see `privacyLevels`). */
export interface PrivacyLevelCopy {
  label: string;
  /** What the level is FOR — the Settings register. */
  desc: string;
  /** What the level COVERS — the composer menu's short register. */
  short: (brand: string) => string;
  /** What it leaves readable, or what its protection may skew. */
  tradeoff: string;
}

/**
 * The PROTECTION LEVEL, in its three registers, and BOTH surfaces (Réglages'
 * `PrivacyLevelPicker`, the composer's `ComposerRedactMenu`) render all three, in the
 * same order: `desc` names a concrete USE (« recherche web et outils », « documents à
 * analyser »), `short` what the level COVERS, `tradeoff` what it leaves readable or may
 * skew. One vocabulary, two doors — `ComposerRedactMenu.test.tsx` pins the parity.
 *
 * ⚠️ `standard` (label « Allégé ») is the ONE level below the default: its `desc` and
 * `tradeoff` must SAY it (rule 8) — the id stays `standard` because it is persisted.
 *
 * ⚠️ `tradeoff` is not decorative: over-selling reliability would be the same trust
 * bug as over-selling protection (rule 8). Translating it means translating a
 * promise — not a label.
 */
export interface PrivacyLevelsMessages {
  standard: PrivacyLevelCopy;
  renforce: PrivacyLevelCopy;
  strict: PrivacyLevelCopy;
}

/**
 * The manual redaction's data TYPES. The keys are those of `REDACT_TYPES`
 * (`@openmasq/redact`), which keeps the engine's `token` — the HOME of the technical
 * vocabulary stays there, only the read label comes here.
 * `redactTypes.parity.test.ts` reads both and fails if one list moves without
 * the other: two packages cannot force a key on each other through the compiler.
 */
export interface RedactTypesMessages {
  name: string;
  username: string;
  email: string;
  phone: string;
  company: string;
  address: string;
  city: string;
  id: string;
  card: string;
  iban: string;
  ip: string;
  path: string;
  dob: string;
  secret: string;
}

/**
 * The card that INTERRUPTS the agentic loop before its first web search, to
 * offer a more generous level for the length of one message.
 *
 * ⚠️ Rule 8: every sentence here is a PROMISE about what leaves the machine. « Ce
 * message seulement » bounds the scope, and the last sentence says the request goes out
 * with the real value anyway (rule 11). Translating either one carelessly
 * is lying about the product — not mislabelling it.
 */
export interface WebNavMessages {
  ariaLabel: string;
  eyebrow: string;
  /** The SCOPE, kept short: the line is ellipsised by its container. */
  thisMessageOnly: string;
  keepMasking: string;
  /** The other button says « Laisser en clair · ce message » — from `conversation.mark`,
   *  the one lexicon, so it is not written here. */
  title: (level: string) => string;
  /** Follows the level's `tradeoff`: what stays masked, and what the request carries. */
  rest: string;
}
