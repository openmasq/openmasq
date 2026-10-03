// Marker inserted between the pages of a multi-page document (PDF text / OCR) so page
// boundaries survive into `text` and the viewer can render each page as its OWN sheet.
// `\f` is pure whitespace to the model, to search and to the (value-based) engine, so it
// changes nothing downstream except that the UI can now split on it; wrapped in newlines
// so the flat text still reads with a page separation. Its own module so the page stream
// (`pageStream.ts`) can join pages exactly as the extractors do without importing `core`.
export const PAGE_BREAK = "\n\f\n";
