// Layout-aware serialization of TABULAR files (CSV/TSV/XLSX) for redaction —
// approach (A). A flat CSV dump puts the header row far from its data (line 1 vs
// line 4000), so the detector (LLM / BERT NER / regex look-behind) loses the
// header→cell association and can't tell that a bare 15-digit column is a
// `num_secu`. Here every data row is re-emitted as `header: value | header:
// value`, so each value sits NEXT TO its column label — the exact context the
// detector needs. Values stay VERBATIM slices of the original cell, so redaction
// stays reversible (the vault maps fake→original by value) and the same value is
// still found/painted wherever it appears.
//
// Pure (no Node/DOM, no SheetJS) — the workbook parse lives in `core.ts`, which
// hands the parsed grid here.

/**
 * Minimal RFC-4180-ish delimited parser → rows of VERBATIM cell strings.
 * Handles quoted fields (embedded delimiter/newline, `""` escape) and CRLF.
 * The returned cell is the REAL value (quotes stripped, `""`→`"`), i.e. exactly
 * what a human reads — so it matches the vault / the painted file.
 */
export function parseDelimited(text: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let sawCell = false; // did this row have any cell (so a trailing "" counts)?

  const endField = () => {
    row.push(field);
    field = "";
    sawCell = true;
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
    sawCell = false;
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === delimiter) endField();
    else if (c === "\n") endRow();
    else if (c === "\r") {
      /* swallow — \r\n handled by the \n branch, lone \r ends the row */
      if (text[i + 1] !== "\n") endRow();
    } else field += c;
  }
  // Flush the last field/row unless the input ended on a clean newline (no
  // dangling content), which would otherwise append a spurious empty row.
  if (field !== "" || sawCell || row.length) endRow();
  return rows;
}

/** The separators we know how to recognise, in tie-break preference order. */
const SEPARATEURS = [",", ";", "\t"] as const;
/** How many lines we sample to guess — enough to decide, bounded. */
const LIGNES_SONDEES = 20;
/** Below this proportion of agreeing lines, we don't conclude anything. */
const ACCORD_MIN = 0.6;

/** Counts occurrences of a separator OUTSIDE quotes (a quoted comma doesn't count). */
function compterHorsGuillemets(ligne: string, sep: string): number {
  let n = 0;
  let cite = false;
  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i];
    if (c === '"') {
      if (cite && ligne[i + 1] === '"') i++;
      else cite = !cite;
    } else if (!cite && c === sep) n++;
  }
  return n;
}

/**
 * Guess the separator of a delimited file.
 *
 * ⚠️ **Assuming it costs CENTS, literally.** A French accounting export is
 * separated by SEMICOLONS and uses a COMMA for decimals (`14 812,37`) — that's what
 * accounting software and Excel produce in the FR locale. Read on a comma, every amount
 * splits in two (`"…;14 812"` + `"37;"`), the orphan half falls to the annotation, and the
 * model receives `14 812`: it then concludes there's a €1 imbalance on an entry that
 * actually balances. A FALSE accounting answer from a CORRECT file — and nothing on screen
 * says so. (Observed on 15/08 on a real general ledger, accountant user journey.)
 *
 * Deliberately cautious heuristic: we only settle on a separator if a CLEAR
 * majority of lines agree on the same column count, and at equal quality we
 * prefer the one that splits into more (a regular `;` beats an isolated decimal comma).
 * With no clear conclusion, we fall back to the default rather than guess.
 */
export function sniffDelimiter(text: string, defaut = ","): string {
  const lignes = text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .slice(0, LIGNES_SONDEES);
  if (lignes.length < 2) return defaut;

  let meilleur = defaut;
  let meilleuresColonnes = 0;
  for (const sep of SEPARATEURS) {
    const comptes = lignes.map((l) => compterHorsGuillemets(l, sep));
    // The MODAL column count — not the average: a header or an off-format
    // title line must not shift the whole file's verdict.
    const freq = new Map<number, number>();
    for (const n of comptes) if (n > 0) freq.set(n, (freq.get(n) ?? 0) + 1);
    let modal = 0;
    let accord = 0;
    for (const [n, f] of freq)
      if (f > accord || (f === accord && n > modal)) {
        modal = n;
        accord = f;
      }
    if (!modal || accord < Math.max(2, lignes.length * ACCORD_MIN)) continue;
    if (modal > meilleuresColonnes) {
      meilleur = sep;
      meilleuresColonnes = modal;
    }
  }
  return meilleur;
}

/**
 * Header labels: trimmed; empty/blank → `col{n}` so a value is never label-less.
 *
 * ⚠️ `largeur` (the grid's widest row) is what keeps a cell from
 * DISAPPEARING. A real export's header isn't always the widest row: a
 * general ledger starts with a TITLE row (« Grand livre — … »), which is only one
 * cell. Bounded to the header, the annotation was then only keeping the first column of
 * each entry — the rest (account, label, debit, credit) was discarded without a word, and
 * the model was answering about an amputated general ledger.
 */
function normalizeHeaders(headerRow: string[], largeur = headerRow.length): string[] {
  return Array.from({ length: Math.max(largeur, headerRow.length) }, (_, i) => {
    const t = (headerRow[i] ?? "").trim();
    return t || `col${i + 1}`;
  });
}

