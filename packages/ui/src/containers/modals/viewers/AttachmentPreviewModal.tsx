import { useEffect, useMemo, useRef, useState } from "react";
import { hueForTone } from "@openmasq/redact";
import { ModalShell } from "../ModalShell";
import { RedactionInlineReveal } from "../../../components/message/RedactionInlineReveal";
import { useFeedbackOpen } from "../../providers/feedbackOpen";
import { redactionProblemDraft } from "../../../feedback/feedback";
import { ShieldIcon, RefreshIcon, XIcon } from "../../../components/brand";
import { FileSkeleton } from "./FileSkeleton";
import { useHost } from "../../../host";
import { base64ToBytes } from "../../../state/bytes";
import {
  useRedaction,
  useRedactEngine,
  describeRedactFailure,
} from "../../../send/redaction";
import { PdfRedactedViewer } from "./pdf/PdfRedactedViewer";
import { buildRevealMarks, buildTextHaloLayer } from "./pdf/pageLayers";
import { AttachmentSheetView } from "./AttachmentSheetView";
import { DocxViewer } from "./docx/DocxViewer";
import { PptxViewer } from "./pptx/PptxViewer";
import { Markdown } from "../../../components/markdown/Markdown";
import { DocText, buildDocChunks } from "./doc/DocText";
import { PreviewHeader } from "./PreviewHeader";
import { useDocSearch } from "./doc/useDocSearch";
import { useTextSelection } from "../../../hooks/useTextSelection";
import { useT } from "../../../i18n";
import { SelectionMenu } from "../../../components/SelectionMenu";
import { DocViewMenu, type DocView } from "./DocViewMenu";
import { previewShape, initialView, previewViews, redactedGridReady } from "./previewViews";
import { MAX_FILE_CHARS, clipFileText } from "../../../send/foldPayload";
import { sheetSendCutRow } from "./doc/sheetCut";
import { redactedFromReplacements } from "./doc/redactedPreview";
import { realFromRedactedSelection } from "./doc/docForce";
import { useDisplayReplacements } from "./doc/displayReplacements";
import { previewStatus } from "./doc/docSummary";
import { attachWordPicker, occursFlexibly } from "@openmasq/redact/pdf-redact";
import type { PdfReplacement } from "./pdf/pdfReplacements";

/**
 * Preview a not-yet-sent attachment (a composer file). PDFs render the real
 * document with believable fakes overlaid; spreadsheets (xlsx/ods/csv) render as
 * a grid and .docx as formatted HTML — from the granted on-disk path, or from the bytes
 * the renderer already holds when the file was dropped (see `hasBytes`). Every format also offers a "Redacted" text view (the pseudonymised
 * text that will leave the machine — with manual redaction by selection), so the
 * user can verify + hand-redact what leaves the machine. The views are picked from
 * the corner `DocViewMenu`, not a tab strip: the header keeps one row, the document
 * keeps the height. The definitive both-versions rich redacted view is the post-send
 * FileViewerModal. */
