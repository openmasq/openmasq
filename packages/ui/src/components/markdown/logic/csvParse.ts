/**
 * Minimal CSV/TSV parser for rendering a model-generated ```csv``` block as a TABLE
 * instead of raw monospace code. Pure + testable. Handles `;` / `,` / tab delimiters
 * (auto-detected), `"quoted"` fields with `""` escapes, ragged rows (padded), and
 * blank lines (dropped). Returns null when the text isn't tabular enough (< 2 lines
 * or a single column) so the caller can fall back to a normal code block.
 */

export interface CsvTable {
  headers: string[];
  rows: string[][];
}

/**
 * Row cap. A model can emit an arbitrarily long ```csv fence (a tool result pasted
 * whole, or an injected page telling it to), and this parser runs DURING RENDER inside
 * a component covered only by the root `ErrorBoundary` — so anything that throws here
 * replaces the WHOLE UI with the error card, and re-throws the moment the conversation
 * is reopened. A table this size is unreadable anyway, so we hand the caller `null` and
 * it falls back to a plain (virtualisable) code block.
 */
export const MAX_CSV_ROWS = 20_000;

/** Most frequent of `;` / tab / `,` OUTSIDE quotes on the header line. */
function detectDelimiter(line: string): string {
  const counts: Record<string, number> = { ";": 0, "\t": 0, ",": 0 };
  let inQ = false;
  for (const ch of line) {
    if (ch === '"') inQ = !inQ;
    else if (!inQ && ch in counts) counts[ch] += 1;
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : ",";
}

/** Split one line on `delim`, respecting `"quoted"` fields (with `""` escapes). */
function splitLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === delim) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/** Parse CSV/TSV text into a table, or null when it isn't tabular. */
export function parseCsvText(text: string): CsvTable | null {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((l) => l.trim() !== ""); // drop blank separator lines (not `;;total` rows)
  if (lines.length < 2) return null;
  if (lines.length > MAX_CSV_ROWS) return null; // see MAX_CSV_ROWS — refuse before parsing
  const delim = detectDelimiter(lines[0]);
  const rows = lines.map((l) => splitLine(l, delim));
  // `Math.max(...rows.map(…))` spreads one ARGUMENT per row and throws `RangeError:
  // too many arguments` past ~125 000 of them — a crash raised during render, i.e. the
  // whole-app error card (see MAX_CSV_ROWS). A fold takes no argument list at all, so
  // the cap above is a product decision rather than the only thing holding this up.
  const cols = rows.reduce((m, r) => Math.max(m, r.length), 0);
  if (cols < 2) return null; // one column → a table adds nothing
  const norm = rows.map((r) => {
    const c = r.slice(0, cols);
    while (c.length < cols) c.push("");
    return c;
  });
  return { headers: norm[0], rows: norm.slice(1) };
}

/** A summary/total row (contains a "total" cell) — emphasised in the table. */
export function isTotalRow(row: string[]): boolean {
  return row.some((c) => /\btotal\b/i.test(c));
}
