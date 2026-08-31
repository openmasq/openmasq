import { useEffect, useMemo, useRef, useState } from "react";
import { FileSkeleton } from "../viewers/FileSkeleton";
import type { PdfReplacement } from "../viewers/pdf/pdfReplacements";
import { parse, makeMatcher, segmentsOf, MAX_ROWS, MAX_COLS, type Sheet } from "./parse";

import { useT } from "../../../i18n";
// Faithful spreadsheet preview: renders the parsed workbook as a real grid (column
// letters + row numbers + merged cells), one tab per sheet. Works for
// .xlsx/.xlsm/.xls/.ods (binary) and .csv/.tsv (text). `xlsx` (SheetJS) is
// isomorphic and lazy-imported so it stays out of the main bundle.
//
// PERF: a big sheet (thousands of rows) is rendered with fixed-height ROW
// VIRTUALISATION — only the rows in (and near) the viewport are in the DOM, so a
// 2000-row × 60-col preview no longer paints ~120k cells at once. Columns are sized
// ONCE from a content sample + `table-layout: fixed`, which is what keeps widths
// stable across scroll windows (no jitter). A sheet with MERGED cells (rowSpan) can't
// use fixed row heights → it falls back to rendering in full (rare, usually small).
//
// Redaction: `replacements` (real→fake+tone, computed ONCE at drop time / rebuilt
// from the vault) drives highlighting. When `renderFake` is set (the BEFORE-SEND
// preview, whose bytes are the ORIGINAL), a redacted cell DISPLAYS the fake the model
// will see — revealing the real value on hover — so the redacted grid is visibly
// different from the original (it used to show the real value highlighted, which read
// as "nothing was redacted"). The post-send viewer passes already-scrubbed bytes and
// leaves `renderFake` off.

const ROW_H = 25; // px — a data row is single-line (nowrap), so its height is uniform.
const OVERSCAN = 8; // rows rendered above/below the viewport (smooth fast scroll).
const VIRTUALISE_ABOVE = 80; // below this, just render everything (no spacers).

