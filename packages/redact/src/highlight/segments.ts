// To *show* (not hide) what was redacted, a message's original text + the
// conversation vault are turned into an interleaved list of plain-text and
// "redaction" segments. The renderer draws each redaction segment as a coloured
// pill (see the redact design system). Colour resolves from the FINE category, in
// this priority: the `kinds` map (value -> category) → the placeholder label
// (`[REDACTED_EMAIL_1]` -> EMAIL, regex/marker engine) → the value's SHAPE via the
// regex engine (fake-data engine, whose placeholder is a believable fake that keeps
// the original's kind) → SENSITIVE. So highlighting is reproducible from saved data
// alone, and a fake-data email/phone stays its family colour instead of the coral
// fallback (which made the chat show red where the composer showed blue).
import type { RedactionCategory, RedactionSegment, RedactionTone, Vault } from "../types";
import { redactionCategory } from "../kinds";
import { escapeRegExp, isWordGlued } from "../util";
import { redact } from "../engine/redact";

import { CATEGORY_SECTION, SECTION_HUE } from "./sections";
import type { Hue } from "../types";

/**
 * Per-category colour — **DERIVED**, never declared. A category's hue is its SECTION's hue
 * (`SECTION_HUE` in `./sections`, the one source), so the "Règles de redaction" screen, the
 * chat marks, the document painters and the admin console are the same colours by
 * construction rather than by agreement. Adding a category means giving it a section; it
 * cannot ship without a colour, and it cannot ship with a colour that disagrees with its
 * section's.
 */
export const CATEGORY_HUE: Record<RedactionCategory, Hue> = Object.fromEntries(
  Object.entries(CATEGORY_SECTION).map(([category, section]) => [category, SECTION_HUE[section]]),
) as Record<RedactionCategory, Hue>;

const HUES: readonly string[] = Object.values(SECTION_HUE);

/**
 * Retired tone names → the hue the section they belonged to wears today. A stored file's
 * `replacements` carry a `tone`, so records written before the palette was unified are on
 * disk right now: without this a re-opened document loses its colours (or worse, paints them
 * all amber). Additive only — never route a LIVE hue through here.
 */
const RETIRED_TONES: Record<string, Hue> = {
  coral: "pink",
  blue: "sky",
  emerald: "sky", // the Contact family, which used to be lime
};

/** A hue read back from an untrusted or historical string (a DOM `data-tone`, a persisted
 *  replacement). Tone and hue are ONE vocabulary now, so this only guards + migrates. */
export function hueForTone(tone: string): Hue {
  if (HUES.includes(tone)) return tone as Hue;
  return RETIRED_TONES[tone] ?? "amber";
}

/** The highlight HUE for any detector category / coarse kind (normalised first). */
export function hueForKind(categoryOrKind: string): Hue {
  return CATEGORY_HUE[redactionCategory(categoryOrKind)] ?? "slate";
}

/** @deprecated Tone IS the hue since the palette was unified — call {@link hueForKind}. */
export function toneForKind(categoryOrKind: string): RedactionTone {
  return hueForKind(categoryOrKind);
}

/** Detect a value's FINE category from its SHAPE via the regex engine — used to
 * colour a span when no exact `kinds` entry is known. Returns the category only
 * when the WHOLE value is a single structured match (email/phone/card/iban/ip/
 * path/number/national_id…), so a value that merely CONTAINS a match isn't
 * mis-typed. Free-form PII (names/orgs) has no shape → undefined (kept sensitive).*/
function shapeCategory(value: string): string | undefined {
  if (!value) return undefined;
  const m = redact(value).matches;
  return m.length === 1 && m[0].value === value ? (m[0].category ?? m[0].type) : undefined;
}

/**
 * The KIND label of one redacted span, with the SAME resolution priority the segments
 * use for colour: exact `kinds` entry → the placeholder's marker (`[REDACTED_EMAIL_1]`)
 * → the value's shape → `"sensitive"`. Exported so the display-token vocabulary
 * (`./tokens.ts`) types a span exactly like its pill is coloured — one resolution,
 * two consumers, no drift.
 */