/** True when the grid has no usable header (0 or 1 rows) or is empty. */
function isTrivial(rows: string[][]): boolean {
  return rows.length < 2 || rows.every((r) => r.every((c) => !c || !c.trim()));
}

/** Parse a delimited FILE exactly as extraction does — the ONE home of the
 *  "TSV is tabs, anything else is sniffed" rule (rule 9), shared by `core.ts`
 *  and the preview grid's send-cut mapping. */
export function delimitedGrid(raw: string, tsv: boolean): string[][] {
  return parseDelimited(raw, tsv ? "\t" : sniffDelimiter(raw));
}

/** One emitted line of the annotated serialization + the GRID row it came from. */
interface AnnotatedLine {
  line: string;
  row: number;
}

/**
 * Re-emit a parsed grid as header-annotated records. Row 0 is the header; each
 * subsequent row becomes `header: value | header: value` (empty cells skipped).
 * A header-only / empty grid falls back to a plain space-join so nothing is lost.
 * `sheetName` prefixes the block when a workbook has several sheets.
 */
export function gridToAnnotatedText(rows: string[][], sheetName?: string): string {
  const { prefix, lines } = annotatedLines(rows, sheetName);
  return lines.length ? prefix + lines.map((l) => l.line).join("\n") : "";
}

/**
 * Which GRID row does the per-document send cut land on? Walks the SAME emission as
 * {@link gridToAnnotatedText} (shared `annotatedLines` — parity by construction), keeping
 * a line only when it fits WHOLE within `maxChars` — the line-boundary clip the send
 * applies (`clipFileText`), so a row is never claimed « sent » on a half-shipped value.
 * Returns the first grid row (0-based) whose line does NOT fit, or null when everything
 * fits. Rows at or past the returned index never leave the machine.
 */
export function annotatedCutRow(rows: string[][], maxChars: number, sheetName?: string): number | null {
  const { prefix, lines } = annotatedLines(rows, sheetName);
  let cum = prefix.length;
  for (let i = 0; i < lines.length; i++) {
    const end = cum + lines[i].line.length; // offset of this line's trailing "\n" / EOS
    if (end > maxChars) return lines[i].row;
    cum = end + 1; // the join's "\n"
  }
  return null;
}

/** The shared emission behind the two functions above — every serialization decision
 *  (header pick, preamble, empty-cell skip) lives HERE once, with each line carrying
 *  its source grid row so the cut can be mapped back onto the grid. */
function annotatedLines(rows: string[][], sheetName?: string): { prefix: string; lines: AnnotatedLine[] } {
  const prefix = sheetName ? `=== ${sheetName} ===\n` : "";
  if (isTrivial(rows)) {
    const flat: AnnotatedLine[] = [];
    rows.forEach((r, i) => {
      const t = r.map((c) => (c ?? "").trim()).filter(Boolean).join(" ");
      if (t) flat.push({ line: t, row: i });
    });
    return { prefix, lines: flat };
  }
  const largeur = rows.reduce((m, r) => Math.max(m, r.length), 0);
  // ⚠️ The header isn't always row 0. An accounting export opens on a TITLE
  // (« Grand livre — … »), sometimes a period, then an empty row: taking row 0
  // as the header names the columns `col2…col7` and makes the detector lose the context
  // (« Débit : », « IBAN : ») that is this annotation's whole reason for being. We keep the
  // FIRST full-width row, and the preamble is re-emitted verbatim — never discarded.
  // ⚠️ …and "full width" isn't enough: an accounting export opens on a TITLE in a
  // MERGED cell, which the reader renders as a full-width row where only ONE
  // cell is filled. Taken as the header (measured on 15/08/2026 on a real balance sheet), it
  // was prefixing EVERY row with the company name and renaming the real columns
  // `col2…col5` — the per-column typing, which is this annotation's whole reason for
  // being, was lost for the detector AND for the model. A header names
  // several columns: so we require at least TWO filled cells, and we fall back to
  // the old rule if no row qualifies (single-column grid).
  const remplies = (r: string[]): number => r.reduce((n, c) => n + ((c ?? "").trim() ? 1 : 0), 0);
  // The discriminant is NARROW: ONE single filled cell on a grid of at least THREE
  // columns. So a header with an unnamed column (`["", "b"]`) isn't affected — it stays
  // a header, and its empty column is still called `col1` as before.
  const titreFusionne = (r: string[]): boolean => largeur >= 3 && remplies(r) === 1;
  const enTete = rows.findIndex((r) => r.length === largeur && !titreFusionne(r));
  const debut = enTete < 0 ? Math.max(0, rows.findIndex((r) => r.length === largeur)) : enTete;
  const headers = normalizeHeaders(rows[debut], largeur);
  const lines: AnnotatedLine[] = [];
  rows.slice(0, debut).forEach((r, i) => {
    const t = r.map((c) => (c ?? "").trim()).filter(Boolean).join(" ");
    if (t) lines.push({ line: t, row: i });
  });
  for (let r = debut + 1; r < rows.length; r++) {
    const row = rows[r];
    const cells: string[] = [];
    for (let i = 0; i < headers.length; i++) {
      const v = (row[i] ?? "").trim();
      if (!v) continue; // skip empty cells — no label: <blank> noise
      cells.push(`${headers[i]}: ${v}`);
    }
    if (cells.length) lines.push({ line: cells.join(" | "), row: r });
  }
  return { prefix, lines };
}
