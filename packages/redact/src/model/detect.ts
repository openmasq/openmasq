// Model-based detection. The pattern rules only catch structured secrets (keys,
// tokens, emails). A small local model (Ollama, Mistral, …) can additionally
// spot *semantic* PII that has no fixed shape — names, phone numbers, postal
// addresses, IBANs, org/customer names, etc. {@link discoverSecrets} asks such a
// model to extract those spans and registers each in the same {@link Vault}, so
// the normal redact/unredact machinery then replaces and restores them just like
// a regex match. The model only ever *names* the sensitive substrings — it never
// sees a request it has to answer, and replacement stays deterministic.
import type {
  CompleteFn,
  Detection,
  RedactionMatch,
  Vault,
} from "../types";
import { redactionCategory } from "../kinds";
import { keepSet, isKept, titleCase, hasAllCapsWord, caseInsensitiveOccurrences } from "../util";
import { makeAllocator } from "../engine/allocator";
import { isNonPiiTerm, stripOrgAffixes } from "./genericTerms";
import { DISCOVER_SYSTEM } from "./detectPrompt";

// Re-exported so existing importers (`local/detect.ts`) keep importing them from here.
export {
  isStopword,
  isGenericTerm,
  isGenericCompound,
  isOrgAffix,
  stripOrgAffixes,
} from "./genericTerms";

export interface DiscoverOptions {
  /** One-shot completion used to run the extraction model. Optional when a
   *  {@link detectLocal} source is supplied (offline GLiNER path). */
  complete?: CompleteFn;
  /** LLM-free local detector (GLiNER); merged with the `complete` findings. */
  detectLocal?: (input: string) => Promise<Detection[]>;
  /**
   * Vault to register findings into (mutated in place). Pass the conversation's
   * vault so placeholders stay stable and reversible across turns.
   */
  vault?: Vault;
  /** Exact strings already known to be secret (e.g. saved API keys). */
  secrets?: string[];
  /** Highlight kinds the user disabled (e.g. ["email"]); those findings are dropped. */
  disabledKinds?: string[];
  /** Allow-list: exact values that must NEVER be redacted (case-insensitive) —
   *  e.g. names of the user's connected integrations the model needs verbatim. */
  keep?: string[];
  /** Surface a detector failure (unreachable model, unparseable reply, thrown local
   *  detector). Without it a failed model pass is INDISTINGUISHABLE from "nothing
   *  found" (audit H1) — callers that need model-grade coverage MUST pass this and
   *  fail closed on it, exactly like `pseudonymize`'s `modelError`. */
  onError?: (err: unknown) => void;
}

/**
 * Best-effort parse of a JSON array out of a model reply (tolerates fences/prose).
 * Returns `null` when NO valid JSON array can be found (unparseable / truncated / a prose
 * refusal) — distinct from `[]`, a literal "found nothing". The caller uses that distinction
 * to fail CLOSED on an unparseable reply instead of mistaking it for a clean empty result
 * (audit H1). A non-array JSON value (e.g. `{}`) is also `null` (not a valid findings array),
 * and so is a NON-EMPTY array with no findings-shaped element: the first-`[`/last-`]` slice
 * of a reasoning reply can grab an unrelated array in prose ("the top items are [1, 2, 3]"),
 * which then read as zero detections WITHOUT raising the fail-closed signal.
 */
function parseFindings(reply: string): Array<{ value: unknown; category: unknown }> | null {
  const start = reply.indexOf("[");
  const end = reply.lastIndexOf("]");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(reply.slice(start, end + 1));
    if (!Array.isArray(parsed)) return null;
    if (parsed.length === 0) return parsed; // a literal "found nothing"
    const findings = parsed.filter(
      (item) => item && typeof item === "object" && typeof (item as { value?: unknown }).value === "string",
    );
    return findings.length ? findings : null; // an array of non-findings is NOT a valid reply
  } catch {
    return null;
  }
}

// `caseInsensitiveOccurrences` lives in `../util` (with `isWordGlued`/`isCjkText`, which
// it depends on, and from where `variantOccurrences` can finally use it) — re-exported here
// so existing importers don't have to move.
export { caseInsensitiveOccurrences } from "../util";

/** Turn a model category into a safe placeholder label, e.g. "Phone #" -> "PHONE". */
function categoryLabel(category: unknown): string {
  const raw = typeof category === "string" ? category : "";
  const label = raw.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
  return label || "SENSITIVE";
}

