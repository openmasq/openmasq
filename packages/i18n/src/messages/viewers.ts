/**
 * The « viewers » slice contract — the document viewers: the preview of an
 * attachment before sending, the Bibliothèque's reader, and their views (PDF, spreadsheet,
 * redacted text).
 *
 * The views' VOCABULARY (« Redacted », « Original », « OCR ») lives in `docViews`:
 * the menu is what chooses them, and it existed before these screens.
 */

export interface ViewersMessages {
  /** The shared frame: header, close, loading and failure states. */
  eyebrow: string;
  close: string;
  closeTip: string;
  loadingFile: string;
  extracted: (chars: string, status: string) => string;
  staleTip: string;
  staleChip: string;
  rerunning: string;
  rerun: string;
  /** The failures, one per format — saying which one avoids « ça ne marche pas ». */
  unreadableFile: string;
  fileNotFound: string;
  unreadableDocument: string;
  unreadablePresentation: string;
  unreadableSheet: string;
  noPreviewForFormat: string;
  openFile: string;
  openExternal: string;
  noTextExtracted: string;
  /** The document shared with the model, and the real ⇄ redacted round trip. */
  sharedVersion: string;
  documentTab: string;
  redactedToggle: string;
  /** What one keeps in clear, by hand. */
  keptClearTip: string;
  reRedactAll: string;
  selectToRedact: string;
  missedValueLead: string;
  missedValueTail: string;
  /** A mark, in a document or a cell. */
  markAria: (kind: string, kept: boolean) => string;
  cellAria: (kept: boolean) => string;
  /** Searching within the text. */
  search: {
    placeholder: string;
    previous: string;
    next: string;
    clear: string;
  };
  /** The PDF: zoom, halo, and what the image carries that the text does not. */
  pdf: {
    unavailable: string;
    noPages: string;
    zoomGroup: string;
    zoomOut: string;
    zoomIn: string;
    fitWidth: string;
    haloOn: string;
    haloOff: string;
    showHalo: string;
    hideHalo: string;
    imageZones: (pages: string) => string;
    imagePages: (count: number) => string;
  };
  /** The preview's subtitle: what the redaction did to THIS document. */
  summary: {
    redacting: string;
    redactingProgress: (done: number, total: number) => string;
    failed: string;
    notChecked: string;
    none: string;
    protected: (count: number) => string;
    byKind: (count: number, kind: string) => string;
  };
  /** The spreadsheet: what the send truncates. */
  sheetCut: string;
}
