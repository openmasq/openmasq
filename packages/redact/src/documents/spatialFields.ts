// SPATIAL label→value pairing over the OCR geometry — the fourth derived reading.
//
// The flat-text label detector (`engine/contextFields`) deliberately refuses to read the
// NEXT line as a label's value: in flat text, "Adresse :\nMerci de votre confiance" would
// redact prose, so the colon must be followed by its value on the SAME line. But a
// form prints exactly the refused shape — the label on one line, the value(s) stacked
// under it — and on the measured 15-document corpus that is where the structural misses
// live (address blocks under « Adresse de facturation : », the holder's name under
// « Titulaire du contrat »).
//
// GEOMETRY is what makes the pairing safe where flat text cannot be: a value is claimed
// only when its box is LEFT-ALIGNED with the label's and VERTICALLY ADJACENT — the visual
// signature of a filled form field, which prose never has. (The same relation the
// key-value-extraction literature models with spatial attention; here the deterministic
// core of it suffices because the LABEL vocabulary is already curated.)
//
// Output is TEXT, not detections: synthesized `«term» : «value»` lines, re-fed through
// the ordinary engine (`redactExtracted`'s layered passes / the send's detect block). So
// the label→category mapping, the generic-term deny-list, the numeric-kind gates and the
// vault atomicity all come from the ONE existing home (`detectLabeledFields`) instead of
// being re-implemented here (rule 9).
import { LABEL_GROUPS } from "../engine/contextFields.labels";
import type { LayerGeometry } from "./reconcile";
import type { OcrLayerPage } from "./geometry";
import type { OcrWord } from "../ocr/layout";

/** One alternation over every label term (all groups) — compiled once. */
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const TERM_ALT = LABEL_GROUPS.flatMap((g) => g.terms).sort((a, b) => b.length - a.length).map(esc).join("|");
/** A LABEL-ONLY line: begins with a known term, at most a few filler words, an optional
 *  trailing colon/dotted leader, and NOTHING else — no digits (a value would carry them),
 *  bounded length. "Titulaire du contrat" and "Adresse de facturation :" match; "Nom du
 *  propriétaire: Michel RADULESTI" does not (the value follows the colon). */
const LABEL_ONLY = new RegExp(
  // An optional identifier HEAD before the term — real forms write « N° de sécurité
  // sociale : », and "N" is a word character, so without this the whole line missed.
  `^\\W{0,3}(?:(?:n[°ºo]|no|num[eé]ro|r[eé]f[eé]rence|ref)\\.?\\s*(?:de\\s+|d['’])?(?:la\\s+)?)?(${TERM_ALT})s?\\b(?:[^\\d\\n:：]{0,28})(?:[:：]|\\.{4,})?\\s*$`,
  "iu",
);

interface Line {
  text: string;
  x0: number;
  yTop: number;
  yBottom: number;
  h: number;
}

/** Group positioned words into visual lines (y-overlap), each line left-to-right. */
function toLines(words: OcrWord[]): Line[] {
  const sorted = [...words].filter((w) => w.text.trim()).sort((a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2);
  const lines: { words: OcrWord[]; yTop: number; yBottom: number }[] = [];
  for (const w of sorted) {
    const yc = (w.y0 + w.y1) / 2;
    const cur = lines[lines.length - 1];
    if (cur && yc <= cur.yBottom) {
      cur.words.push(w);
      cur.yTop = Math.min(cur.yTop, w.y0);
      cur.yBottom = Math.max(cur.yBottom, w.y1);
    } else {
      lines.push({ words: [w], yTop: w.y0, yBottom: w.y1 });
    }
  }
  return lines.map((l) => {
    const ws = l.words.sort((a, b) => a.x0 - b.x0);
    return {
      text: ws.map((w) => w.text).join(" ").trim(),
      x0: ws[0].x0,
      yTop: l.yTop,
      yBottom: l.yBottom,
      h: l.yBottom - l.yTop,
    };
  });
}

/** How many stacked value lines a label may claim (an address block: name, street, CP). */
const MAX_VALUE_LINES = 3;
/** Left-alignment tolerance and vertical gap, as fractions of the LABEL line's height. */
const ALIGN_TOL = 1.2;
const MAX_GAP = 1.9;

/** The synthesized `term : value` lines for one page. */
function pageFieldLines(page: OcrLayerPage): string[] {
  const lines = toLines(page.words);
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].text.match(LABEL_ONLY);
    if (!m) continue;
    const label = lines[i];
    const term = m[1];
    for (let j = i + 1, taken = 0; j < lines.length && taken < MAX_VALUE_LINES; j++) {
      const v = lines[j];
      if (v.yTop - (taken === 0 ? label.yBottom : lines[j - 1].yBottom) > MAX_GAP * label.h) break;
      // Left-aligned with the label (a filled field), never a different column.
      if (Math.abs(v.x0 - label.x0) > ALIGN_TOL * label.h) break;
      // A following LABEL line ends the block — its value belongs to it, not to us.
      if (LABEL_ONLY.test(v.text)) break;
      if (!/[\p{L}\p{N}]/u.test(v.text)) break;
      out.push(`${term} : ${v.text}`);
      taken++;
    }
  }
  return out;
}

/**
 * Synthesized `label : value` lines from the OCR geometry, or null when there is nothing
 * to pair. Fed through the ordinary detectors — never a detection source of its own.
 */
export function spatialFieldLines(file: LayerGeometry): string | null {
  const pages = file.ocrPages;
  if (!pages?.length) return null;
  const all = pages.flatMap(pageFieldLines);
  return all.length ? all.join("\n") : null;
}
