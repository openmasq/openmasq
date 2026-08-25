import { useContext, useLayoutEffect, useRef, useState } from "react";
import { Markdown, MarkdownDocContext } from "../../Markdown";
import { blocksFromElement, resolveImageBlocks } from "../../../export/documentBlocks";
import { documentFilename, downloadBlob, downloadTextFile } from "../../../export/documentExport";
import { DownloadMenu } from "./DownloadMenu";
import { DocumentEditor } from "./editor/DocumentEditor";
import { isRichFormat, type DownloadFormat, type RichFormat } from "./formats";

// Height (px) above which the body is clipped behind a fade + a "Voir tout" toggle,
// so a multi-page document doesn't dominate the thread. `scrollHeight` is the full
// content height regardless of the CSS cap, so the check is cap-independent.
const CLIP_ABOVE = 440;

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * A model-generated DOCUMENT (a ```document fence — see `systemPrompt.ts`
 * `DOCUMENT_GUIDANCE`), rendered INLINE in the thread as a bordered, padded card
 * with download actions, instead of loose prose or a code chip. The body is the
 * SAME `Markdown` component (so redaction marks + formatting match the rest of the
 * reply); vault/kinds/revealed come from `MarkdownDocContext`.
 *
 * Downloads are ALL on-device (no backend), from the reply's already-UN-REDACTED text
 * (real data, never sent back to the model): `.md`/`.txt` are Blobs of the source;
 * `.pdf`/`.docx` are generated from the rendered DOM (`blocksFromElement` →
 * `documentPdf`/`documentDocx`, both lazy-loaded). The four formats live behind ONE
 * « Télécharger » dropdown (`DownloadMenu`, vocabulary in `formats.ts`); only the rich
 * two can be busy, and only one at a time.
 *
 * The PDF prefers the PLATFORM typesetter (`renderPdf`, from `host.pdf` via the context —
 * this tier never reads the host): a real layout engine gives the brand webfont, real
 * tables and full Unicode. No slot, or any failure, falls back to pdf-lib in-renderer, so
 * the download always lands — quietly plainer, never absent.
 *
 * EDITING: click the text and write. There is no « Modifier » button and no mode
 * switch — the editor (`editor/DocumentEditor.tsx`) renders the SAME typography as the
 * card, so the surface never turns into markdown source in a mono textarea, which is
 * what the button used to lead to. Block shorthands (`# `, `- `, `1. `, `> `) and the
 * ⌘B/⌘I/⌘E chords do the formatting; ⌘Entrée or simply clicking away saves, Échap
 * reverts.
 *
 * The fence's inner markdown stays the source of truth (`editor/blocks.ts` proves the
 * md → DOM → md round-trip), and persistence goes through the context's
 * `onDocumentEdit` (store `editDocument`, which runs the edit-time redaction pass) —
 * absent ⇒ a read-only card: streaming, nested render, no store. Exports always derive
 * from the SAVED text, so an edit flows into every format.
 */
