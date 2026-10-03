/**
 * The « viewers » slice contract — the document viewers: the preview of an
 * attachment before sending, the Bibliothèque's reader, and their views (PDF, spreadsheet,
 * redacted text).
 *
 * The views' VOCABULARY (« Masqué », « Original », « OCR ») lives in `docViews`:
 * the menu is what chooses them, and it existed before these screens.
 */

export interface ViewersMessages {
  /** The shared frame: header, close, loading and failure states. */
  eyebrow: string;
  close: string;
  closeTip: string;
  loadingFile: string;
  /** Opened while the file is still being read / masked: what the wait is for. */
  pendingNote: string;
  /** The progressive preview while masking: what is shown is masked, and may gain masks. */
  partialNote: string;
  /** Where the part not yet masked would be — never its text. */
  partialRest: (pct: number) => string;
  /** A PDF opened while it is read or masked: the page strip, and the tile a page shows
   *  (its blurred thumbnail, never legible) until it is masked. */
  reading: {
    pagesLabel: string;
    pageMasked: (n: number) => string;
    pageRead: (n: number) => string;
    pageCurrent: (n: number) => string;
    pageWaiting: (n: number) => string;
    tileRead: (n: number) => string;
    tileCurrent: (n: number) => string;
    tileWaiting: (n: number) => string;
    /** Masked, but its values cannot be drawn on the page yet (a scan's boxes come at the end). */
    tileHeld: (n: number) => string;
  };
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
  /** The default storage caption, and the note line over the masked ⇄ original views. */
  storedLocally: string;
  /** « Demander » on an opened file: idle, preparing, failed. */
  askIdle: string;
  askPending: string;
  askFailed: string;
  maskedNote: (labels: string) => string;
  maskedNoteNoLabels: string;
  originalNote: string;
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
    /** Above a document still being masked: what a page shown means, and what may change. */
    provisional: string;
    goToPage: (n: number) => string;
    haloOn: string;
    haloOff: string;
    showHalo: string;
    hideHalo: string;
    imageZones: (pages: string) => string;
    imagePages: (count: number) => string;
    /** Whole pages read from the image, and no outlined zone to explain. */
    imageOnlyNote: (count: number) => string;
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
}