export function AttachmentPreviewModal({
  file,
  onClose,
  onRerun,
  stale,
  redacting,
  redactError,
  redactProgress,
  reveal,
  onRevealChange,
  onForceRedact,
  onAddToVault,
  onDeleteRedaction,
  inactiveCategories,
  convCategories,
}: {
  file: {
    name: string;
    text: string;
    chars: number;
    kind: string;
    mime?: string;
    redactPreview?: number;
    error?: string;
    /** Source path on disk (a NATIVE pick, granted by the read gate). */
    path?: string;
    /** ORIGINAL bytes held in memory (base64) — a DROP or a Bibliothèque re-attach has
     *  these and NO `path`. Either one is enough to render the file itself; see
     *  `hasBytes` for why gating on `path` alone was the bug. */
    data?: string;
    /** Pre-computed at attach time — the viewer reuses it (no re-run). */
    replacements?: PdfReplacement[];
    /** OCR word boxes (scans) → paint the redaction ON the image. */
    words?: { text: string; x0: number; y0: number; x1: number; y1: number; confidence?: number }[];
    /** Per-page OCR word geometry (scanned PDFs) → paint the redaction boxes on
     *  pages that have no text layer (see `PdfRedactedViewer.ocrPages`). */
    ocrPages?: import("@openmasq/redact/documents.browser").OcrLayerPage[];
    /** THE SECOND LAYER (always-OCR): what the page PIXELS say, when it differs from the
     *  text-layer `text` — the « Texte de l'image » view, so a discrepancy (hidden/altered
     *  text, OCR-only content) is visible before sending. */
    ocrText?: string;
  };
  onClose: () => void;
  /** Re-run this file's redaction (with the current engine). When present, the
   *  Redacted tab shows a "Reredact" button — useful after switching engine. */
  onRerun?: () => void;
  /** The file was redacted with a different engine than the one now selected. */
  stale?: boolean;
  /** Redaction is currently (re-)running for this file. */
  redacting?: boolean;
  /** FAILED drop-time pass (audit): the header + the views say so — not threaded,
   *  a failure used to read as "no value detected" under a shield. */
  redactError?: string;
  /** Chunk progress of the in-flight pass (the chip's bar) — shown in the subtitle. */
  redactProgress?: { done: number; total: number };
  /** REAL values the user chose to send IN CLEAR (per-value un-redact). Absent /
   *  no `onRevealChange` ⇒ the preview is display-only (no reveal affordance). */
  reveal?: string[];
  /** Toggle a value in/out of the reveal set (drives the SEND — see ChatView). */
  onRevealChange?: (reveal: string[]) => void;
  /** Manually redact a SELECTED zone AS a chosen type — the composer's "Redact"
   *  menu (exact selection + canonical token `NAME`/`EMAIL`/…). Absent ⇒ display-only. */
  onForceRedact?: (value: string, token: string) => void;
  /** DELETE a redaction element entirely (false positive): removed from the
   *  document's replacements — no mark, no tag, the value stays/leaves in clear. */
  onDeleteRedaction?: (value: string) => void;
  /** Add the selected value to the global COFFRE (always redacted, every conversation)
   *  AS a chosen type — enables the picker's Cette conversation / Coffre scope toggle.
   *  A Coffre pick ALSO force-redacted it in this document so the preview reflects it. */
  onAddToVault?: (value: string, token: string) => void;
  /** Labels of the redaction categories currently OFF (see `docCategoryNotice.ts`).
   *  Non-empty ⇒ the preview shows a coverage note: in a document, a category that is
   *  not detected is INVISIBLE (unlike the composer, where the user watches a value
   *  not get highlighted), so the "Redacted" tab must say what it is NOT covering. */
  inactiveCategories?: string[];
  /** The conversation's category override — threaded to the `redact()` fallback below
   *  (no `file.replacements`) so it matches "cette conversation", not the global default. */
  convCategories?: Record<string, boolean>;
}) {
  const host = useHost();
  // « Signaler un masquage incorrect » on a mark — the before-send preview is where
  // a bad DOCUMENT redaction is first visible.
  const { openFeedback } = useFeedbackOpen();
  // Body root for the hover-reveal delegation (same mechanism as chat bubbles) — it
  // watches every `[data-doc-reveal]` mark (text tab, spreadsheet cell, PDF box).
  const bodyRef = useRef<HTMLDivElement>(null);
  // Per-value reveal (send in clear). Editable only when `onRevealChange` is wired.
  const revealed = useMemo(() => new Set(reveal ?? []), [reveal]);
  // Jetons display: every DISPLAY consumer below (redacted text, DocText chunks, the
  // painted image/PDF boxes, the grid, the selection→real mapping) reads THIS list, so
  // they all show/map the same string. `file.replacements` itself — the drop-time map
  // the send reuses — is never substituted (wire keeps the pseudonyms).
  const displayReplacements = useDisplayReplacements(file.replacements);
  const toggleReveal = (real: string): void => {
    if (!onRevealChange) return;
    onRevealChange(revealed.has(real) ? [...revealed].filter((v) => v !== real) : [...revealed, real]);
  };
  // Manual "Redact" by selecting a zone of the ORIGINAL text (extracted / rendu
  // views) — the SAME data-type picker as the composer. Selecting inside the body
  // pops `SelectionMenu`; picking a type force-redacted the exact selection.
  const t = useT();
  const { sel, onMouseUp, clear } = useTextSelection(bodyRef);
  // Click-a-word on a CANVAS view (PDF page or scanned image): the clicked word +
  // the viewport anchor for the «Masquer “mot”» type picker. Dismissed by any
  // interaction outside the menu.
  const [wordPick, setWordPick] = useState<{ value: string; x: number; y: number } | null>(null);
  /** Drops the viewer's LOCKED pre-highlight when the picker closes (dismiss or pick). */
  const wordPickRelease = useRef<(() => void) | null>(null);
  const openWordPick = (value: string, x: number, y: number, release: () => void) => {
    wordPickRelease.current?.();
    wordPickRelease.current = release;
    setWordPick({ value, x, y });
  };
  const closeWordPick = () => {
    wordPickRelease.current?.();
    wordPickRelease.current = null;
    setWordPick(null);
  };
  const closeWordPickRef = useRef(closeWordPick);
  closeWordPickRef.current = closeWordPick;
  useEffect(() => {
    if (!wordPick) return;
    const away = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest?.("[data-sel-menu]")) closeWordPickRef.current();
    };
    document.addEventListener("mousedown", away, true);
    return () => document.removeEventListener("mousedown", away, true);
  }, [wordPick]);
  // Image-canvas pre-highlight layers (hover wash + locked pick) — %-positioned in
  // the wrapper so they track the displayed size.
  const imgWrapRef = useRef<HTMLDivElement>(null);
  const imageWords = useMemo(
    () => (file.words ?? []).map((w) => ({ str: w.text, left: w.x0, top: w.y0, w: w.x1 - w.x0, h: w.y1 - w.y0 })),
    [file.words],
  );
  /** The scanned image's NATURAL raster size (the OCR boxes' space) — set by the
   *  paint effect, read by the canvas click hit-test. */
  const imageNaturalRef = useRef<{ w: number; h: number } | null>(null);
  /** Reveal-marks for the image = the SAME builder as the PDF pages (rule 9; inspecting ≠ revealing). */
  const buildImageMarks = (boxes: Parameters<typeof buildRevealMarks>[1]) => {
    const wrap = imgWrapRef.current;
    const nat = imageNaturalRef.current;
    if (!wrap || !nat) return;
    buildRevealMarks(wrap, boxes, nat.w, nat.h, !!onRevealChange);
  };
  const redact = useRedaction();
  const engine = useRedactEngine();
  // WHAT this file can show, and which layer opens first — pure, in `previewViews.ts`.
  // ⚠️ `hasBytes` (path OR in-memory bytes), never `path`, is the gate; its header says why.
  const shape = previewShape(file);
  const { isPdf, isSheet, isCsv, isPptx, isImage, isRich, hasBytes, hasOcrLayer } = shape;
  const [view, setView] = useState<DocView>(initialView(shape, file));
  // The SECOND LAYER: OCR-recovered text that differs from the primary text layer (always-OCR).
  // Present ⇒ a « Texte de l'image » view lets the user compare the two before sending.
  const ocrLayer = (file.ocrText ?? "").trim();
  const ocrChunks = useMemo(
    () =>
      hasOcrLayer
        ? buildDocChunks({ view: "extrait", text: ocrLayer, revealed, editable: false, redactedText: null })
        : [],
    [hasOcrLayer, ocrLayer, revealed],
  );
  // Manual redaction is offered on the REDACTED text view (where the user reads what
  // will actually leave the machine and can catch a MISS) + the rendered-markdown
  // view — not the canvas/grid views (no text selection). A selection on the redacted
  // view is mapped back FAKE→REAL before forcing (`realFromRedactedSelection`), so the
  // real value is protected, never the placeholder. Editable ⇒ `onForceRedact`.
  const canForce = !!onForceRedact && (view === "redacted" || view === "rendu");
  const [redacted, setRedacted] = useState<string | null>(null);
  // A redaction failure (timeout / model error). Shown WITH a "Réessayer" button
  // instead of silently falling back to the original text (which would hide that
  // the redaction never ran).
  const [redactedErr, setRedactedErr] = useState<string | null>(null);
  // Real bytes from disk (composer files aren't in the DB yet) — for the PDF,
  // spreadsheet, docx rich renderers and the image preview.
  const [bytes, setBytes] = useState<Uint8Array | null | "error">(null);
  // Image preview canvas — drawn from a Blob (no blob: URL, so the CSP's img-src
  // restriction never applies), same approach as the post-send FileViewerModal.
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // The REDACTED grid of a spreadsheet, when possible — `previewViews.ts` says why.
  const redactedGrid = redactedGridReady(isSheet && !!bytes && bytes !== "error", !!displayReplacements);
  // The send CUT, mapped onto the grid's ROWS — the why (and the
  // generic XLSX note, for lack of a safe mapping): `doc/sheetCut.ts`.
  const sheetCutRow = useMemo(
    () => sheetSendCutRow(file.name, file.text.length, bytes, isCsv),
    [file.name, file.text.length, bytes, isCsv],
  );
  const sheet = (redacted: boolean) => (
    <AttachmentSheetView
      bytes={bytes as Uint8Array} csv={isCsv} redacted={redacted}
      replacements={displayReplacements} revealed={revealed}
      onReveal={onRevealChange ? toggleReveal : undefined}
      cutRow={redacted ? sheetCutRow : null} wireCut={redacted && !isCsv && file.text.length > MAX_FILE_CHARS}
    />
  );

  useEffect(() => {
    if (!(isPdf || isRich || isImage) || !hasBytes) return;
    let alive = true;
    // No path ⇒ the bytes we already hold (a drop / re-attach never has one).
    if (!file.path) {
      try {
        setBytes(base64ToBytes(file.data!));
      } catch {
        setBytes("error");
      }
      return;
    }
    const read = host.files?.read;
    if (!read) {
      setBytes("error");
      return;
    }
    read(file.path)
      .then((b) => alive && setBytes(b as Uint8Array))
      .catch(() => alive && setBytes("error"));
    return () => {
      alive = false;
    };
  }, [isPdf, isRich, isImage, file.path, file.data, hasBytes, host]);

  // Paint the image onto the canvas once its bytes are in and the tab is shown.
  // For a SCAN with OCR word boxes + a redaction map, paint the REDACTED image
  // (`renderRedactedImage` — fakes over the real glyphs); else the raw image.
  useEffect(() => {
    if (view !== "image" || !bytes || bytes === "error") return;
    const cv = canvasRef.current;
    if (!cv) return;
    let alive = true;
    const paint = (src: HTMLCanvasElement | ImageBitmap) => {
      if (!alive) return;
      imageNaturalRef.current = { w: src.width, h: src.height };
      const max = 760;
      const scale = Math.min(1, max / src.width, max / src.height);
      cv.width = Math.round(src.width * scale);
      cv.height = Math.round(src.height * scale);
      cv.getContext("2d")?.drawImage(src, 0, 0, cv.width, cv.height);
    };
    let detachPicker: (() => void) | null = null;
    (async () => {
      if (file.words?.length && file.replacements?.length) {
        try {
          const { renderRedactedImage } = await import("@openmasq/redact/image-redact");
          const { canvas, boxes } = await renderRedactedImage({
            bytes: bytes as Uint8Array,
            words: file.words,
            replacements: displayReplacements ?? [],
            reveal: revealed,
          });
          paint(canvas);
          if (alive) buildImageMarks(boxes);
          return;
        } catch {
          /* fall through to the raw image so the preview still shows something */
        }
      }
      paint(await createImageBitmap(new Blob([bytes as BlobPart], { type: file.mime || "" })));
      if (alive) buildImageMarks([]);
    })()
      .then(() => {
        const wrap = imgWrapRef.current;
        const cv = canvasRef.current;
        const nat = imageNaturalRef.current;
        if (!alive || !wrap || !nat) return;
        // Halo over the zones the OCR READ — same semantics as the PDF pages.
        if (imageWords.length) buildTextHaloLayer(wrap, imageWords, nat.w, nat.h, true, t);
        // Word-processor-style pick over the scan (same shared core as the PDF
        // pages): raster-space words, natural dims as the coordinate space.
        if (!cv || !onForceRedact || !imageWords.length) return;
        detachPicker = attachWordPicker({
          container: wrap,
          canvas: cv,
          words: imageWords,
          space: { w: nat.w, h: nat.h },
          ignore: ".pdfv-mark",
          onPick: openWordPick,
        });
      })
      .catch(() => {});
    return () => {
      alive = false;
      detachPicker?.();
    };
  }, [view, bytes, file.mime, file.words, displayReplacements, revealed, imageWords, onForceRedact]);

  // The send CUT, made concrete: « Masqué » stops WHERE the send truncates — the SAME
  // cut (`clipFileText`, line boundary, rule 9), so the last line shown
  // is WHOLE, never a sliced value. Original / Texte de l'image stay whole.
  const wireText = clipFileText(file.text, MAX_FILE_CHARS);
  const wireCutChars = file.text.length - wireText.length;

  // The redacted text WITHOUT re-running the model — the rule (longest first, word
  // boundaries, null = async fallback) lives in `doc/redactedPreview.ts`.
  const redactedPreview = useMemo(
    () => redactedFromReplacements(wireText, displayReplacements),
    [wireText, displayReplacements],
  );

  // Compute the redacted text preview lazily the first time it's shown (ONLY when
  // there are no precomputed replacements). On a failure we record the error (NOT
  // the original text) so the tab can offer a retry; `redactedErr` also gates the
  // effect so it doesn't loop on the null.
  useEffect(() => {
    if (redactedPreview !== null) return; // deterministic path — no re-run
    if (view !== "redacted" || redacted !== null || redactedErr !== null || !file.text) return;
    // Drop pass in progress → no 2nd concurrent detection (audit): its
    // `replacements` arrive and take precedence. And bounded to the send cut
    // (`wireText`) — this path used to run on the whole text, freezing the renderer.
    if (redacting) return;
    let alive = true;
    redact(wireText, undefined, undefined, convCategories)
      .then((r) => alive && setRedacted(r.text))
      .catch((e) => {
        if (!alive) return;
        setRedactedErr(describeRedactFailure(e instanceof Error ? e.message : String(e), engine));
      });
    return () => {
      alive = false;
    };
  }, [view, redacted, redactedErr, wireText, file.text, redact, engine, redactedPreview, convCategories, redacting]);

  // "Réessayer le redaction": clear both → the effect re-runs on the same text.
  const retryRedacted = () => {
    setRedactedErr(null);
    setRedacted(null);
  };

  // Find-in-document over the text tabs. The chunks feed BOTH the match counter and
  // the highlighter (DocText), so their numbering agrees; empty on non-text tabs.
  // TEXT only when it is not the sheet grid: the search bar highlights `DocText` chunks.
  const textView = view === "redacted" && !redactedGrid;
  const chunks = useMemo(
    () =>
      textView && wireText
        ? buildDocChunks({
            view: "redacted",
            text: wireText,
            replacements: displayReplacements,
            revealed,
            editable: !!onRevealChange,
            redactedText: redactedPreview ?? redacted,
          })
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [textView, view, wireText, displayReplacements, revealed, onRevealChange, redactedPreview, redacted],
  );
  const search = useDocSearch(chunks);
  // The header row, with THREE top-level states (in progress / failed / count
  // PROVEN) — the why lives on `previewStatus` (doc/docSummary.ts), tested.
  const status = useMemo(
    () => previewStatus({ redacting, redactProgress, redactError, replacements: file.replacements }, t),
    [redacting, redactProgress, redactError, file.replacements, t],
  );

  const views = previewViews(shape, file, t);

  // Search + re-redact keep a slim row of their own, and ONLY when one of them has
  // something to say — an empty toolbar would give back the row the tabs just freed.
  const searchBar = textView && !!file.text && !(view === "redacted" && redactedErr);
  // Only when there is a REASON to re-run: the file was redacted with settings that have
  // since changed. It used to sit on the redacted view permanently, competing with the
  // stale hint that carries the actual signal. A failed redaction has its own retry
  // button in the fallback below.
  const rerunBar = !!(onRerun && stale);

  return (
    <ModalShell onClose={onClose} width="min(1200px, 94vw)" maxHeight="90vh">
      <div className="fv-corner">
        {views.length > 1 && <DocViewMenu views={views} view={view} onPick={setView} />}
        <button type="button" className="fv-close fv-close-x" onClick={onClose} title={t.viewers.closeTip} aria-label={t.viewers.close}>
          <XIcon size={18} />
        </button>
      </div>
      <PreviewHeader
        name={file.name}
        chars={file.chars}
        status={status}
        search={search}
        showSearch={searchBar}
        showRerun={rerunBar}
        redacting={redacting}
        onRerun={onRerun}
      />

      <div
        className="fv-body fv-body-stable"
        ref={bodyRef}
        onMouseUp={canForce ? onMouseUp : undefined}
      >
        {/* Coverage disclosure — on EVERY tab, because the trap is precisely that the
            "Redacted" label + the counter read as exhaustive while the OFF categories'
            values (names, addresses…) sit in the text in clear. */}
        {/* …but NOT on the Original layer, where nothing is redacted by definition — the
            warning is about what the redacted views do and don't cover. */}
        {!!inactiveCategories?.length && view !== "original" && (
          <div className="fv-coverage-note" role="note">
            <ShieldIcon size={12} />
            {/* Cap the list — burying « noms » under eight labels defeats the warning.
                Catalog order puts the identity categories first, so the cut keeps the
                ones that matter most in a document. */}
            <span className="flex-min">
              Non redacted ici&nbsp;: {inactiveCategories.slice(0, 5).join(", ").toLowerCase()}
              {inactiveCategories.length > 5
                ? ` et ${inactiveCategories.length - 5} autres catégories désactivées`
                : " — catégories désactivées"}
              .
            </span>
            {/* No « Activer » shortcut: it opened the redaction-engine modal, which
                carried no category toggles — the promise the button made was one the
                destination could not keep. The categories live in Réglages →
                Confidentialité, which a viewer leaf must not import up into (rule 9). */}
          </div>
        )}
        {/* FAILED pass: every view says so — otherwise « Pages masquées » painted with
            nothing masked. The send is already blocked (`submit()`): display, not a leak. */}
        {!!redactError && !redacting && (
          <div className="fv-redact-fail" role="alert">
            <ShieldIcon size={12} />
            <span className="flex-min">
              {"Le redaction de ce document a échoué — rien n'est masqué dans ces vues, et l'envoi est bloqué tant qu'il n'a pas réussi."}
            </span>
            {onRerun && (
              <button className="btn-ghost btn-inline" onClick={onRerun}>
                <RefreshIcon size={13} /> Réessayer
              </button>
            )}
          </div>
        )}
        {onRevealChange && revealed.size > 0 && (
          /* One TAG per revealed value — the SAME bare chips row as the composer
             (no banner box around it): tone by category, «↺» to re-redact
             that value. Replaces the old counting banner. */
          <div className="detect-chips fv-reveal-chips">
            {[...revealed].map((value) => {
              // A replacement's `tone` IS a hue now (one vocabulary), but it may have been
              // persisted before that — `hueForTone` guards an unknown name rather than
              // letting `hl-<junk>` render an uncoloured chip.
              const hue = hueForTone(
                file.replacements?.find((r) => r.real === value)?.tone ?? "amber",
              );
              return (
                <button
                  key={value}
                  type="button"
                  className={`detect-chip hl-${hue} kept`}
                  title={t.viewers.keptClearTip}
                  onClick={() => toggleReveal(value)}
                >
                  <ShieldIcon size={11} />
                  <span className="detect-chip-val">{value}</span>
                  <span className="detect-chip-x">↺</span>
                </button>
              );
            })}
            {revealed.size > 1 && (
              <button className="btn-ghost btn-inline" onClick={() => onRevealChange([])}>
                {t.viewers.reRedactAll}
              </button>
            )}
          </div>
        )}
        {/* An OCR error (no text recovered) must NOT hide the image itself — the
            picture is still viewable; the error only concerns text extraction. */}
        {file.error && view !== "image" ? (
          <div className="fv-status">{file.error}</div>
        ) : view === "pdf" || view === "rich" || view === "image" ? (
          bytes === null ? (
            <FileSkeleton variant={isImage ? "image" : isSheet ? "sheet" : "doc"} />
          ) : bytes === "error" ? (
            <div className="fv-status">{t.viewers.unreadableFile}</div>
          ) : view === "image" ? (
            <div className="fv-image">
              <div className="fv-imgwrap" ref={imgWrapRef}>
                <canvas ref={canvasRef} />
              </div>
            </div>
          ) : view === "pdf" ? (
            <PdfRedactedViewer
              bytes={bytes}
              replacements={displayReplacements}
              ocrPages={file.ocrPages}
              showTextHalo
              onWordPick={onForceRedact ? openWordPick : undefined}
              revealed={revealed}
              onReveal={onRevealChange ? toggleReveal : undefined}
            />
          ) : isSheet ? (
            sheet(false)
          ) : isPptx ? (
            <PptxViewer bytes={bytes} />
          ) : (
            <DocxViewer bytes={bytes} />
          )
        ) : view === "ocr" ? (
          // THE SECOND LAYER — the OCR-recovered text (always-OCR), read-only, so the user
          // can compare it against the primary text layer (spot hidden/altered text or
          // OCR-only content baked into a page image). No reveal/force here: it's a
          // reference view of what the pixels say, not the wire-affecting redacted layer.
          <DocText chunks={ocrChunks} query="" active={-1} activeRef={bodyRef} />
        ) : view === "original" ? (
          // Deliberately inert: no marks, no reveal, no manual redaction — this layer is
          // the reference to READ against, and the gestures live on the redacted one.
          <DocText chunks={[{ text: file.text }]} query="" active={-1} activeRef={bodyRef} />
        ) : view === "rendu" ? (
          <div className="fv-md">
            <Markdown content={file.text} />
          </div>
        ) : view === "redacted" && redactedErr ? (
          <div className="fv-fallback">
            <ShieldIcon size={22} />
            <p>{redactedErr}</p>
            <button className="btn-primary btn-inline" onClick={retryRedacted}>
              <RefreshIcon size={14} /> Réessayer le redaction
            </button>
          </div>
        ) : redactedGrid ? (
          sheet(true)
        ) : file.text && redactedPreview === null && redacted === null ? (
          // Not yet computable (pass/fallback in flight): skeleton — never sneak in the original.
          <FileSkeleton variant="doc" />
        ) : file.text ? (
          // "Redacted" — the redacted document text with in-document search
          // highlights, plus the clickable per-value reveal marks on the redacted view.
          <>
            <DocText
              chunks={chunks}
              query={search.query}
              active={search.active}
              activeRef={search.activeRef}
              onToggleReveal={onRevealChange ? toggleReveal : undefined}
            />
            {wireCutChars > 0 && (
              <div className="fv-truncnote" role="note">
                <ShieldIcon size={12} />
                {`Coupé ici — la suite (${wireCutChars.toLocaleString()} caractères) ne quitte pas la machine : l'envoi tronque chaque document à ${MAX_FILE_CHARS.toLocaleString()} caractères.`}
              </div>
            )}
          </>
        ) : (
          <div className="fv-status">
            {t.viewers.noTextExtracted}
          </div>
        )}
      </div>

      {/* Discoverability hints for the manual "Redact" affordance, as a slim BOTTOM
          bar so they never eat the document's height. On the selectable text views:
          select-to-redact; on the canvas/grid views (no selection possible): point
          to the "Redacted" text view to hand-redact a value the detector missed. */}
      {canForce ? (
        <div className="fv-footbar" role="note">
          <ShieldIcon size={12} /> {t.viewers.selectToRedact}
        </div>
      ) : !!onForceRedact && !!file.text && (view === "pdf" || view === "rich" || view === "image") ? (
        <div className="fv-footbar" role="note">
          <ShieldIcon size={12} />
          <span>
            {t.viewers.missedValueLead}
            <button type="button" className="fv-hint-link" onClick={() => setView("redacted")}>
              {t.docViews.redacted}
            </button>
            {t.viewers.missedValueTail}
          </span>
        </div>
      ) : null}

      {/* Hover-reveal strip — SAME component as the chat bubbles. Here the marks show
          the FAKE, so the strip shows the REAL value that would be sent in clear, in
          the value's tone, with a × to toggle it in/out of the reveal set. Only wired
          when the preview is editable (before send). */}
      {onRevealChange && (
        <RedactionInlineReveal
          containerRef={bodyRef}
          // One floating surface at a time: the selection / word-pick menu wins.
          suppressed={!!sel || !!wordPick}
          selector="[data-doc-reveal]"
          show="real"
          valueTitle="Valeur réelle — envoyée en clair si gardée"
          revealTitle="Garder en clair (ne PAS redact) — envoyé tel quel au modèle"
          reRedactTitle="Re-redact cette valeur"
          revealed={revealed}
          onReveal={(real) => toggleReveal(real)}
          onReRedact={(real) => toggleReveal(real)}
          onDelete={onDeleteRedaction}
          onReport={openFeedback ? (kind) => openFeedback(redactionProblemDraft("document", t, kind)) : undefined}
        />
      )}

      {/* Manual "Redact" menu over a text selection — the SAME data-type picker as
          the composer. Picking force-redacted the exact selection AS that type. */}
      {/* Click-a-word picker (canvas views): opens DIRECTLY on the type grid,
          titled with the clicked word. The canvas shows the ORIGINAL glyphs outside
          the marks (marks are guarded off), so the clicked word IS the real value. */}
      {wordPick && onForceRedact && (
        <SelectionMenu
          x={wordPick.x} y={wordPick.y}
          onClose={closeWordPick} /* Escape — the outside click lives in the `away` effect above */
          origin="document" /* telemetry distinguishes the attachment from a chat selection */ expanded
          label={`Redact « ${
            wordPick.value.length > 42 ? `${wordPick.value.slice(0, 40)}…` : wordPick.value
          } »`}
          note={
            // A run absent from the PRIMARY text is image-baked (logo, stamp):
            // it is NOT part of the text sent to the model. Redact stays
            // useful (paints onto the image if the document leaves as pixels) — inform,
            // don't forbid.
            occursFlexibly(file.text ?? "", wordPick.value)
              ? undefined
              : "Zone d'image (logo/scan), absente du texte envoyé : la redact ne sert que si le document part en images."
          }
          onPick={(token) => {
            onForceRedact(wordPick.value, token);
            closeWordPick();
          }}
          onVault={
            onAddToVault
              ? (token) => {
                  onAddToVault(wordPick.value, token);
                  onForceRedact(wordPick.value, token);
                  closeWordPick();
                }
              : undefined
          }
        />
      )}
      {canForce && sel && onForceRedact && (
        <SelectionMenu
          x={sel.x}
          y={sel.y}
          onPick={(token) => {
            // On the redacted view the selection may be a FAKE — force-redact the REAL
            // value it stands for (a miss selected in clear maps to itself). The rendu
            // view is the original text, so its selection is already the real value.
            const value =
              view === "redacted"
                ? realFromRedactedSelection(sel.text, displayReplacements)
                : sel.text;
            onForceRedact(value, token);
            clear();
            window.getSelection()?.removeAllRanges();
          }}
          onVault={
            onAddToVault
              ? (token) => {
                  const value =
                    view === "redacted"
                      ? realFromRedactedSelection(sel.text, displayReplacements)
                      : sel.text;
                  // Global protection + still force it in THIS document so the preview
                  // shows it faked immediately (Coffre = superset of "this conversation").
                  onAddToVault(value, token);
                  onForceRedact(value, token);
                  clear();
                  window.getSelection()?.removeAllRanges();
                }
              : undefined
          }
        />
      )}
    </ModalShell>
  );
}