export function DocumentCard({ title, text }: { title: string; text: string }) {
  const { vault, kinds, revealed, onDocumentEdit, renderPdf, loadImage } = useContext(MarkdownDocContext);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [tall, setTall] = useState(false);
  const [busy, setBusy] = useState<RichFormat | null>(null);
  /** Editing state: null = reading; a string = the draft being edited. */
  const [draft, setDraft] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const editing = draft !== null;

  // Async on purpose: the store runs the EDIT-TIME REDACTION pass before persisting
  // (a hand-typed value must enter the vault or the next send leaks it) — false =
  // pass failed or fence not found → the save is REFUSED, content untouched.
  const saveEdit = async (next: string) => {
    if (draft === null || !onDocumentEdit || saving) return;
    // Clicking away without having changed anything must not run the store's edit-time
    // redaction pass, nor mint a new document version — leaving is not editing.
    if (next.trim() === text.trim()) {
      setDraft(null);
      setSaveFailed(false);
      return;
    }
    if (next.trim() === "") {
      setSaveFailed(true);
      return;
    }
    setSaving(true);
    try {
      if (await onDocumentEdit(text, next)) {
        setDraft(null);
        setSaveFailed(false);
      } else {
        setSaveFailed(true);
      }
    } catch {
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  };

  // Re-measure each render — the document streams in, growing its height.
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (el) setTall(el.scrollHeight > CLIP_ABOVE);
  });

  // Build the block model from the RENDERED markdown (matches what's shown, incl.
  // the un-redacted `<mark>` text), then generate the file. Lazy-imports the heavy
  // formatter so it code-splits; a failure falls back to a `.md` download.
  const exportRich = async (fmt: RichFormat) => {
    if (busy) return;
    setBusy(fmt);
    try {
      // Figures are re-loaded at FULL resolution for the file (the on-screen previews are
      // downscaled for the thread's memory footprint); a miss keeps the preview.
      const blocks = await resolveImageBlocks(
        blocksFromElement(bodyRef.current?.querySelector(".md")),
        loadImage,
      );
      if (fmt === "pdf") {
        // The platform typesetter first (brand webfont, real tables, full Unicode); its
        // absence OR any failure falls through to the in-renderer pdf-lib exporter, so a
        // download always lands. Both stay on-device.
        let bytes: Uint8Array | null = null;
        if (renderPdf) {
          const { documentHtmlFromBlocks } = await import("../../../export/documentHtml");
          bytes = await renderPdf(documentHtmlFromBlocks(blocks, title)).catch(() => null);
        }
        if (!bytes) {
          const { pdfBytesFromBlocks } = await import("../../../export/documentPdf");
          bytes = await pdfBytesFromBlocks(blocks, title);
        }
        downloadBlob(documentFilename(title, "pdf"), "application/pdf", bytes);
      } else {
        const { docxBytesFromBlocks } = await import("../../../export/documentDocx");
        downloadBlob(documentFilename(title, "docx"), DOCX_MIME, await docxBytesFromBlocks(blocks));
      }
    } catch {
      downloadTextFile(documentFilename(title, "md"), "text/markdown;charset=utf-8", text);
    } finally {
      setBusy(null);
    }
  };

  /** `.md`/`.txt`: a Blob of the SOURCE (no DOM pass, so nothing to be busy about). */
  const exportPlain = (fmt: "md" | "txt") =>
    downloadTextFile(
      documentFilename(title, fmt),
      fmt === "md" ? "text/markdown;charset=utf-8" : "text/plain;charset=utf-8",
      text,
    );

  const download = (fmt: DownloadFormat) =>
    isRichFormat(fmt) ? void exportRich(fmt) : exportPlain(fmt);

  // Click-to-edit: the body IS the affordance — there is no button. Deliberately inert
  // when the click lands on something interactive (link, redaction mark reveal, image,
  // the « Voir tout » toggle) or when the user just SELECTED text: entering the editor
  // must never steal a copy gesture.
  const bodyClickToEdit = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onDocumentEdit) return;
    const t = e.target as HTMLElement;
    if (t.closest("a, button, mark, img, input, textarea, [role='button']")) return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    setDraft(text);
  };

  const clipped = tall && !expanded;
  return (
    <div className="md-document-card">
      <div className="md-document-head">
        <span className="md-document-glyph" aria-hidden="true">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 3v4a1 1 0 0 0 1 1h4" />
            <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" />
            <path d="M9 9h1M9 13h6M9 17h6" />
          </svg>
        </span>
        <span className="md-document-title" title={title}>
          {title}
        </span>
        <div className="md-document-actions">
          {editing ? (
            // No « Enregistrer » pair: clicking away writes the document. The row states
            // WHERE the save is instead — silence would be the one thing a user cannot
            // check, and a failure has to say so rather than look like a save.
            saveFailed ? (
              <span className="md-document-edit-err">
                Enregistrement impossible — votre texte est toujours là.
              </span>
            ) : (
              <span className="md-document-edit-hint">
                {saving ? "Enregistrement…" : "⌘↵ pour enregistrer · Échap pour annuler"}
              </span>
            )
          ) : (
            <DownloadMenu busy={busy} onPick={download} />
          )}
        </div>
      </div>
      {editing ? (
        // Real values included (the content is stored un-redacted) — what is typed is
        // what the exports and the next send will carry.
        <DocumentEditor
          markdown={draft}
          saving={saving}
          onSave={(next) => void saveEdit(next)}
          onCancel={() => {
            setDraft(null);
            setSaveFailed(false);
          }}
        />
      ) : (
        <>
          <div
            className="md-document-body"
            ref={bodyRef}
            data-clip={clipped ? "1" : undefined}
            data-editable={onDocumentEdit ? "1" : undefined}
            title={onDocumentEdit ? "Cliquer pour modifier" : undefined}
            onClick={bodyClickToEdit}
          >
            <Markdown content={text} vault={vault} kinds={kinds} revealed={revealed} linkPreviews={false} />
          </div>
          {(tall || expanded) && (
            <button type="button" className="md-document-toggle" onClick={() => setExpanded((v) => !v)}>
              {expanded ? "Replier" : "Voir tout"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
