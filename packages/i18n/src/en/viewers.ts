/**
 * The « viewers » slice of the EN catalogue: the document viewers.
 */
import type { Messages } from "../messages";

export const viewers = {
  eyebrow: "FILE · PREVIEW",
  close: "Close",
  closeTip: "Close (Esc)",
  loadingFile: "Loading the file",
  pendingNote: "The masked preview appears here once reading and masking are done.",
  extracted: (chars, status) => `${chars} characters extracted · ${status}`,
  staleTip: "Masked with your previous settings",
  staleChip: "Previous settings",
  rerunning: "Masking again…",
  rerun: "Mask again",
  unreadableFile: "This file cannot be read.",
  fileNotFound: "File not found.",
  unreadableDocument: "This document cannot be read.",
  unreadablePresentation: "This presentation cannot be read.",
  unreadableSheet: "This sheet cannot be read.",
  noPreviewForFormat: "The app has no preview for this format.",
  openFile: "Open file",
  openExternal: "Open in external app",
  noTextExtracted:
    "No text could be extracted from this file (an image with no text, an unrecognized scanned PDF…).",
  sharedVersion: "What the model receives",
  documentTab: "Document",
  redactedToggle: "Masked",
  storedLocally: "stored locally",
  maskedNote: (labels) => `Masked data: ${labels}`,
  maskedNoteNoLabels: "What the model receives",
  originalNote: "Original: your real data, never sent as is",
  keptClearTip: "Sent unmasked to the model. Click to mask it again.",
  reRedactAll: "Mask everything again",
  selectToRedact: "Select a value to mask it manually",
  missedValueLead:
    "If a value is not masked, click it in the document, or switch to the ",
  missedValueTail: " view and select it to mask it manually.",
  markAria: (kind, kept) =>
    `Masked value${kind ? ` (${kind})` : ""}${kept ? ", left unmasked" : ""}. Inspect`,
  cellAria: (kept) => `Masked cell${kept ? ", left unmasked" : ""}. Inspect`,
  search: {
    placeholder: "Search in the text…",
    previous: "Previous result",
    next: "Next result",
    clear: "Clear search",
  },
  pdf: {
    unavailable: "PDF preview unavailable. Use “Open”.",
    noPages: "No pages to show.",
    zoomGroup: "Document zoom",
    zoomOut: "Zoom out",
    zoomIn: "Zoom in",
    fitWidth: "Fit to panel width",
    haloOn: "Highlighted: text read on the page, masked before sending",
    haloOff: "Highlight hidden. Text read on the page is still masked before sending.",
    showHalo: "Show highlight",
    hideHalo: "Hide highlight",
    imageZones: (pages) =>
      `Boxed areas (logo, stamp, seal) are part of the image. They are not in the text sent to the model, so they are not highlighted.${pages}`,
    imagePages: (n) => ` ${n} page${n > 1 ? "s are" : " is"} read entirely from the image.`,
  },
  summary: {
    redacting: "masking…",
    redactingProgress: (done, total) => `masking… (${done}/${total})`,
    failed: "masking failed",
    notChecked: "masking not checked here",
    none: "no values detected",
    protected: (n) => `${n} protected value${n > 1 ? "s" : ""}`,
    byKind: (n, kind) => `${n} × ${kind}`,
  },
  sheetCut:
    "Large workbook: only part of it is sent to the model, because each document is truncated when sent. The rest stays on your computer.",
} satisfies Messages["viewers"];
