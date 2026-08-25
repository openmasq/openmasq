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
