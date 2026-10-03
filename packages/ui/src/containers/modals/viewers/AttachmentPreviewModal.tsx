import { useMemo, useRef, useState } from "react";
import { ModalShell } from "../ModalShell";
import { RedactionInlineReveal } from "../../../components/message/RedactionInlineReveal";
import { useFeedbackOpen } from "../../providers/feedbackOpen";
import { redactionProblemDraft } from "../../../feedback/feedback";
import { ShieldIcon, RefreshIcon, XIcon } from "../../../components/brand";
import { FileSkeleton } from "./FileSkeleton";
import { PdfRedactedViewer } from "./pdf/PdfRedactedViewer";
import { AttachmentSheetView } from "./AttachmentSheetView";
import { DocxViewer } from "./docx/DocxViewer";
import { PptxViewer } from "./pptx/PptxViewer";
import { Markdown } from "../../../components/markdown/Markdown";
import { DocText, buildDocChunks } from "./doc/DocText";
import { PreviewHeader } from "./PreviewHeader";
import { useDocSearch } from "./doc/useDocSearch";
import { useTextSelection } from "../../../hooks/useTextSelection";
import { useT } from "../../../i18n";
import { DocViewMenu, type DocView } from "./DocViewMenu";
import { previewShape, initialView, previewViews, redactedGridReady } from "./previewViews";
import { redactedFromReplacements } from "./doc/redactedPreview";
import { useDisplayReplacements } from "./doc/displayReplacements";
import { previewStatus } from "./doc/docSummary";
import type { AttachmentPreviewProps } from "./attachmentPreview/types";
import { usePreviewBytes } from "./attachmentPreview/usePreviewBytes";
import { useWordPick } from "./attachmentPreview/useWordPick";
import { useImageCanvas } from "./attachmentPreview/useImageCanvas";
import { useRedactedFallback } from "./attachmentPreview/useRedactedFallback";
import { PreviewNotes } from "./attachmentPreview/PreviewNotes";
import { PreviewMenus } from "./attachmentPreview/PreviewMenus";
import { PreviewFootbar } from "./attachmentPreview/PreviewFootbar";

