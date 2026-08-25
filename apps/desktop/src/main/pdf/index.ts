// The HTML→PDF renderer for model-authored documents. See `CLAUDE.md` in this folder.
export { registerPdfIpc } from "./ipc";
export { renderHtmlToPdf } from "./htmlPdf";
export type { PdfRenderRequest } from "./pdfSkeleton";
