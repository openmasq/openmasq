// Moved to the shared @openmasq/redact/pdf-redact module (reused by the extension
// file viewer too — one source of truth). Re-exported here so existing imports
// (PdfRedactedViewer, AttachmentPreviewModal, ChatView…) keep working unchanged.
export {
  pdfReplacements,
  vaultReplacements,
  type PdfReplacement,
} from "@openmasq/redact/pdf-redact";
