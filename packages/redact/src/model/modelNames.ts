/**
 * AI MODEL NAMES — the shape, not an exhaustive list.
 *
 * Audit from 13/08: the notoriety dispensation matches exactly, so « ChatGPT » was passing
 * but « GPT-5.5 », « Claude Sonnet 4.6 », « Gemini 2.5 Pro » — what a user
 * actually types — were being redacted at every level, the app's own catalog included.
 * No list can keep up with a living catalog (~320 OpenRouter models); a GRAMMAR can:
 * a known FAMILY in front + VERSION/VARIANT words behind it.
 *
 * ⚠️ Same discipline as `notorious.ts`: it's an allow-list (the value goes out in clear),
 * so every bare family only enters BARE if it has no plausible life as a
 * private name — bare « Mistral » stays out (the wind, and a plausible company name),
 * bare « Claude »/« Gemini » remain `notorious.ts`'s business (company category
 * only — FIRST NAMES stay protected, see the caller).
 */

const norm = (s: string): string => s.trim().toLowerCase();

/** Familles reconnues en TÊTE de valeur (ou fusionnées à des chiffres : « Qwen3.5 »). */
const FAMILY_TOKENS = new Set([
  "claude", "gpt", "gemini", "gemma", "llama", "qwen", "mistral", "ministral",
  "codestral", "devstral", "pixtral", "magistral", "deepseek", "grok", "kimi",
  "phi", "glm", "holo", "laguna", "nemotron",
  // en TÊTE seulement (jamais dispensés nus — « North » seul reste un mot ordinaire)
  "north", "tencent",
]);

/**
 * EXACT single-word values, dispensed as-is (company category).
 *
 * ⚠️ AUDIT 13/08 — this list had been written too broad and was leaking REAL
 * data: « Opus », « Sonnet », « Haiku », « Gemma », « Kimi », « Grok », « Llama »,
 * « Le Chat » were going out in clear at EVERY level, Strict included. Yet "la société
 * Opus", "Gemma" or "Kimi" are perfectly ordinary company names and first names,
 * and an allow-list doesn't forgive: the word leaks forever.
 *
 * The rule, now upheld: only a made-up portmanteau INVENTED by a provider enters here,
 * with no plausible life as a person's or company's name. An ordinary model name
 * doesn't need this — it carries its version (« Claude Sonnet 4.6 ») and goes through the
 * grammar. The registry only requires one bare word, `Codestral` (`modelNames.test.ts`
 * and the parity test pin it); the others are here by family symmetry.
 */
const BARE_MODELS = new Set([
  "codestral", "devstral", "pixtral", "ministral", "magistral", "nemotron", "gpt-oss",
]);

/** OpenAI's « o » series — `o3`, `o4-mini`. A NARROW shape rather than an « o »
 *  family: the latter was letting « O-123456 » (a file reference) pass as a model. */
const O_SERIES = /^o\d+(-(mini|pro|preview))?$/;

/** Variant/edition words that a model name carries after its family. */
const VARIANT_WORDS = new Set([
  "pro", "flash", "lite", "flash-lite", "mini", "nano", "large", "medium", "small",
  "super", "ultra", "coder", "code", "codex", "vl", "chat", "instruct", "turbo", "preview",
  "luna", "oss", "ai", "s", "m", "l", "xl",
  // the sub-families that follow an umbrella brand (« Claude Sonnet », « Mistral Nemo »)
  "sonnet", "opus", "haiku", "fable", "mythos", "nemo",
]);

/** « 2.5 », « 4o », « 70B », « 2507 », « v3.1 », « r1 », « k2.6 », « hy3 »…
 *  ⚠️ Bounded to 4 leading digits (audit 13/08): beyond that it's no longer a version,
 *  it's a number — and « Holo 847362 » shouldn't be dispensed. */
const isVersionish = (w: string): boolean =>
  /^v?\d{1,4}(\.\d{1,2})*[a-z]?$/.test(w) || /^[a-z]{1,3}\d{1,4}(\.\d{1,2})?$/.test(w);

const isVariantWord = (w: string): boolean => {
  if (!w) return false;
  if (VARIANT_WORDS.has(w) || isVersionish(w)) return true;
  // hyphenated compounds: each half must be valid (« flash-lite », « 3-mini »)
  const parts = w.split("-");
  return parts.length > 1 && parts.every((p) => VARIANT_WORDS.has(p) || isVersionish(p));
};

/**
 * A model VERSION: « 5.5 », « 4o », « 3 », « 5.2 ». Short and numeric.
 *
 * ⚠️ Two exclusions set by the audit from 13/08, because the version is the only
 * safeguard between a model name and a file reference: never a bare YEAR
 * (« NORTH-2024 »), never a long number (« O-123456 »).
 */
const isModelVersion = (t: string): boolean =>
  /^\d{1,4}(\.\d{1,2})*[a-z]?$/.test(t) && !/^(19|20)\d\d$/.test(t);

/** « GPT-4o » / « Qwen3.5 »: a family FUSED to its version. The tail admits neither a
 *  hyphen nor an extra segment — « PHI-2024-001 » is not a model. */
const fusedFamily = (w: string): boolean => {
  const m = /^([a-z]+)-?(\d[\w.]*)$/.exec(w);
  return !!m && FAMILY_TOKENS.has(m[1]) && isModelVersion(m[2]);
};

/**
 * A "family-variant" compound word: « DeepSeek-R1 », « GPT-OSS ».
 *
 * ⚠️ Two bounds, set by the audit from 13/08: ONE single component after the family
 * (« PHI-2024-001 » is a file reference, not a model), and never a bare
 * YEAR (« NORTH-2024 » either). Real versions — R1, OSS, 4o, 5.2 — pass.
 */
const hyphenModel = (w: string): boolean => {
  const [head, ...rest] = w.split("-");
  if (rest.length !== 1) return false;
  if (!FAMILY_TOKENS.has(head) && !BARE_MODELS.has(head)) return false;
  if (/^(19|20)\d\d$/.test(rest[0])) return false;
  return VARIANT_WORDS.has(rest[0]) || isVersionish(rest[0]);
};

/**
 * True when `value` has the SHAPE of an AI model name. `allowBare: false` (the
 * FIRST-NAME category) excludes bare names with no family in front — « Le Chat » alone stays
 * a plausible nickname, « Claude Sonnet »/« GPT-4o » pass.
 */
export function isAiModelName(value: string, opts?: { allowBare?: boolean }): boolean {
  // A trailing parenthesized edition isn't the name: « (local) », « (gratuit) ».
  const v = norm(value).replace(/\s*\([^)]*\)\s*$/, "");
  if (!v) return false;
  if (opts?.allowBare !== false && BARE_MODELS.has(v)) return true;
  if (O_SERIES.test(v)) return true;
  const words = v.split(/\s+/);
  const head = words[0];
  const headIsFamily =
    FAMILY_TOKENS.has(head) || BARE_MODELS.has(head) || fusedFamily(head) || hyphenModel(head);
  if (!headIsFamily) {
    // Family in TWO words (« Le Chat 2 »): the bare exact match is already covered above.
    const two = words.slice(0, 2).join(" ");
    if (words.length > 2 && BARE_MODELS.has(two)) return words.slice(2).every(isVariantWord);
    return false;
  }
  // « GPT-4o » yes; bare « claude », no (the bare exact match is BARE's business above)
  if (words.length === 1) return fusedFamily(head) || hyphenModel(head);
  return words.slice(1).every(isVariantWord);
}
