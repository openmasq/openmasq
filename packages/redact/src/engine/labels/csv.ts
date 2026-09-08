// A CSV PASTED AS TEXT — the header row far from its rows, every cell bare:
//
//     "name","ssn","street_address"
//     "Giada M. Giannuzzi","271-75-7823","51203 Riley Overpass, Apt. 4"
//
// A CSV FILE gets its rows re-emitted as `header: value | header: value` before detection
// (`../documents/tabular.ts`), so each cell sits next to its column label; a CSV pasted into
// the chat got nothing, and its SSN, routing number and password columns shipped in clear
// (measured 2026-09-07 on Gretel's finance corpus, `bench/spans/`). This pass finds the
// block, re-emits it with the SAME serialiser, and reads it with the SAME labelled-field
// detector — one serialisation, one vocabulary (rule 9). STRUCTURE is the gate, as in
// `labelBlocks.ts`: a header line whose cells are at least two known labels, then at least
// one line with the same number of separators. Values are the verbatim cells, so a cell whose
// quotes carried an escape (`""`) is skipped rather than guessed.
import type { Detection } from "../../types";
import { compterHorsGuillemets, gridToAnnotatedText, parseDelimited } from "../../documents/serialize/tabular";
import { labelOf } from "./terms";
import { detectLabeledFields } from ".";

const SEPARATORS = [",", ";", "\t"] as const;
/** A header cell read as a label: quotes off, joiners (and the markdown-escaped `\_`) as spaces. */
const asLabel = (cell: string): boolean =>
  !!labelOf(cell.replace(/^["'`]|["'`]$/gu, "").replace(/\\_|[_-]/gu, " ").trim());

function headerSeparator(line: string): (typeof SEPARATORS)[number] | null {
  for (const sep of SEPARATORS) {
    if (compterHorsGuillemets(line, sep) < 1) continue;
    const cells = parseDelimited(line, sep)[0] ?? [];
    if (cells.filter(asLabel).length >= 2) return sep;
  }
  return null;
}

export function detectCsvBlocks(text: string): Detection[] {
  if (!text || !/[,;\t]/u.test(text)) return [];
  const lines = text.split(/\r?\n/u);
  const out: Detection[] = [];
  const seen = new Set<string>();
  let i = 0;
  while (i < lines.length) {
    const sep = headerSeparator(lines[i]);
    if (!sep) { i++; continue; }
    const n = compterHorsGuillemets(lines[i], sep);
    let j = i + 1;
    while (j < lines.length && lines[j].trim() && compterHorsGuillemets(lines[j], sep) === n) j++;
    if (j - i < 2) { i++; continue; }
    const annotated = gridToAnnotatedText(parseDelimited(lines.slice(i, j).join("\n"), sep));
    for (const d of detectLabeledFields(annotated)) {
      const key = `${d.category}::${d.value}`;
      if (seen.has(key) || !text.includes(d.value)) continue;
      seen.add(key);
      out.push({ value: d.value, category: d.category });
    }
    i = j;
  }
  return out;
}
