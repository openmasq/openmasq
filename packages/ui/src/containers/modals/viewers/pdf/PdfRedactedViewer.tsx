import { useMemo, useState, type CSSProperties } from "react";
import { vaultReplacements, type PdfReplacement } from "@openmasq/redact/pdf-redact";
import { useDisplayReplacements } from "../doc/displayReplacements";
import { FileSkeleton } from "../FileSkeleton";
import { imageSourceNote } from "./pageLayers";
import { usePdfThumbs } from "./usePdfThumbs";
import { PageStrip, type StripPage } from "./PageStrip";
import type { PendingPdf } from "./pendingPages";
import { usePageNav } from "./usePageNav";
import { usePdfPages } from "./usePdfPages";
import { useT } from "../../../../i18n";

/**
 * PDF preview: thin React shell over the SHARED `loadRedactedPdf`
 * (@openmasq/redact/pdf-redact) — the same pixel-paint core the extension reuses, so the
 * redaction-render logic lives in ONE place. The pages, their lazy paint and their repaint
 * are `usePdfPages`; the page strip and the arrow keys are `PageStrip` + `usePageNav`.
 * VIEWER-ONLY: input bytes are read once, never modified/persisted.
 *
 * `pending`: the document is still being read or masked. The SAME viewer then shows each
 * page only once it is masked (its thumbnail until then), marked provisional, and simply
 * becomes final when `pending` goes — no reload, no swap.
 */
