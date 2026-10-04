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
  partialNote:
    "Provisional preview: each passage appears once it is masked. A value found further on may still be masked in what is already shown.",
  partialRest: (pct) => `Masking… ${pct}%`,
  reading: {
    pagesLabel: "Document pages",
    pageMasked: (n) => `Page ${n}: masked`,
    pageRead: (n) => `Page ${n}: read, masking`,
    pageCurrent: (n) => `Page ${n}: reading`,
    pageWaiting: (n) => `Page ${n}: waiting`,
    tileRead: (n) => `Page ${n} · read, masking`,
    tileCurrent: (n) => `Page ${n} · reading`,
    tileWaiting: (n) => `Page ${n} · waiting to be read`,
    tileHeld: (n) => `Page ${n} · masked, shown once the whole document is done`,
    original: (n) => `Page ${n} · original, not masked yet`,
  },
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
  askIdle: "Ask",
  askPending: "Preparing…",
  askFailed: "Failed, try again",
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
    provisional:
      "Provisional preview: a page still in its original form says so, and switches to its masked version as soon as it is masked. A value found further on may still be masked on a page already masked.",
    goToPage: (n) => `Go to page ${n}`,
    haloOn: "Highlighted: text read on the page, masked before sending",
    haloOff: "Highlight hidden. Text read on the page is still masked before sending.",
    showHalo: "Show highlight",
    hideHalo: "Hide highlight",
    imageZones: (pages) =>
      `Boxed areas (logo, stamp, seal) are part of the image. They are not in the text sent to the model, so they are not highlighted.${pages}`,
    imagePages: (n) => ` ${n} page${n > 1 ? "s are" : " is"} read entirely from the image.`,
    imageOnlyNote: (n) =>
      n > 1
        ? `${n} pages are read from the image: their text comes from reading the pixels, not from a text layer.`
        : "This page is read from the image: its text comes from reading the pixels, not from a text layer.",
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
} satisfies Messages["viewers"];