/**
 * Ask the model to name the sensitive spans in `input`. Returns only spans that
 * occur verbatim, so a hallucinating model can never corrupt the text. Never
 * throws: a failed/unreachable model yields `[]` and callers fall back to the
 * deterministic rules.
 */
export async function detectWithModel(
  input: string,
  complete: CompleteFn,
  onError?: (err: unknown) => void,
): Promise<Detection[]> {
  const ask = async (text: string): Promise<string | null> => {
    try {
      return await complete([
        { role: "system", content: DISCOVER_SYSTEM },
        { role: "user", content: text },
      ]);
    } catch (err) {
      // Surface the failure (unreachable model, wrong base URL, model not pulled,
      // missing/invalid key…) so it isn't silently mistaken for "nothing found".
      console.warn(
        "[redact] redaction model unreachable — falling back to pattern rules.",
        err,
      );
      onError?.(err);
      return null;
    }
  };

  const primary = await ask(input);
  if (primary === null) return []; // model unreachable → onError already fired → callers fail closed
  // The model REPLIED (200) but produced no parseable JSON array — truncated mid-reasoning
  // (a reasoning model burning its token budget), a safety refusal, or prose. At the value
  // level this is INDISTINGUISHABLE from "found nothing" (`[]`), so without this the send
  // would ship regex-only coverage under the "model-grade" label with modelError UNSET —
  // a silent PII leak (audit H1). Treat an unparseable primary reply as a FAILURE so callers
  // fail CLOSED (block the send / mask the tool result), exactly like an unreachable model.
  if (parseFindings(primary) === null) {
    console.warn("[redact] redaction model reply was not a parseable JSON array — failing closed (not treating as 'nothing found').");
    onError?.(new Error("redaction model reply was not parseable (no JSON array)"));
    return [];
  }
  const replies = [primary];

  // ALL-CAPS entities (admin forms, addresses, a lone uppercase name/city like
  // "PARIS") are badly under-detected by cased models even though the prompt asks
  // for them. When the text has such a word, run a SECOND pass on a title-cased
  // copy and UNION the findings — each value is located back in the ORIGINAL text
  // (case-insensitively) so it keeps its real casing. Gated on `hasAllCapsWord`
  // (not casual all-lowercase) to bound the extra call on the paid remote path.
  if (hasAllCapsWord(input)) {
    const recased = titleCase(input);
    if (recased !== input) {
      const extra = await ask(recased); // best-effort — a failure just skips this pass
      if (extra !== null) replies.push(extra);
    }
  }

  const out: Detection[] = [];
  const pushed = new Set<string>();
  for (const reply of replies) {
    // The recased pass is best-effort: an unparseable extra reply (`null`) just contributes
    // nothing (the primary already parsed, so we don't fail closed here).
    for (const item of parseFindings(reply) ?? []) {
      const raw = typeof item?.value === "string" ? item.value.trim() : "";
      if (raw.length < 2) continue;
      const category = categoryLabel(item.category);
      // "la Sacem" → "Sacem" (+ "de Karl Studio" → "Karl Studio" for an ORG): the
      // determiner/preposition stays in clear + a single atomic identity.
      let value = stripLeadingArticle(raw, isOrgCategory(category));
      // "société KARL STUDIO" / "KARL STUDIO Forme" → "KARL STUDIO": strip the legal
      // form / descriptor so one company is ONE identity (the "plusieurs mappings" bug).
      if (isOrgCategory(category)) value = stripOrgAffixes(value);
      if (value.length < 2) continue;
      // Universal non-PII, dropped for EVERY caller (both the `discoverSecrets`
      // marker path AND the `pseudonymize` fake path go through here): an ultra-common
      // function word ("tes"), a generic document/type word ("CV", "Facture") OR a bare
      // company legal form/role ("SASU", "Associé Unique") the detector over-flagged.
      if (isNonPiiTerm(value)) continue;
      // Case-insensitive reconciliation: redact each REAL-cased occurrence, so an
      // UPPERCASE name/city the model reported in normal case is still caught.
      for (const actual of caseInsensitiveOccurrences(input, value)) {
        const key = `${category}::${actual}`;
        if (pushed.has(key)) continue;
        pushed.add(key);
        out.push({ value: actual, category });
      }
    }
  }
  return out;
}