export function PdfRedactedViewer({
  bytes,
  redacted = true,
  replacements,
  ocrPages,
  showTextHalo,
  vault,
  kinds,
  revealed,
  onReveal,
  onWordPick,
  pending,
}: {
  bytes: Uint8Array;
  /** false → render the ORIGINAL document as-is (no fakes, no highlights). */
  redacted?: boolean;
  /** Pre-computed real→fake map (from attach). When set, no model call here. */
  replacements?: PdfReplacement[];
  /** Per-page OCR word geometry from the extraction (`ExtractedFile.ocrPages`) —
   *  the SCANNED-page fallback: without it a scan renders with ZERO redaction
   *  boxes (no pdf.js text layer to correlate on) even though OCR succeeded. */
  ocrPages?: import("@openmasq/redact/pdf-redact").RenderRedactedPdfOptions["ocrPages"];
  /** Light halo over the zones where TEXT was read (text layer + OCR words) — which,
   *  redacted, goes to the model; the rest of the page wasn't read. */
  showTextHalo?: boolean;
  /** Conversation vault (fake→original) of an already-sent file. When set (and no
   *  explicit `replacements`), the redacted overlay is rebuilt from it — EXACTLY
   *  the fakes that were sent, instantly, with no model call. See `vaultReplacements`. */
  vault?: Record<string, string>;
  /** Conversation kinds (original→category) for the vault path's tones. */
  kinds?: Record<string, string>;
  /** REAL values the user revealed (kept in clear). Absent ⇒ everything redacted. */
  revealed?: ReadonlySet<string>;
  /** Click a redacted region → toggle its real value in/out of the reveal set. */
  onReveal?: (real: string) => void;
  /** Click a WORD of the canvas (outside the redacted marks) → the consumer opens its
   *  «Masquer “mot”» type picker; the word stays highlighted until `release`. */
  onWordPick?: (value: string, x: number, y: number, release: () => void) => void;
  /** The masking is not over (`pendingPages.ts`): its map so far replaces `replacements`. */
  pending?: PendingPdf;
}) {
  const t = useT();
  // Prefer explicit replacements; else derive them from the conversation vault
  // (deterministic, matches the wire). Only fall back to a live model call when
  // neither exists (e.g. the Library viewer, with no conversation context).
  const resolved = useMemo<PdfReplacement[] | undefined>(() => {
    if (pending) return pending.replacements;
    if (replacements) return replacements;
    if (vault && Object.keys(vault).length) return vaultReplacements(vault, kinds);
    return undefined;
  }, [pending, replacements, vault, kinds]);
  // Jetons display: the painted boxes show `[PERSON1]` instead of the fake when the
  // setting is on — idempotent, so every entry path lands on the same rendering.
  const effective = useDisplayReplacements(resolved);
  const pages = usePdfPages({ bytes, redacted, replacements: effective, ocrPages, pending, showTextHalo, revealed, onReveal, onWordPick, t });
  const nav = usePageNav(pages.shellsRef, pages.total);
  // Once final, the strip previews each page — painted small and MASKED (`usePdfThumbs`).
  const thumbs = usePdfThumbs({
    docRef: pages.docRef,
    ready: pages.state === "ready",
    total: pages.total,
    final: !pending,
    replacements: effective,
    ocrPages,
  });
  // Loupe: page width = FIT-to-panel width × zoom (1 = adjusted to the panel).
  // CSS-only (a custom property) so changing it never re-runs the heavy render.
  const [zoom, setZoom] = useState(1);
  const strip = useMemo<StripPage[]>(
    () =>
      Array.from({ length: pages.total }, (_, i) => {
        const p = pending?.pages.length === pages.total ? pending.pages[i] : undefined;
        const thumb = pending ? p?.thumb : thumbs[i];
        return { n: i + 1, state: pending ? (p?.state ?? "waiting") : "masked", ...(thumb ? { thumb } : {}) };
      }),
    [pages.total, pending, thumbs],
  );
  const ready = pages.state === "ready";
  const note = ready ? imageSourceNote(pages.imgSrc.zones, pages.imgSrc.pages, t) : null;

  return (
    <div className="pdfv">
      {pages.warn && (
        <div className="pdfv-warn">
          {/* No settings shortcut: the engine is always the on-device NER, which the
              user cannot reconfigure, so the failure is stated and nothing is promised. */}
          <span className="flex-min">{pages.warn}</span>
        </div>
      )}
      {pending && (
        <div className="fv-status is-partial" role="status">
          {t.viewers.pdf.provisional}
        </div>
      )}
      {note && (
        <div className="pdfv-imgnote" role="note">
          <span className="pdfv-imgnote-key" aria-hidden="true" />
          <span className="flex-min">{note}</span>
        </div>
      )}
      {pages.state === "loading" && (
        <div className="pdfv-loading">
          {/* The kit's ONE loading visual: the content-shaped shimmer, same as every
              other stage of the file path. Closing the panel aborts. */}
          <FileSkeleton variant="doc" />
        </div>
      )}
      {pages.state === "error" && <div className="fv-status">{t.viewers.pdf.unavailable}</div>}
      {ready && pages.empty && <div className="fv-status">{t.viewers.pdf.noPages}</div>}
      {/* The pages, CENTRED, with their column on the right: zoom, then one tile per page. A
          side column and not a top bar — a bar of thumbnails took the height the pages need.
          The page root is ALWAYS mounted: the pages are painted into it while it loads. */}
      <div className="pdfv-main">
        <div
          ref={pages.rootRef}
          className={`pdfv-pages${zoom !== 1 ? " zoomed" : ""}`}
          // Runtime-computed zoom factor — the sanctioned inline-style case.
          style={{ "--pdf-zoom": zoom } as CSSProperties}
        />
        {ready && !pages.empty && (
          <aside className="pdfv-side">
            <div className="pdfv-zoom" role="group" aria-label={t.viewers.pdf.zoomGroup}>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.5, Math.round((z / 1.25) * 100) / 100))}
                aria-label={t.viewers.pdf.zoomOut}
                title={t.viewers.pdf.zoomOut}
              >
                −
              </button>
              <button type="button" className="pdfv-zoom-fit" onClick={() => setZoom(1)} title={t.viewers.pdf.fitWidth}>
                {Math.round(zoom * 100)} %
              </button>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(3, Math.round(z * 1.25 * 100) / 100))}
                aria-label={t.viewers.pdf.zoomIn}
                title={t.viewers.pdf.zoomIn}
              >
                +
              </button>
            </div>
            {pages.total > 1 && <PageStrip pages={strip} current={nav.current} final={!pending} onPick={nav.go} />}
          </aside>
        )}
      </div>
    </div>
  );
}
