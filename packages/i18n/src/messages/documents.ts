/**
 * The « documents » slice — What reading a file can say to the user: extraction refusals, OCR failures and the markers left in extracted text. The engine returns a stable code; the UI words it here.
 *
 * `@openmasq/redact` stays free of this package: it returns `errorCode` (+ `errorParams`) on
 * an extraction result and keeps its own French text as the fallback. The desktop main
 * process maps the code to these entries (`apps/desktop/src/main/ocr/localizeExtracted.ts`).
 * These texts can ALSO reach the model as a tool error, so none of them invites a retry.
 */
export interface DocumentsMessages {
  /** The safety guard refused the file before any parser ran. */
  refused: {
    fileTooLarge: (mb: number) => string;
    /** A PDF past the page cap, refused whole rather than read in part. */
    pdfTooManyPages: (pages: number, max: number) => string;
    executable: string;
    typeMismatch: string;
    imageTooLarge: (width: number, height: number) => string;
    imageUnreadable: string;
    zipEntries: (entries: number) => string;
    zipTooLarge: string;
    zipRatio: string;
  };
  ocr: {
    failed: string;
    engineMissing: string;
    engineIncompatible: string;
    pdfRendererMissing: string;
    pdfRendererIncompatible: string;
  };
  /** A scanned PDF whose OCR failed: the context, then the cause sentence. */
  scanPdf: (cause: string) => string;
  /** An image whose OCR failed for an unknown cause. */
  imageOcrFailed: string;
  /** `ext` with its dot (« .xyz »), or "" when the file has none. */
  unsupportedType: (ext: string) => string;
  /** Written INTO the extracted text, where OCR skipped pages. */
  markers: {
    pageTooLarge: (page: number) => string;
    morePages: (count: number) => string;
  };
}
