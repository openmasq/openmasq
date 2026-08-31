import { SpreadsheetViewer } from "../SpreadsheetViewer";
import type { PdfReplacement } from "./pdf/pdfReplacements";

import { useT } from "../../../i18n";
/**
 * A spreadsheet, in the preview's TWO readings — and it stays a spreadsheet in both.
 *
 * « Feuille » is the file as it is: the « Original » role every other format gets from
 * its text layer and a sheet never had. « Redacted » is the same grid showing the FAKE
 * each cell will carry. Rendering what leaves the machine as a wall of lines asked the
 * user to proof-read a table they could no longer read as one — in a sheet the columns
 * ARE the meaning.
 *
 * ⚠️ The wire-affecting gestures belong to the REDACTED reading alone: hover reveals the
 * real value, a click sends it in clear. Selection-to-force-redact keeps working there
 * because what is displayed IS the redacted text, so `doc/docForce.ts`
 * `realFromRedactedSelection` maps it back exactly as it does on the text layer. One
 * component for both, so the two readings cannot drift apart.
 */
export function AttachmentSheetView({
  bytes,
  csv,
  redacted,
  replacements,
  revealed,
  onReveal,
  cutRow,
  wireCut,
}: {
  bytes: Uint8Array;
  csv: boolean;
  /** Show the fakes (+ the reveal gesture) rather than the file's real values. */
  redacted: boolean;
  replacements?: PdfReplacement[];
  revealed?: ReadonlySet<string>;
  onReveal?: (real: string) => void;
  /** First grid row (0-based) the SEND CUT drops — rows from here on never leave the
   *  machine and are shown dimmed with a note (CSV/TSV, exact mapping). Null ⇒ no cut. */
  cutRow?: number | null;
  /** XLSX fallback: the annotated text exceeds the send cap but the grid rows can't be
   *  mapped exactly (multi-sheet, blank-row skips) — show the generic note only. */
  wireCut?: boolean;
}) {
  const t = useT();
  if (!redacted) return <SpreadsheetViewer bytes={bytes} csv={csv} />;
  return (
    <>
      <SpreadsheetViewer
        bytes={bytes}
        csv={csv}
        replacements={replacements}
        revealed={revealed}
        onReveal={onReveal}
        renderFake
        cutRow={cutRow}
      />
      {wireCut && (
        <div className="fv-sheet-note fv-cut-note">
          {t.viewers.sheetCut}
        </div>
      )}
    </>
  );
}
