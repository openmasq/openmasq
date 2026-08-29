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

/** Les séparateurs qu'on sait reconnaître, par ordre de préférence à égalité. */
const SEPARATEURS = [",", ";", "\t"] as const;
/** Combien de lignes on échantillonne pour deviner — assez pour trancher, borné. */
const LIGNES_SONDEES = 20;
/** En dessous de cette proportion de lignes d'accord, on ne conclut pas. */
const ACCORD_MIN = 0.6;

/** Compte les occurrences d'un séparateur HORS guillemets (une virgule citée n'en est pas un). */
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
 * Deviner le séparateur d'un fichier délimité.
 *
 * ⚠️ **Le supposer coûte des CENTIMES, littéralement.** Un export comptable français est
 * séparé par des POINTS-VIRGULES et décimalise à la VIRGULE (`14 812,37`) — c'est ce que
 * produisent les logiciels de compta et Excel en locale FR. Lu à la virgule, chaque montant
 * se coupe en deux (`"…;14 812"` + `"37;"`), la moitié orpheline tombe à l'annotation, et le
 * modèle reçoit `14 812` : il conclut alors à un déséquilibre d'1 € sur une écriture qui
 * tombe juste. Une réponse comptable FAUSSE à partir d'un fichier JUSTE — et rien à l'écran
 * ne le dit. (Observé le 15/08 sur un vrai grand livre, parcours expert-comptable.)
 *
 * Heuristique volontairement prudente : on ne retient un séparateur que si une NETTE
 * majorité des lignes s'accorde sur un même nombre de colonnes, et à qualité égale on
 * préfère celui qui en découpe le plus (un `;` régulier bat une virgule décimale isolée).
 * Sans conclusion nette, on retombe sur le défaut plutôt que de deviner.
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
    // Le nombre de colonnes MODAL — pas la moyenne : un en-tête ou une ligne de titre
    // hors format ne doit pas déplacer le verdict de tout le fichier.
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
 * ⚠️ `largeur` (la plus grande ligne de la grille) est ce qui empêche une cellule de
 * DISPARAÎTRE. L'en-tête d'un export réel n'est pas toujours la ligne la plus large : un
 * grand livre commence par une ligne de TITRE (« Grand livre — … »), qui ne fait qu'une
 * cellule. Bornée à l'en-tête, l'annotation ne gardait alors que la première colonne de
 * chaque écriture — le reste (compte, libellé, débit, crédit) était jeté sans un mot, et
 * le modèle répondait sur un grand livre amputé.
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
  // ⚠️ L'en-tête n'est pas toujours la ligne 0. Un export comptable ouvre sur un TITRE
  // (« Grand livre — … »), parfois une période, puis une ligne vide : prendre la ligne 0
  // pour en-tête nomme les colonnes `col2…col7` et fait perdre au détecteur le contexte
  // (« Débit : », « IBAN : ») qui est la raison d'être de cette annotation. On retient la
  // PREMIÈRE ligne pleine largeur, et le préambule est ré-émis tel quel — jamais jeté.
  // ⚠️ …et « pleine largeur » ne suffit pas : un export comptable ouvre sur un TITRE en
  // cellule FUSIONNÉE, que le lecteur rend comme une ligne pleine largeur dont UNE SEULE
  // cellule est remplie. Prise pour en-tête (mesuré le 15/08/2026 sur un bilan réel), elle
  // préfixait CHAQUE ligne de la raison sociale et renommait les vraies colonnes
  // `col2…col5` — le typage par colonne, qui est toute la raison d'être de cette
  // annotation, était perdu pour le détecteur ET pour le modèle. Un en-tête nomme
  // plusieurs colonnes : on exige donc au moins DEUX cellules remplies, et on retombe sur
  // l'ancienne règle si aucune ligne ne qualifie (grille à une colonne).
  const remplies = (r: string[]): number => r.reduce((n, c) => n + ((c ?? "").trim() ? 1 : 0), 0);
  // Le discriminant est ÉTROIT : UNE seule cellule remplie sur une grille d'au moins TROIS
  // colonnes. Un en-tête à colonne sans nom (`["", "b"]`) n'est donc pas touché — il reste
  // un en-tête, et sa colonne vide s'appelle `col1` comme avant.
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
