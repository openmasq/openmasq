import type { PdfReplacement } from "../pdf/pdfReplacements";
import type { PendingPdf } from "../pdf/pendingPages";

/** What `AttachmentPreviewModal` takes: the file, and every gesture its owner allows. */
export interface AttachmentPreviewProps {
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
     *  these and NO `path`. Either one is enough to render the file itself. */
    data?: string;
    /** Pre-computed at attach time — the viewer reuses it (no re-run). */
    replacements?: PdfReplacement[];
    /** OCR word boxes (scans) → paint the redaction ON the image. */
    words?: { text: string; x0: number; y0: number; x1: number; y1: number; confidence?: number }[];
    /** Per-page OCR word geometry (scanned PDFs) → paint the redaction boxes on
     *  pages that have no text layer (see `PdfRedactedViewer.ocrPages`). */
    ocrPages?: import("@openmasq/redact/documents.browser").OcrLayerPage[];
    /** THE SECOND LAYER (always-OCR): what the page PIXELS say, when it differs from the
     *  text-layer `text` — the « Texte de l'image » view. */
    ocrText?: string;
  };
  onClose: () => void;
  /** It takes over from the pending frame of the same file: no opening animation (`ModalShell`). */
  continued?: boolean;
  /** Re-run this file's redaction (with the current engine) — offered when `stale`. */
  onRerun?: () => void;
  /** The file was redacted with a different engine than the one now selected. */
  stale?: boolean;
  /** Redaction is currently (re-)running for this file. */
  redacting?: boolean;
  /** FAILED drop-time pass: the header + the views say so. */
  redactError?: string;
  /** Chunk progress of the in-flight pass (the chip's bar) — shown in the subtitle. */
  redactProgress?: { done: number; total: number };
  /** REAL values the user chose to send IN CLEAR. Absent / no `onRevealChange` ⇒ display-only. */
  reveal?: string[];
  /** Toggle a value in/out of the reveal set (drives the SEND — see ChatView). */
  onRevealChange?: (reveal: string[]) => void;
  /** Manually redact a SELECTED zone AS a chosen type. Absent ⇒ display-only. */
  onForceRedact?: (value: string, token: string) => void;
  /** DELETE a redaction element entirely (false positive). */
  onDeleteRedaction?: (value: string) => void;
  /** Add the selected value to the global COFFRE AS a chosen type. */
  onAddToVault?: (value: string, token: string) => void;
  /** Labels of the redaction categories currently OFF (see `docCategoryNotice.ts`). */
  inactiveCategories?: string[];
  /** The conversation's category override — for the `redact()` fallback (no `file.replacements`). */
  convCategories?: Record<string, boolean>;
  /** A PDF still being read or masked: the live line, and its pages as far as masked. */
  pending?: { progress: string; pdf: PendingPdf };
}
