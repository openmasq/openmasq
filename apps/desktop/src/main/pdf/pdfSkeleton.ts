/**
 * PURE policy + skeleton for the HTML→PDF renderer (no Electron import, so every isolation
 * property is unit-testable: `pdfSkeleton.test.ts`). The impure half is `htmlPdf.ts`.
 *
 * The print document holds REAL data and is authored by the untrusted RENDERER (rule 7).
 * The boundary is the enumerated set of things the page is PERMITTED to do (inline CSS, a
 * `data:` font, a `data:` image); script, network, disk, navigation are denied. A
 * tag/attribute DENYLIST over the HTML is deliberately NOT used (fail-open theatre).
 */
import { BRAND } from "@openmasq/branding";


/** Scheme the print document is served over, from memory, by the render session ONLY. */
export const PDF_SCHEME = "kvpdf";
/** The one URL the print session ever serves. Anything else 404s (see `isPdfDocUrl`). */
export const PDF_DOC_URL = `${PDF_SCHEME}://doc/index.html`;

/** Caps on the renderer-supplied payload (a compromised renderer must not force a huge
 *  allocation). A document is a few tens of kB. */
export const MAX_DOC_HTML_BYTES = 1_500_000;
export const MAX_DOC_CSS_BYTES = 200_000;
export const MAX_DOC_TITLE_CHARS = 300;
/** Hard budget for load + print; on timeout the window is destroyed, no partial PDF. */
export const PDF_RENDER_TIMEOUT_MS = 20_000;

/** Renders run one at a time, so the queue needs a ceiling (main-side memory the renderer
 *  does not own). A human never reaches 4. */
export const MAX_PENDING_RENDERS = 4;
export const canAdmitRender = (pending: number): boolean => pending < MAX_PENDING_RENDERS;

/** The print document's CSP: `default-src 'none'`, only inline style + `data:` font/image
 *  (all already IN the payload, so none is a fetch). */
export const PDF_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:; base-uri 'none'; form-action 'none'";

/** `webPreferences` for the print window, typed loosely to stay Electron-free.
 *  `javascript: false` is the strongest line: the whole scripting surface is off. */
export const PDF_WEB_PREFERENCES: Readonly<Record<string, boolean>> = Object.freeze({
  sandbox: true,
  contextIsolation: true,
  nodeIntegration: false,
  nodeIntegrationInSubFrames: false,
  javascript: false,
  webviewTag: false,
  webSecurity: true,
  allowRunningInsecureContent: false,
  spellcheck: false,
  backgroundThrottling: false,
  // No `preload` key at all: the print page gets NO bridge (`window.openmasq` must not
  // exist in a page built from model-authored content).
});

/** True for the ONE document URL the print session serves. */
export const isPdfDocUrl = (url: string): boolean => url === PDF_DOC_URL;

/** True for a request the print page may issue. `data:` is inert (the bytes are already
 *  in the document); the doc URL is the initial navigation. Everything else is cancelled
 *  — that includes a `<meta http-equiv="refresh">`, which CSP does not cover. */
export const isPdfResourceAllowed = (url: string): boolean =>
  isPdfDocUrl(url) || url.startsWith("data:");

/** For the two places main injects a caller-supplied STRING: the `<title>` and the footer
 *  template (a separate print frame our CSP does not cover). */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface PdfRenderRequest {
  /** The BODY markup, built by `@openmasq/ui` `documentHtml.ts` (text escaped there). */
  html: string;
  /** The document's own print stylesheet (the brand charter). */
  css: string;
  /** Plain text: the PDF's title metadata + the running footer label. */
  title: string;
}

/** Validate + normalise an IPC payload. Throws, never coerces silently. */
export function validatePdfRequest(payload: unknown): PdfRenderRequest {
  const p = (payload ?? {}) as Record<string, unknown>;
  const html = p.html;
  const css = p.css;
  const title = p.title;
  if (typeof html !== "string" || typeof css !== "string") throw new Error("html/css manquants");
  if (html.length > MAX_DOC_HTML_BYTES) throw new Error("document trop volumineux");
  if (css.length > MAX_DOC_CSS_BYTES) throw new Error("feuille de style trop volumineuse");
  // `</style` would close our tag and turn the rest into markup. Refuse rather than mangle.
  if (/<\/\s*style/i.test(css)) throw new Error("feuille de style invalide");
  return {
    html,
    css,
    title: typeof title === "string" ? title.slice(0, MAX_DOC_TITLE_CHARS) : "Document",
  };
}

/** The bundled brand font as a `data:` URI (no network in the print session). Empty when
 *  absent: the stack falls back to a system sans. */
export function pdfFontFaceCss(fontBase64: string | undefined): string {
  if (!fontBase64) return "";
  // A variable font: ONE file gives every real weight.
  return `@font-face{font-family:${BRAND.name};src:url(data:font/ttf;base64,${fontBase64}) format("truetype");font-weight:300 700;font-style:normal;font-display:block}`;
}

/** Chromium's footer runs in its OWN frame with inline-only styling: the API's shape, not
 *  app DOM (rule 6). */
export function pdfFooterTemplate(title: string): string {
  const label = escapeHtml(title.slice(0, 90));
  return (
    '<div style="font:8pt -apple-system,system-ui,sans-serif;color:#4c5c3b;width:100%;padding:0 16mm;display:flex;justify-content:space-between">' +
    `<span>${label}</span>` +
    `<span>${BRAND.slug} · page <span class="pageNumber"></span>/<span class="totalPages"></span></span>` +
    "</div>"
  );
}

/** The caller's CSS is the only stylesheet; main contributes the font face and the title. */
export function pdfSkeleton(req: PdfRenderRequest, fontFaceCss: string): string {
  return (
    '<!doctype html><html lang="fr"><head><meta charset="utf-8">' +
    `<title>${escapeHtml(req.title)}</title>` +
    `<style>${fontFaceCss}${req.css}</style></head><body>${req.html}</body></html>`
  );
}