export function SpreadsheetViewer({
  bytes,
  csv = false,
  replacements,
  revealed,
  onReveal,
  renderFake = false,
  cutRow = null,
}: {
  bytes: Uint8Array;
  csv?: boolean;
  replacements?: PdfReplacement[];
  /** REAL values kept in clear (before-send reveal). A revealed cell shows plain. */
  revealed?: ReadonlySet<string>;
  /** Click a redacted cell → toggle its real value in/out of the reveal set. */
  onReveal?: (real: string) => void;
  /** Display the FAKE (not the real value) in a redacted cell — the before-send
   *  preview over ORIGINAL bytes. Off (default) shows the bytes verbatim. */
  renderFake?: boolean;
  /** SEND CUT: first grid row (0-based) that does NOT leave the machine. Rows from
   *  here on render dimmed (`fv-row-unsent`) with an explaining note — un-redacted
   *  cells there used to read as « partis en clair » when they never left at all. */
  cutRow?: number | null;
}) {
  const t = useT();
  const [sheets, setSheets] = useState<Sheet[] | null | "error">(null);
  const [active, setActive] = useState(0);
  const matcher = useMemo(() => makeMatcher(replacements), [replacements]);

  const sheetOrNull =
    Array.isArray(sheets) && sheets.length ? sheets[Math.min(active, sheets.length - 1)]! : null;

  useEffect(() => {
    let alive = true;
    setSheets(null);
    parse(bytes, csv)
      .then((s) => alive && setSheets(s.length ? s : "error"))
      .catch(() => alive && setSheets("error"));
    return () => {
      alive = false;
    };
  }, [bytes, csv]);

  // Which sheets hold ≥1 redacted cell → colour their tab.
  const redactedSheets = useMemo(() => {
    const set = new Set<number>();
    if (!matcher || !Array.isArray(sheets)) return set;
    sheets.forEach((s, i) => {
      for (const row of s.rows)
        if (row.cells.some((c) => c && c.text && ((matcher.re.lastIndex = 0), matcher.re.test(c.text)))) {
          set.add(i);
          break;
        }
    });
    return set;
  }, [sheets, matcher]);

  // Viewport tracking for row virtualisation.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(520);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewH(el.clientHeight || 520));
    ro.observe(el);
    setViewH(el.clientHeight || 520);
    return () => ro.disconnect();
  }, [sheets, active]);
  // A new sheet/file resets the scroll position so the window starts at the top.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    setScrollTop(0);
  }, [active, bytes]);

  if (sheets === null) return <FileSkeleton variant="sheet" />;
  if (sheets === "error") return <div className="fv-status">{t.viewers.unreadableSheet}</div>;

  const sheet = sheetOrNull!;
  const total = sheet.rows.length;
  const virtual = !sheet.hasMerges && total > VIRTUALISE_ABOVE;
  const start = virtual ? Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN) : 0;
  const end = virtual ? Math.min(total, Math.ceil((scrollTop + viewH) / ROW_H) + OVERSCAN) : total;
  const padTop = start * ROW_H;
  const padBottom = (total - end) * ROW_H;
  const visible = sheet.rows.slice(start, end);

  const renderText = (text: string) =>
    segmentsOf(text, matcher).map((seg, i) => {
      if (!seg.tone || !seg.real) return <span key={i}>{seg.text}</span>;
      const isRevealed = !!revealed?.has(seg.real);
      // Redacted cell: show the FAKE (renderFake, over original bytes) until the user
      // reveals it → then the real value in clear. Off → show the bytes as-is.
      const shown = renderFake && !isRevealed ? seg.fake ?? seg.text : seg.text;
      // `hl-<hue>` — THE hue map (`packages/ui/CLAUDE.md`). A `tone-*` class maps nothing
      // for a redaction mark, so the fill fell back to a near-invisible slate and the grid
      // looked un-highlighted: the CSV bug.
      const cls = isRevealed ? "fv-cell-revealed" : `redaction-mark hl-${seg.tone}`;
      // No onClick: the click PINS the shared reveal card (useMarkHover
      // delegated) — inspect ≠ reveal (audit 2026-08-10); « Unredact » lives
      // in the card. `onReveal` now only serves as an editability signal.
      return onReveal ? (
        <button
          key={i}
          type="button"
          className={`${cls} fv-reveal-mark`}
          data-doc-reveal=""
          data-real={seg.real}
          data-tone={seg.tone}
          data-kind={seg.kind ?? ""}
          aria-label={t.viewers.cellAria(isRevealed)}
        >
          {shown}
        </button>
      ) : (
        <mark key={i} className={`redaction-mark hl-${seg.tone}`}>{shown}</mark>
      );
    });

  return (
    <div className="fv-sheet">
      {sheets.length > 1 && (
        <div className="fv-sheet-tabs">
          {sheets.map((s, i) => (
            <button
              key={s.name}
              className={`fv-sheet-tab ${i === active ? "on" : ""}${redactedSheets.has(i) ? " has-redaction" : ""}`}
              onClick={() => setActive(i)}
              title={redactedSheets.has(i) ? `${s.name} — contient des données redacted` : s.name}
            >
              {redactedSheets.has(i) && <span className="fv-sheet-dot" />}
              {s.name}
            </button>
          ))}
        </div>
      )}
      <div
        className="fv-sheet-scroll"
        ref={scrollRef}
        onScroll={(e) => virtual && setScrollTop(e.currentTarget.scrollTop)}
      >
        {/* `fv-grid-fixed` (NOT a bare `fixed`): the Tailwind `.fixed` utility is
            `position: fixed` and wins the cascade — it would yank the table out of
            flow, collapsing its scroll container to 0 (no scroll, grid spills off
            the modal). Keep grid modifiers inside the `fv-*` namespace. */}
        <table className={`fv-grid${virtual ? " fv-grid-fixed" : ""}`}>
          {virtual && (
            <colgroup>
              <col className="fv-col-rowhead" />
              {sheet.colChars.map((ch, i) => (
                // Data-driven column width (chars → px) → runtime value, not a static class.
                <col key={i} style={{ width: Math.min(320, Math.max(56, ch * 7 + 18)) }} />
              ))}
            </colgroup>
          )}
          <thead>
            <tr>
              <th className="fv-grid-corner" />
              {sheet.header.map((h) => (
                <th key={h} className="fv-grid-colhead">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {padTop > 0 && (
              <tr className="fv-spacer" aria-hidden>
                {/* runtime spacer height = off-screen rows above the window */}
                <td colSpan={sheet.header.length + 1} style={{ height: padTop }} />
              </tr>
            )}
            {visible.map((row) => (
              <tr
                key={row.num}
                className={
                  [
                    virtual ? "fv-row-fixed" : "",
                    // `row.num` is 1-based sheet numbering; the cut is a 0-based grid row.
                    cutRow != null && row.num - 1 >= cutRow ? "fv-row-unsent" : "",
                  ]
                    .filter(Boolean)
                    .join(" ") || undefined
                }
              >
                <th className="fv-grid-rowhead">{row.num}</th>
                {row.cells.map((cell, c) => {
                  if (cell === null) return null;
                  return (
                    <td
                      key={c}
                      className={`fv-grid-cell${cell.numeric ? " num" : ""}`}
                      rowSpan={cell.rowSpan}
                      colSpan={cell.colSpan}
                    >
                      {renderText(cell.text)}
                    </td>
                  );
                })}
              </tr>
            ))}
            {padBottom > 0 && (
              <tr className="fv-spacer" aria-hidden>
                {/* runtime spacer height = off-screen rows below the window */}
                <td colSpan={sheet.header.length + 1} style={{ height: padBottom }} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {cutRow != null && (
        <div className="fv-sheet-note fv-cut-note">
          {cutRow > 0
            ? `Envoi tronqué : seules les lignes 1 à ${cutRow} partent au modèle — les lignes grisées ne quittent jamais la machine (et n'ont donc pas besoin d'être redacted).`
            : "Envoi tronqué : ce fichier dépasse la limite d'envoi, aucune ligne ne part au modèle."}
        </div>
      )}
      {sheet.truncated && (
        <div className="fv-sheet-note">Aperçu tronqué ({MAX_ROWS} lignes × {MAX_COLS} colonnes max).</div>
      )}
    </div>
  );
}