/**
 * Preview a not-yet-sent attachment (a composer file). PDFs render the real document with
 * believable fakes overlaid; spreadsheets (xlsx/ods/csv) render as a grid and .docx as
 * formatted HTML — from the granted on-disk path, or from the bytes the renderer already
 * holds when the file was dropped (`hasBytes`). Every format also offers a « Masqué » text
 * view (what will leave the machine — with manual redaction by selection). The views are
 * picked from the corner `DocViewMenu`. The definitive both-versions view is the post-send
 * FileViewerModal. Effects and parts live in `attachmentPreview/`.
 *
 * `pending`: a PDF still being read or masked. Only its pages view exists then, each page
 * shown once masked (`PdfRedactedViewer`), display-only; the same instance becomes final
 * when the masking lands.
 */
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
  continued,
  pending,
}: AttachmentPreviewProps) {
  // « Signaler un masquage incorrect » on a mark — the before-send preview is where
  // a bad DOCUMENT redaction is first visible.
  const { openFeedback } = useFeedbackOpen();
  // Body root for the hover-reveal delegation — every `[data-doc-reveal]` mark.
  const bodyRef = useRef<HTMLDivElement>(null);
  const revealed = useMemo(() => new Set(reveal ?? []), [reveal]);
  // Jetons display: every DISPLAY consumer reads THIS list; `file.replacements` itself —
  // the map the send reuses — is never substituted (wire keeps the pseudonyms).
  const displayReplacements = useDisplayReplacements(file.replacements);
  const toggleReveal = (real: string): void => {
    if (!onRevealChange) return;
    onRevealChange(revealed.has(real) ? [...revealed].filter((v) => v !== real) : [...revealed, real]);
  };
  const t = useT();
  const { sel, onMouseUp, clear } = useTextSelection(bodyRef);
  const pick = useWordPick();
  // WHAT this file can show, and which layer opens first — pure, in `previewViews.ts`.
  // ⚠️ `hasBytes` (path OR in-memory bytes), never `path`, is the gate.
  const shape = previewShape(file);
  const { isPdf, isSheet, isCsv, isPptx, isImage, isRich, hasBytes, hasOcrLayer } = shape;
  const [view, setView] = useState<DocView>(initialView(shape, file));
  const ocrLayer = (file.ocrText ?? "").trim();
  const ocrChunks = useMemo(
    () => (hasOcrLayer ? buildDocChunks({ view: "extrait", text: ocrLayer, revealed, editable: false, redactedText: null }) : []),
    [hasOcrLayer, ocrLayer, revealed],
  );
  // Manual redaction on the REDACTED text view (a selection there is mapped FAKE→REAL) and
  // the rendered-markdown view — not the canvas/grid views.
  const canForce = !!onForceRedact && (view === "redacted" || view === "rendu");
  const bytes = usePreviewBytes(file, (isPdf || isRich || isImage) && hasBytes);
  const image = useImageCanvas({
    active: view === "image",
    bytes,
    mime: file.mime,
    words: file.words,
    replacements: file.replacements,
    displayReplacements,
    revealed,
    editableReveal: !!onRevealChange,
    onForceRedact,
    openWordPick: pick.open,
    t,
  });
  // The REDACTED grid of a spreadsheet, when possible — `previewViews.ts` says why.
  const redactedGrid = redactedGridReady(isSheet && !!bytes && bytes !== "error", !!displayReplacements);
  const sheet = (redactedSheet: boolean) => (
    <AttachmentSheetView
      bytes={bytes as Uint8Array} csv={isCsv} redacted={redactedSheet}
      replacements={displayReplacements} revealed={revealed}
      onReveal={onRevealChange ? toggleReveal : undefined}
    />
  );
  // « Masqué » is the WHOLE text, as the send carries it (a document leaves whole).
  const wireText = file.text;
  // The redacted text WITHOUT re-running the model (`doc/redactedPreview.ts`).
  const redactedPreview = useMemo(() => redactedFromReplacements(wireText, displayReplacements), [wireText, displayReplacements]);
  const fallback = useRedactedFallback({ shown: view === "redacted", text: wireText, redactedPreview, redacting, convCategories, t });
  // Find-in-document over the text tabs: the chunks feed BOTH the counter and DocText.
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
            redactedText: redactedPreview ?? fallback.redacted,
          })
        : [],
    [textView, wireText, displayReplacements, revealed, onRevealChange, redactedPreview, fallback.redacted],
  );
  const search = useDocSearch(chunks);
  // The header's three states (in progress / failed / count PROVEN) — `doc/docSummary.ts`.
  const status = useMemo(
    () => previewStatus({ redacting, redactProgress, redactError, replacements: file.replacements }, t),
    [redacting, redactProgress, redactError, file.replacements, t],
  );
  // Pending: the pages are the only view — the text layers do not exist yet.
  const views = pending ? [] : previewViews(shape, file, t);
  const shownView: DocView = pending ? "pdf" : view;
  const searchBar = textView && !!file.text && !(view === "redacted" && fallback.redactedErr);
  // Only when there is a REASON to re-run: the file was redacted under changed settings.
  const rerunBar = !!(onRerun && stale);
  const canvas = shownView === "pdf" || shownView === "rich" || shownView === "image";

  return (
    <ModalShell onClose={onClose} width="min(1200px, 94vw)" maxHeight="90vh" continued={continued}>
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
        progress={pending?.progress}
      />
      <div className="fv-body fv-body-stable" ref={bodyRef} onMouseUp={canForce ? onMouseUp : undefined}>
        <PreviewNotes
          inactiveCategories={inactiveCategories}
          original={view === "original"}
          redactError={redactError}
          redacting={redacting}
          onRerun={onRerun}
          revealed={revealed}
          replacements={file.replacements}
          onRevealChange={onRevealChange}
          toggleReveal={toggleReveal}
        />
        {/* An OCR error (no text recovered) must NOT hide the image itself. */}
        {file.error && shownView !== "image" ? (
          <div className="fv-status">{file.error}</div>
        ) : canvas ? (
          bytes === null ? (
            <FileSkeleton variant={isImage ? "image" : isSheet ? "sheet" : "doc"} />
          ) : bytes === "error" ? (
            <div className="fv-status">{t.viewers.unreadableFile}</div>
          ) : shownView === "image" ? (
            <div className="fv-image">
              <div className="fv-imgwrap" ref={image.imgWrapRef}>
                <canvas ref={image.canvasRef} />
              </div>
            </div>
          ) : shownView === "pdf" ? (
            <PdfRedactedViewer
              bytes={bytes}
              replacements={displayReplacements}
              ocrPages={file.ocrPages}
              showTextHalo
              onWordPick={onForceRedact ? pick.open : undefined}
              revealed={revealed}
              onReveal={onRevealChange ? toggleReveal : undefined}
              pending={pending?.pdf}
            />
          ) : isSheet ? (
            sheet(false)
          ) : isPptx ? (
            <PptxViewer bytes={bytes} />
          ) : (
            <DocxViewer bytes={bytes} />
          )
        ) : view === "ocr" ? (
          // THE SECOND LAYER — what the pixels say, read-only: a reference, not the wire.
          <DocText chunks={ocrChunks} query="" active={-1} activeRef={bodyRef} />
        ) : view === "original" ? (
          // Deliberately inert: the reference to READ against; the gestures live on « Masqué ».
          <DocText chunks={[{ text: file.text }]} query="" active={-1} activeRef={bodyRef} />
        ) : view === "rendu" ? (
          <div className="fv-md">
            <Markdown content={file.text} />
          </div>
        ) : view === "redacted" && fallback.redactedErr ? (
          <div className="fv-fallback">
            <ShieldIcon size={22} />
            <p>{fallback.redactedErr}</p>
            <button className="btn-primary btn-inline" onClick={fallback.retry}>
              <RefreshIcon size={14} /> {t.runtime.files.retryMasking}
            </button>
          </div>
        ) : redactedGrid ? (
          sheet(true)
        ) : file.text && redactedPreview === null && fallback.redacted === null ? (
          // Not yet computable (pass/fallback in flight): skeleton — never sneak in the original.
          <FileSkeleton variant="doc" />
        ) : file.text ? (
          <DocText
            chunks={chunks}
            query={search.query}
            active={search.active}
            activeRef={search.activeRef}
            onToggleReveal={onRevealChange ? toggleReveal : undefined}
          />
        ) : (
          <div className="fv-status">{t.viewers.noTextExtracted}</div>
        )}
      </div>
      <PreviewFootbar canForce={canForce} canvasHint={!!onForceRedact && !!file.text && canvas} onShowRedacted={() => setView("redacted")} />
      {/* Hover-reveal strip — SAME component as the chat bubbles. Here the marks show the
          FAKE, so the strip shows the REAL value that would be sent in clear. */}
      {onRevealChange && (
        <RedactionInlineReveal
          containerRef={bodyRef}
          // One floating surface at a time: the selection / word-pick menu wins.
          suppressed={!!sel || !!pick.wordPick}
          selector="[data-doc-reveal]"
          show="real"
          scope="send"
          revealed={revealed}
          onReveal={(real) => toggleReveal(real)}
          onReRedact={(real) => toggleReveal(real)}
          onDelete={onDeleteRedaction}
          onReport={openFeedback ? (kind) => openFeedback(redactionProblemDraft("document", t, kind)) : undefined}
        />
      )}
      <PreviewMenus
        text={file.text ?? ""}
        view={view}
        wordPick={pick.wordPick}
        closeWordPick={pick.close}
        sel={sel}
        clearSel={clear}
        canForce={canForce}
        displayReplacements={displayReplacements}
        onForceRedact={onForceRedact}
        onAddToVault={onAddToVault}
      />
    </ModalShell>
  );
}