export function spanKindLabel(placeholder: string, value: string, exactKind?: string): string {
  return exactKind ?? categoryOf(placeholder, value).label;
}

function categoryOf(placeholder: string, value: string): { label: string; tone: RedactionTone } {
  // 1) Marker engine: the placeholder itself encodes the category ([REDACTED_EMAIL_1]).
  const marked = placeholder.match(/^\[REDACTED_(.+)_\d+\]$/)?.[1];
  if (marked)
    // Same source of truth as the exact-kind path: normalise the placeholder label
    // to a fine category, then to its tone.
    return { label: marked.toLowerCase().replace(/_/g, " "), tone: toneForKind(marked) };
  // 2) Fake-data engine: the placeholder is a believable FAKE (e.g. an email) that
  //    preserves the KIND/shape of the original, so read the category back from the
  //    value's shape (via the same regex engine). Without this a fake-data email/
  //    phone/etc fell through to the SENSITIVE/coral tone — rendering RED in the
  //    chat while the composer showed it blue (its live per-category hue).
  //    ⚠️ Le repli sur la forme du PLACEHOLDER exclut les familles clé/secret : un
  //    SCRAMBLE (segment de chemin « u5MZS9…C » pour « juliensabourdin ») ressemble
  //    toujours à un jeton, et le journal étiquetait « api token » un simple nom de
  //    dossier (journal 02/08). Un vrai couple clé→clé garde son étiquette par la
  //    forme de la VALEUR ; seul le repli-placeholder est bridé.
  const phShape = shapeCategory(placeholder);
  const shape =
    shapeCategory(value) ??
    (phShape && !["apikey", "secret"].includes(redactionCategory(phShape)) ? phShape : undefined);
  if (shape) return { label: shape.toLowerCase().replace(/_/g, " "), tone: toneForKind(shape) };
  return { label: "sensitive", tone: toneForKind("SENSITIVE") };
}

/**
 * A vault pre-compiled into its matcher — the sort + escape + `new RegExp` that
 * {@link toSegments} would otherwise redo on EVERY call.
 *
 * Split out because the caller that matters is a rehype pass, which segments once
 * per TEXT NODE: a long pasted document is hundreds of nodes, so compiling inside
 * `toSegments` recompiled an E-alternation regex hundreds of times per message,
 * and the whole thread's worth landed in the one synchronous commit that renders a
 * conversation. Compile ONCE per pass, match N times.
 *
 * Deliberately explicit rather than an identity-keyed cache inside `toSegments`:
 * vault objects ARE mutated in place elsewhere (the allocator adds entries, the
 * store deletes them), so a memo keyed on the vault would silently serve a stale
 * matcher and drop a redaction's mark.
 */
export interface VaultMatcher {
  /** Alternation of every vault value, longest-first. Sticky state is reset per use. */
  readonly re: RegExp;
  readonly valueToPlaceholder: Map<string, string>;
}

/** Pre-compile `vault` for repeated {@link segmentsWith} calls. `null` = nothing to
 *  match (an empty vault), for which every text is a single plain segment. */
export function compileVault(vault: Vault): VaultMatcher | null {
  const entries = Object.entries(vault).filter(([, v]) => v.length > 0);
  if (entries.length === 0) return null;
  // Longest values first so a value isn't split by a shorter substring.
  entries.sort((a, b) => b[1].length - a[1].length);
  return {
    re: new RegExp(entries.map(([, v]) => escapeRegExp(v)).join("|"), "g"),
    valueToPlaceholder: new Map(entries.map(([ph, v]) => [v, ph])),
  };
}