/**
 * Run the extraction model over `input` and register every sensitive span it
 * reports into the vault (mutated in place). Returns the matches that were newly
 * registered or matched. Replacement itself is then done by `redact` — pass the
 * same vault, and the model's findings are applied deterministically (and
 * reversed on the reply by `unredact`).
 *
 * Only values that appear verbatim in `input` are accepted, so a hallucinating
 * model can never corrupt the text. Safe to run alongside the regex rules.
 */
// A LEADING lowercase article/determiner ("la Sacem", "l'Afdas", "the Sacem") is a
// determiner in running text, NOT part of the entity name. Strip it so the article
// stays in CLEAR and, crucially, does NOT split the entity's identity: "la Sacem" and
// "Sacem" would otherwise get DIFFERENT `entityKey`s → two unrelated fakes for one org
// (the reported "différents redactions pour un même mot avec un le/la devant").
// LOWERCASE-ONLY (no `i` flag): a proper name whose FIRST word IS the article is
// capitalised — "La Rochelle", "Le Mans", "Les Sables", "The Times" — so those stay
// intact. `l['’]` covers the elided form ("l'Afdas", no space); the rest need a space.
const LEADING_ARTICLE_RE = /^(?:(?:les?|la|du|des|aux?|the)\s+|l['’]\s*)(?=\p{L})/u;
// ORG-only extra: the lowercase PREPOSITION a NER swallows from running text
// (« résultats de Karl Studio » → span "de Karl Studio", 01/08 log: grammar
// broken on the wire AND a SECOND identity for the org, the entityKey diverging from the
// vault). NEVER applied to persons — a lowercase particle there is part of the name
// ("de Gaulle"). Looped with the article strip so "de la Sacem" fully sheds.
const LEADING_ORG_PREP_RE = /^(?:de\s+|d['’]\s*)(?=\p{L})/u;
/** Drop a leading lowercase article/determiner from an entity value, keeping ≥2 chars.
 *  `org` additionally sheds a leading preposition (de/d'), repeatedly. */
export function stripLeadingArticle(value: string, org = false): string {
  let v = value;
  for (;;) {
    let stripped = v.replace(LEADING_ARTICLE_RE, "").trim();
    if (org) stripped = stripped.replace(LEADING_ORG_PREP_RE, "").trim();
    if (stripped === v || stripped.length < 2) break;
    v = stripped;
    if (!org) break; // single pass outside org (unchanged legacy behaviour)
  }
  return v.length >= 2 ? v : value;
}

/** True when a detector category names an ORGANISATION / company. */
export function isOrgCategory(category: string): boolean {
  return /^(ORG|COMPANY)/i.test(category);
}

export async function discoverSecrets(
  input: string,
  options: DiscoverOptions,
): Promise<RedactionMatch[]> {
  if (!input.trim()) return [];
  const vault = options.vault ?? {};
  const alloc = makeAllocator(vault);
  const known = new Set((options.secrets ?? []).map((s) => s.trim()));
  const disabled = new Set(options.disabledKinds ?? []);
  const keep = keepSet(options.keep);
  const matches: RedactionMatch[] = [];
  const seen = new Set<string>();

  const detections: Detection[] = [];
  // Thread the failure signal through: an unreachable model / unparseable reply
  // used to be silently swallowed here (no onError), so this marker-mode path
  // degraded to regex-only under the "model-grade" label — the exact H1 fail-open
  // detectFailClosed.test.ts pins for the pseudonymize path.
  if (options.complete)
    detections.push(...(await detectWithModel(input, options.complete, options.onError)));
  if (options.detectLocal) {
    try {
      detections.push(...(await options.detectLocal(input)));
    } catch (err) {
      console.warn("[redact] local NER failed in discoverSecrets.", err);
      options.onError?.(err);
    }
  }
  for (const { value, category } of detections) {
    if (known.has(value)) continue;
    if (isKept(value, keep)) continue; // allow-listed → never redact
    // Never PII on its own — the SAME test the fake path uses. This path used to check a
    // strict SUBSET, so a value spared as a fake was still redacted as a marker.
    if (isNonPiiTerm(value)) continue;
    if (disabled.has(redactionCategory(category))) continue;
    const placeholder = alloc.ensure(category, value);
    if (!seen.has(placeholder)) {
      seen.add(placeholder);
      matches.push({ type: "secret", value, placeholder });
    }
  }
  return matches;
}
