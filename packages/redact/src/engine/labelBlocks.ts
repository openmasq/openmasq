import type { Detection } from "../types";
import { labelOf } from "./contextFields.labels";
import { acceptFieldValue } from "./contextFields";

/**
 * DETACHED label block — the form whose labels and values arrive as two separate
 * COLUMNS, so extraction stacks every label first and every value after:
 *
 *     Nom                     VILLENEUVE
 *     Prénom            →     Anne-Charlotte
 *     Date de naissance       03/12/1987
 *
 * A PDF form laid out as a two-column table, and a page whose text layer is read
 * column-by-column, both produce it. The inline pass needs label and value on one line
 * and the vertical pass needs them on ADJACENT lines, so neither sees this: the values
 * carrying their own shape (name, address, phone, e-mail) still got caught by their own
 * detectors, while everything typed ONLY by its label — a date of birth, a customer
 * number, a bare city — shipped in clear.
 *
 * STRUCTURE is the gate, exactly like `teamLists.ts`: N consecutive lines that are
 * NOTHING but a known label, then N lines that are none of them. Below `MIN_RUN` labels
 * the coincidence is ordinary (a two-line heading), and an unequal count means the
 * pairing is a guess — both are refused rather than aligned approximately, because a
 * mis-pairing types a value with the WRONG category and fakes it as the wrong kind.
 */

/** Below this, a run of label-looking lines is ordinary prose/heading, not a form. */
const MIN_RUN = 3;
/** A form's value column never runs this long; beyond it we are reading a document. */
const MAX_RUN = 20;

export function detectLabelBlocks(text: string): Detection[] {
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  const out: Detection[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    // Collect the longest run of pure-label lines starting here.
    const labels: { category: string }[] = [];
    let j = i;
    while (j < lines.length && labels.length < MAX_RUN) {
      const l = labelOf(lines[j] ?? "");
      if (!l) break;
      labels.push(l);
      j++;
    }
    if (labels.length < MIN_RUN) continue;

    // Skip the blank line(s) the two blocks are separated by, then read exactly as many
    // value lines. A blank INSIDE the value block would break the positional pairing, so
    // the run must be contiguous — a gap means we are no longer reading one form.
    let k = j;
    while (k < lines.length && !(lines[k] ?? "").trim()) k++;
    const values: { raw: string; line: number }[] = [];
    while (k < lines.length && values.length < labels.length) {
      const raw = (lines[k] ?? "").trim();
      if (!raw) break;
      // A value line that is ITSELF a label means the two blocks never separated (a
      // plain stacked form) — that is the vertical pass's shape, not this one.
      if (labelOf(raw)) break;
      values.push({ raw, line: k });
      k++;
    }
    if (values.length !== labels.length) continue;

    for (let n = 0; n < labels.length; n++) {
      const ok = acceptFieldValue(values[n]!.raw, labels[n]!.category);
      if (!ok) continue;
      const key = `${ok.category}::${ok.value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ value: ok.value, category: ok.category });
    }
    i = k - 1;
  }
  return out;
}