/**
 * Split `text` into plain + redaction segments by locating every vault value.
 * Longest values first so a value isn't split by a shorter substring.
 *
 * `kinds` (value -> RedactionKind) gives the exact category for each value; when
 * present it drives the colour. This is what makes per-type colours work for the
 * fake-data engine, whose vault keys carry no category. Without it, the category
 * is read back from the placeholder (`[REDACTED_EMAIL_1]`).
 *
 * Segmenting the same vault more than once? {@link compileVault} + {@link segmentsWith}.
 */
export function toSegments(
  text: string,
  vault: Vault,
  kinds?: Record<string, string>,
): RedactionSegment[] {
  const matcher = compileVault(vault);
  return matcher ? segmentsWith(text, matcher, kinds) : [{ kind: "text", value: text }];
}

/** {@link toSegments} against an already-compiled vault. */
export function segmentsWith(
  text: string,
  matcher: VaultMatcher,
  kinds?: Record<string, string>,
): RedactionSegment[] {
  const { re, valueToPlaceholder } = matcher;
  // The loop below always drains `re` until exec returns null, which per spec resets
  // lastIndex to 0 — so a reused matcher is already clean. This reset only covers the
  // abnormal exit (a throw mid-loop leaves lastIndex mid-text, and the NEXT call would
  // then skip everything before it). Cheap; keep it.
  re.lastIndex = 0;

  const segments: RedactionSegment[] = [];
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    // A short value ("us"/"ca") that is merely a SUBSTRING inside a real word
    // ("because"/"Canva") is NOT a redaction — skip it (stays part of the text).
    if (isWordGlued(text, m.index, m[0])) continue;
    if (m.index > i) {
      segments.push({ kind: "text", value: text.slice(i, m.index) });
    }
    const placeholder = valueToPlaceholder.get(m[0]) ?? "";
    const exact = kinds?.[m[0]];
    const { label, tone } = exact
      ? { label: exact, tone: toneForKind(exact) }
      : categoryOf(placeholder, m[0]);
    segments.push({ kind: "redaction", value: m[0], label, tone, placeholder });
    i = m.index + m[0].length;
  }
  if (i < text.length) segments.push({ kind: "text", value: text.slice(i) });
  return segments;
}

/**
 * Symmetric counterpart of {@link toSegments}: split the WIRE text — what the
 * model actually receives — into plain + redaction segments by locating every
 * vault KEY (the `[REDACTED_…]` placeholder for the regex engine, or the believable
 * fake value for the model engine). `toSegments` finds originals (to show); this
 * finds what replaced them (to show what left the machine). `kinds` is keyed by
 * the ORIGINAL value (`vault[key]`), like `toSegments`. Used by the debug logger.
 */
export function wireSegments(
  text: string,
  vault: Vault,
  kinds?: Record<string, string>,
): RedactionSegment[] {
  const keys = Object.keys(vault).filter((k) => k.length > 0);
  if (keys.length === 0) return [{ kind: "text", value: text }];

  keys.sort((a, b) => b.length - a.length); // longest first, avoid partial overlaps
  const re = new RegExp(keys.map((k) => escapeRegExp(k)).join("|"), "g");

  const segments: RedactionSegment[] = [];
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (isWordGlued(text, m.index, m[0])) continue;
    if (m.index > i) segments.push({ kind: "text", value: text.slice(i, m.index) });
    const key = m[0];
    const exact = kinds?.[vault[key]];
    const { label, tone } = exact
      ? { label: exact, tone: toneForKind(exact) }
      : categoryOf(key, vault[key] ?? key);
    segments.push({ kind: "redaction", value: key, label, tone, placeholder: key });
    i = m.index + key.length;
  }
  if (i < text.length) segments.push({ kind: "text", value: text.slice(i) });
  return segments;
}

/** Count redacted spans per pretty label, e.g. { email: 2, name: 1 }. */
export function redactionCounts(
  segments: RedactionSegment[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of segments) {
    if (s.kind === "redaction" && s.label) {
      counts[s.label] = (counts[s.label] ?? 0) + 1;
    }
  }
  return counts;
}
