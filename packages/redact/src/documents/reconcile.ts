// Two-layer RECONCILIATION: scrub an extracted document across its text layer AND its
// OCR layer. This is the home of the cross-layer logic: the value-union detection, and
// the HYBRID third layer (exact text-layer characters re-serialized in the OCR reading
// order) for pages whose text-layer reconstruction is untrustworthy.
import { applyVault, redact, type RedactOptions, type RedactionResult, type Vault } from "../index";
import { alignWords, type PageAlignment } from "./align";
import { ocrWordsToLayout } from "../ocr/layout";
import { spatialFieldLines } from "./spatialFields";
import { PAGE_BREAK, type ExtractedFile } from "./core";
import type { OcrLayerPage } from "./geometry";

/** Build the hybrid only where it can HELP: the page's two readings must genuinely
 *  DISAGREE (below, the text layer's order is fine and the hybrid adds nothing)… */
export const HYBRID_MIN_DIVERGENCE = 0.35;
/** …and enough OCR words must sit over real glyphs (below, the page is image-heavy and
 *  the plain OCR second layer already covers it). */
export const HYBRID_MIN_COVERAGE = 0.3;

/**
 * The HYBRID reading of a document: per page, every OCR word replaced by the EXACT
 * text-layer characters under its box (`alignWords`), re-serialized in the OCR reading
 * order (same 2D grid as the OCR layer, so label:value adjacency is preserved). This is
 * the best of both layers — exact characters, trustworthy order — and it exists because
 * each layer alone fails the detectors differently: the text layer's broken reconstruction
 * starves them of context; the OCR noise breaks their value matching.
 *
 * Returns null when geometry is absent/mismatched or when NO page clears the divergence
 * + coverage gates (nothing to gain). Pages that don't clear the gates keep their OCR
 * reading (fail-closed: never LESS than the OCR layer already said).
 *
 * Takes only the geometry fields, so a UI caller can hand it a partial shape.
 */
export function hybridLayerText(file: LayerGeometry): string | null {
  const aligned = pageAlignments(file);
  if (!aligned) return null;
  let anyHybrid = false;
  const pages = aligned.map(({ ocr, alignment }) => {
    const { words, coverage, divergence } = alignment;
    if (divergence < HYBRID_MIN_DIVERGENCE || coverage < HYBRID_MIN_COVERAGE) return ocr.text;
    anyHybrid = true;
    const exactByWord = new Map(words.map((w) => [w.wordIndex, w.exact]));
    const substituted = ocr.words.map((w, wi) => ({ ...w, text: exactByWord.get(wi) ?? w.text }));
    return ocrWordsToLayout(substituted).text;
  });
  return anyHybrid ? pages.join(PAGE_BREAK) : null;
}

/** The geometry subset the cross-layer machinery needs. */
export type LayerGeometry = Pick<ExtractedFile, "textPages" | "ocrPages">;

/** Align every page pair, or null when the geometry is absent/mismatched. */
function pageAlignments(
  file: LayerGeometry,
): { ocr: OcrLayerPage; alignment: PageAlignment }[] | null {
  const { textPages, ocrPages } = file;
  if (!textPages || !ocrPages || textPages.length !== ocrPages.length || !textPages.length) {
    return null;
  }
  return textPages.map((t, i) => ({ ocr: ocrPages[i], alignment: alignWords(t, ocrPages[i]) }));
}

/** Ignore only very short values: a 1–3 char "variant" ("34"→"3A") is as likely a
 *  coincidence as a misread, and its highlight would over-mark ordinary text. */
const VARIANT_MIN_CHARS = 4;

/**
 * The OCR-side NOISY VARIANTS of already-matched values: for each match, find the run of
 * consecutive OCR words whose EXACT readings (text-layer characters under their boxes)
 * spell the matched value — the OCR texts of those same words are then what the OCR layer
 * CALLS that value ("SABOVRDIN JULIEN" for a matched "SABOURDIN JULIEN"). Each differing
 * variant is emitted as an ADDITIONAL match on the SAME placeholder, so the highlight /
 * scan-paint layers cover the noisy occurrence and it stays ONE identity (one fake, the
 * vault's canonical entry keeps the EXACT value — `unredact` restores the real reading,
 * never the noise). Purely additive: it can only extend redaction, never lift it.
 */
