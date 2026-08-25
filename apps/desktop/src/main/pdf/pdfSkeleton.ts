/**
 * PURE policy + skeleton for the HTML→PDF renderer — no Electron import, so every
 * isolation property below is a unit-testable function of its arguments
 * (`pdfSkeleton.test.ts`). The impure half (session, window, `printToPDF`) is
 * `htmlPdf.ts`; read its header for the threat model.
 *
 * The print document holds the user's REAL, un-redacted data and is authored by the
 * RENDERER (which is untrusted, root rule 7). The boundary is therefore not a sanitiser
 * over the markup — it is the enumerated set of things the print page is PERMITTED to do:
 * inline CSS, a `data:` font, a `data:` image. Everything else — script, network, disk,
 * navigation, plugins — is absent or denied. That is the allow-list; a tag/attribute
 * DENYLIST over the caller's HTML is deliberately NOT used here (it would be fail-open
 * theatre suggesting a boundary it isn't, rule 7).
 */
import { BRAND } from "@openmasq/branding";


/** Scheme the print document is served over, from memory, by the render session ONLY. */
export const PDF_SCHEME = "kvpdf";
/** The one URL the print session ever serves. Anything else 404s (see `isPdfDocUrl`). */
export const PDF_DOC_URL = `${PDF_SCHEME}://doc/index.html`;

/** Caps on the renderer-supplied payload: main must not be pushed into a huge
 *  allocation by a compromised renderer. A ```document fence is a few tens of kB. */
export const MAX_DOC_HTML_BYTES = 1_500_000;
export const MAX_DOC_CSS_BYTES = 200_000;
export const MAX_DOC_TITLE_CHARS = 300;
/** Hard budget for load + print. A print page has no script, so it either lays out
 *  quickly or something is wrong; on timeout the window is destroyed and the call fails
 *  (fail closed — no partial PDF). */
export const PDF_RENDER_TIMEOUT_MS = 20_000;

/** Renders run one at a time (each spawns a renderer process), so the queue needs a
 *  ceiling: a compromised renderer could otherwise pile up thousands of waiting payloads
 *  — main-side memory it does not own. A human clicking « Télécharger » never reaches 4. */
export const MAX_PENDING_RENDERS = 4;
export const canAdmitRender = (pending: number): boolean => pending < MAX_PENDING_RENDERS;

/**
 * The response CSP of the print document. `default-src 'none'` denies script, frame,
 * connect, media and manifest; only inline style, a `data:` font and a `data:` image are
 * permitted — all three are already IN the payload, so none of them is a fetch.
 * Verified at runtime: a remote `<img>` is refused before any request is issued.
 */
export const PDF_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:; base-uri 'none'; form-action 'none'";

/**
 * `webPreferences` for the print window. Typed loosely on purpose so this file stays
 * Electron-free (and therefore unit-testable). `javascript: false` is the strongest
 * single line here: the print document needs no script at all, so the entire scripting
 * surface — and with it every DOM-side exfiltration primitive — is switched off.
 * (Runtime-verified: a `<script>` in the payload never executes.)
 */
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

/** HTML-escape for the two places main injects a caller-supplied STRING into markup:
 *  the `<title>` and Chromium's footer template (which is a separate print frame our
 *  CSP does not cover — an unescaped title there would be an injection). */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface PdfRenderRequest {
  /** The document BODY markup, built by `@openmasq/ui` `documentHtml.ts` (text escaped
   *  there — it is real user data). */
  html: string;
  /** The document's own print stylesheet (the brand charter). */
  css: string;
  /** Plain text: the PDF's title metadata + the running footer label. */
  title: string;
}

/** Validate + normalise an IPC payload. Throws (never coerces silently) — an
 *  out-of-contract call is a bug or an attack, and both must fail the render. */
export function validatePdfRequest(payload: unknown): PdfRenderRequest {
  const p = (payload ?? {}) as Record<string, unknown>;
  const html = p.html;
  const css = p.css;
  const title = p.title;
  if (typeof html !== "string" || typeof css !== "string") throw new Error("html/css manquants");
  if (html.length > MAX_DOC_HTML_BYTES) throw new Error("document trop volumineux");
  if (css.length > MAX_DOC_CSS_BYTES) throw new Error("feuille de style trop volumineuse");
  // `</style` in the caller's CSS would close our tag and turn the rest into markup.
  // Refuse rather than mangle: our own builder never emits it.
  if (/<\/\s*style/i.test(css)) throw new Error("feuille de style invalide");
  return {
    html,
    css,
    title: typeof title === "string" ? title.slice(0, MAX_DOC_TITLE_CHARS) : "Document",
  };
}

/** The `@font-face` rule for the bundled brand font, inlined as a `data:` URI (there is
 *  no network in the print session, so a webfont MUST travel in the document). Empty
 *  string when the font is absent — the stack then falls back to a system sans. */
export function pdfFontFaceCss(fontBase64: string | undefined): string {
  if (!fontBase64) return "";
  // The bundled file is the variable OFL Space Grotesk; Chromium honours the `wght`
  // axis, so ONE file gives every real weight (unlike fpdf2 — see python/preambleDocs).
  return `@font-face{font-family:${BRAND.name};src:url(data:font/ttf;base64,${fontBase64}) format("truetype");font-weight:300 700;font-style:normal;font-display:block}`;
}

/** Chromium's print footer runs in its OWN frame with its own (inline-only) styling —
 *  hence the inline `style` here, which is the API's shape, not app DOM (rule 6). */
export function pdfFooterTemplate(title: string): string {
  const label = escapeHtml(title.slice(0, 90));
  return (
    '<div style="font:8pt -apple-system,system-ui,sans-serif;color:#4c5c3b;width:100%;padding:0 16mm;display:flex;justify-content:space-between">' +
    `<span>${label}</span>` +
    `<span>${BRAND.slug} · page <span class="pageNumber"></span>/<span class="totalPages"></span></span>` +
    "</div>"
  );
}

/** Assemble the full print document. The caller's CSS wins over nothing — it is the only
 *  stylesheet; main contributes the font face and the charset/title only. */
export function pdfSkeleton(req: PdfRenderRequest, fontFaceCss: string): string {
  return (
    '<!doctype html><html lang="fr"><head><meta charset="utf-8">' +
    `<title>${escapeHtml(req.title)}</title>` +
    `<style>${fontFaceCss}${req.css}</style></head><body>${req.html}</body></html>`
  );
}
