/**
 * The « viewers » slice of the EN catalogue: the document viewers.
 */
import type { Messages } from "../messages";

export const viewers = {
  eyebrow: "FILE · PREVIEW",
  close: "Close",
  closeTip: "Close (Esc)",
  loadingFile: "Loading the file",
  extracted: (chars, status) => `${chars} characters extracted · ${status}`,
  staleTip: "Redacted with your previous settings",
  staleChip: "Previous settings",
  rerunning: "Redacting again…",
  rerun: "Redact again",
  unreadableFile: "This file cannot be read.",
  fileNotFound: "File not found.",
  unreadableDocument: "This document cannot be read.",
  unreadablePresentation: "This presentation cannot be read.",
  unreadableSheet: "This sheet cannot be read.",
  noPreviewForFormat: "The app has no preview for this format.",
  openFile: "Open the file",
  openExternal: "Open in the external app",
  noTextExtracted:
    "No text could be extracted from this file (an image with no text, an unrecognised scanned PDF…).",
  sharedVersion: "The version shared with the models",
  documentTab: "Document",
  redactedToggle: "Redacted",
  storedLocally: "stored locally",
  maskedNote: (labels) => `Redacted data: ${labels}`,
  maskedNoteNoLabels: "Version shared with the models",
  originalNote: "Original — your real data, never shared as is",
  keptClearTip: "Kept in the clear — sent to the model as is. Click to redact it again.",
  reRedactAll: "Redact everything again",
  selectToRedact: "Select a value to redact it by hand",
  missedValueLead:
    "A value was not masked? Click it in the document, or switch to the ",
  missedValueTail: " view and select it to redact it by hand.",
  markAria: (kind, kept) =>
    `Redacted value${kind ? ` (${kind})` : ""}${kept ? " — kept in the clear" : ""} — inspect`,
  cellAria: (kept) => `Redacted cell${kept ? " — kept in the clear" : ""} — inspect`,
  search: {
    placeholder: "Search in the text…",
    previous: "Previous result",
    next: "Next result",
    clear: "Clear the search",
  },
  pdf: {
    unavailable: "PDF preview unavailable (use “Open”).",
    noPages: "No page to show.",
    zoomGroup: "Document zoom",
    zoomOut: "Zoom out",
    zoomIn: "Zoom in",
    fitWidth: "Fit to the panel width",
    haloOn: "Halo = recognised text, redacted before sending",
    haloOff: "Halo hidden — the recognised text still leaves redacted",
    showHalo: "Show the halo again",
    hideHalo: "Hide the halo",
    imageZones: (pages) =>
      `The framed zones (logo, stamp, seal) belong to the image: they are not part of the text sent to the model, so they carry no halo.${pages}`,
    imagePages: (n) => ` ${n} page${n > 1 ? "s are" : " is"} read entirely from the image.`,
  },
  summary: {
    redacting: "redacting…",
    redactingProgress: (done, total) => `redacting… (${done}/${total})`,
    failed: "the redaction failed",
    notChecked: "redaction not checked here",
    none: "no value detected",
    protected: (n) => `${n} protected value${n > 1 ? "s" : ""}`,
    byKind: (n, kind) => `${n} × ${kind}`,
  },
  sheetCut:
    "Large workbook: part of it does not go to the model (a send truncates every document) — and what does not go never leaves the machine.",
} satisfies Messages["viewers"];