function ocrVariantMatches(file: ExtractedFile, matches: Matches): Matches {
  const aligned = pageAlignments(file);
  if (!aligned || !matches.length) return [];
  const collapse = (s: string) => s.replace(/\s+/g, " ").trim();
  const out: Matches = [];
  for (const { ocr, alignment } of aligned) {
    const exactByWord = new Map(alignment.words.map((w) => [w.wordIndex, w.exact]));
    for (const m of matches) {
      const value = collapse(m.value);
      if (value.length < VARIANT_MIN_CHARS) continue;
      const tokens = value.split(" ");
      for (let i = 0; i + tokens.length <= ocr.words.length; i++) {
        const windowWords = ocr.words.slice(i, i + tokens.length);
        const exacts = windowWords.map((_, j) => exactByWord.get(i + j)?.trim() ?? null);
        if (exacts.some((e) => e === null)) continue;
        if (collapse(exacts.join(" ")) !== value) continue;
        const variant = collapse(windowWords.map((w) => w.text).join(" "));
        if (variant && variant !== value && variant.length >= VARIANT_MIN_CHARS) {
          out.push({ type: m.type, value: variant, placeholder: m.placeholder, category: m.category });
        }
      }
    }
  }
  return out;
}

export interface RedactedDocument extends ExtractedFile {
  /** The scrubbed text safe to hand to a model. */
  wire: string;
  /** placeholder → original, to restore the reply. */
  vault: Vault;
  /** Reversibly-redacted spans found in this document. */
  matches: RedactionResult["matches"];
}

type Matches = RedactionResult["matches"];

/** Union two match lists by `${value} ${type}` (the vault key identity). */
function mergeMatches(base: Matches, extra: Matches): Matches {
  const seen = new Set(base.map((m) => `${m.value} ${m.type}`));
  return [...base, ...extra.filter((m) => !seen.has(`${m.value} ${m.type}`))];
}

/** Scrub an already-extracted file's text — the document analogue of `redact`.
 *  ALWAYS-OCR / two-layer: detection runs over the UNION of the primary `text`, the
 *  `ocrText` layer AND (when the page geometry warrants it) the HYBRID layer — all into
 *  the SAME vault — so PII visible only in the page image, or only once exact characters
 *  meet the OCR reading order, is still vaulted and reported (fail-closed; the layers are
 *  strictly ADDITIVE). `wire` (what a model receives) is built from the primary `text`
 *  only, so the model never sees garbled OCR. */
export function redactExtracted(file: ExtractedFile, options: RedactOptions = {}): RedactedDocument {
  const vault = options.vault ?? {};
  const { text: wire, matches } = file.text
    ? redact(file.text, { ...options, vault })
    : { text: "", matches: [] };
  let all = matches;
  // Second layer: detect over the OCR text with the SAME vault so an OCR-only value is
  // redacted/vaulted too (its fake stays reversible + consistent). Adds to `matches` (the
  // UI highlights it); does NOT change `wire`.
  if (file.ocrText && file.ocrText !== file.text) {
    all = mergeMatches(all, redact(file.ocrText, { ...options, vault }).matches);
  }
  // Third layer: the HYBRID reading (exact characters, OCR order) for pages whose
  // text-layer reconstruction diverges from what the pixels read. It catches what BOTH
  // other layers miss the same value differently: the text layer scrambles its context,
  // the OCR misreads its characters. Same vault; additive only.
  const hybrid = hybridLayerText(file);
  if (hybrid && hybrid !== file.text && hybrid !== file.ocrText) {
    all = mergeMatches(all, redact(hybrid, { ...options, vault }).matches);
  }
  // Fourth layer: SPATIAL label→value pairing (a form's value stacked UNDER its label —
  // the shape the flat-text label detector deliberately refuses). Synthesized
  // `label : value` lines through the SAME engine + vault; additive only, and the
  // backstop below applies whatever it discovers to the wire like any other layer.
  const fieldLines = spatialFieldLines(file);
  if (fieldLines) {
    all = mergeMatches(all, redact(fieldLines, { ...options, vault }).matches);
  }
  // BACKSTOP (fail-closed): a value the OCR/hybrid layers discovered can still sit
  // VERBATIM in the primary text — where the broken reconstruction starved its detector
  // of context (the label ended up lines away) — i.e. still in clear in `wire`. Apply
  // those layers' fakes to the wire by VALUE (whole-word-gated `applyVault`, the
  // already-established placeholder), so what leaves the machine never contains a value
  // the document's own pixels just proved sensitive. Category filters were already
  // applied by each layer's `redact` pass, so this re-masks nothing the user disabled.
  const primaryValues = new Set(matches.map((m) => m.value));
  const discovered: Vault = {};
  for (const m of all) {
    if (!primaryValues.has(m.value) && vault[m.placeholder] !== undefined) {
      discovered[m.placeholder] = vault[m.placeholder];
    }
  }
  const backstopped = Object.keys(discovered).length ? applyVault(wire, discovered) : wire;
  // Cross-layer ALIAS: the noisy OCR renditions of matched values, on the same fakes.
  all = mergeMatches(all, ocrVariantMatches(file, all));
  return { ...file, wire: backstopped, vault, matches: all };
}
