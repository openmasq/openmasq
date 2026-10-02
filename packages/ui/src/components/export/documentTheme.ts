/**
 * The DOCUMENT charter — the palette every deliverable the app generates wears: forest ink
 * on warm off-white, one lime accent, striped tables. It is deliberately NOT the app's
 * `--brand` (coral in the light theme): a document is a printed artefact, not a screen, and
 * it must match the PDF/PPTX the Python sandbox produces (`<slug>_pdf`/`<slug>_pptx`) — a
 * user who gets one of each should not see two brands.
 *
 * That sandbox copy is a Python source string in the desktop app, which cannot import this
 * module; rule 9's answer to a necessary copy is a parity TEST, not a "keep in sync"
 * comment — `documentTheme.parity.test.ts` reads that file and compares the values.
 */
export const DOC_INK = "#18230d";
export const DOC_MUTED = "#4c5c3b";
export const DOC_LIME = "#b8e635";
export const DOC_BG = "#fbfbfa";
export const DOC_GRID = "#dcdad2";
export const DOC_STRIPE = "#f5f5f1";

/**
 * The document TYPEFACES. PDF: Inter (OFL), embedded by the platform from a sha256-pinned
 * file whose family name lives in `apps/desktop/src/main/pdf/documentFontSpec.ts`. Word and
 * PowerPoint cannot embed it portably, so they NAME a face the reader's Office resolves:
 * Aptos (Office's default since 2023), with Calibri declared as the substitute an older
 * Office or LibreOffice falls back to. Both copies (that spec, the sandbox's python-docx /
 * python-pptx helpers) are held by `documentTheme.parity.test.ts`.
 */
export const DOC_FONT_PRINT = "Inter";
export const DOC_FONT_OFFICE = "Aptos";
export const DOC_FONT_OFFICE_FALLBACK = "Calibri";
