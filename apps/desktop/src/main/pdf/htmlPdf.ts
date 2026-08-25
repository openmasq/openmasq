import { app, BrowserWindow, session, type Session } from "electron";
import { DEVTOOLS_PREF } from "../devtools";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fontsDir } from "../python/runtime";
import {
  PDF_CSP,
  PDF_DOC_URL,
  PDF_RENDER_TIMEOUT_MS,
  PDF_SCHEME,
  PDF_WEB_PREFERENCES,
  canAdmitRender,
  isPdfDocUrl,
  isPdfResourceAllowed,
  pdfFontFaceCss,
  pdfFooterTemplate,
  pdfSkeleton,
  type PdfRenderRequest,
} from "./pdfSkeleton";

/**
 * HTML→PDF for a model-authored DOCUMENT (the ```document card's « Télécharger → PDF »).
 * Chromium's own layout engine is the only typesetter in the product that gives real
 * brand typography, full Unicode, page-breaking and REAL tables — the client-side pdf-lib
 * exporter (`@openmasq/ui` `documentPdf.ts`, still the fallback when this host slot is
 * absent) is capped at WinAnsi + the 14 standard fonts, and fpdf2 in the Python sandbox
 * has one font weight.
 *
 * ⚠️ THREAT MODEL (root rule 7). The HTML is composed in the RENDERER — untrusted — and
 * carries the user's REAL un-redacted data (that is the promise: the model saw only
 * placeholders, the user's own document holds the true values). So this is a page built
 * from model-influenced content, holding secrets, rendered by a real browser engine. The
 * containment, all of it enumerated and pinned in `pdfSkeleton.test.ts`:
 *
 *  - **Its own renderer PROCESS, out of main** — like the agent browser and the Python
 *    jail, and for the same reason: never lay out untrusted content in the privileged
 *    process. It has no preload, so `window.openmasq` does not exist there.
 *  - **`javascript: false`** — a print document needs no script, so the scripting surface
 *    is switched off outright rather than fenced.
 *  - **A dedicated in-memory session** whose `webRequest` CANCELS every request that is
 *    not the one document or an inert `data:` URI, and whose response carries
 *    {@link PDF_CSP} (`default-src 'none'`). Network egress from this page is impossible,
 *    which is what keeps a real value in the document from being beaconed out.
 *  - **Nothing touches the disk.** The document is served from MEMORY over a custom
 *    scheme; writing it to a temp file would leave plaintext PII outside the encrypted
 *    store. The PDF bytes go straight back over IPC.
 *  - **Navigation is refused** (`will-navigate`, window-open denied): the initial load is
 *    the page's whole life.
 *  - **Fail closed**: any load/print error or the {@link PDF_RENDER_TIMEOUT_MS} budget
 *    rejects, the window is destroyed, and the caller falls back to pdf-lib. No partial
 *    PDF is ever returned.
 *
 * Nothing here is logged — not the HTML, not the title (both are real user data).
 */

/** The document currently being printed, served by the protocol handler. Guarded by
 *  {@link queue}: exactly one render is in flight, so a single slot is safe. */
let current: Buffer | null = null;
let printSession: Session | null = null;
/** Renders are serialised — each one spawns a renderer process; a burst of clicks must
 *  not spawn a burst of them. `pending` bounds the queue behind that (fail closed). */
let queue: Promise<unknown> = Promise.resolve();
let pending = 0;
/** `undefined` = not resolved yet, `null` = no bundled font on this install. */
let fontB64: string | null | undefined;

/** The bundled, sha256-pinned OFL brand font — the SAME file the matplotlib theme and the
 *  `<slug>_pdf` helper use (rule 9: it ships once, in the Python runtime's `fonts/`).
 *  Absent (a dev tree with no baked runtime) ⇒ the print CSS falls back to a system sans. */
async function brandFontBase64(): Promise<string | null> {
  if (fontB64 !== undefined) return fontB64;
  fontB64 = null;
  // Packaged: the baked runtime under resources. Dev: wherever the runtime resolved to.
  const dirs = [
    ...(app.isPackaged ? [fontsDir(join(process.resourcesPath, "python-runtime"))] : []),
    fontsDir(),
  ];
  for (const dir of dirs) {
    const names = await readdir(dir).catch(() => [] as string[]);
    const file = names.sort().find((n) => /\.(ttf|otf)$/i.test(n));
    if (!file) continue;
    const bytes = await readFile(join(dir, file)).catch(() => null);
    if (bytes?.length) {
      fontB64 = bytes.toString("base64");
      break;
    }
  }
  return fontB64;
}

/** The isolated session, created once: in-memory (no `persist:`), no cache, serving the
 *  one document from memory and cancelling every other request. */
function ensureSession(): Session {
  if (printSession) return printSession;
  const ses = session.fromPartition(`${PDF_SCHEME}-print`, { cache: false });
  ses.webRequest.onBeforeRequest((details, cb) => cb({ cancel: !isPdfResourceAllowed(details.url) }));
  ses.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  ses.setPermissionCheckHandler(() => false);
  ses.protocol.handle(PDF_SCHEME, (req) => {
    if (!current || !isPdfDocUrl(req.url)) return new Response("", { status: 404 });
    return new Response(new Uint8Array(current), {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": PDF_CSP },
    });
  });
  printSession = ses;
  return ses;
}

/** Render one document to PDF bytes. Rejects (never half-delivers) on any failure. */
async function renderOne(req: PdfRenderRequest): Promise<Uint8Array> {
  const html = pdfSkeleton(req, pdfFontFaceCss((await brandFontBase64()) ?? undefined));
  const ses = ensureSession();
  current = Buffer.from(html, "utf8");
  const win = new BrowserWindow({
    show: false,
    // A4 at 96dpi — only the initial viewport; `@page` in the document owns the paper.
    width: 794,
    height: 1123,
    webPreferences: { ...PDF_WEB_PREFERENCES, ...DEVTOOLS_PREF, session: ses },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  const timer: { id?: ReturnType<typeof setTimeout> } = {};
  try {
    const budget = new Promise<never>((_, reject) => {
      timer.id = setTimeout(() => reject(new Error("délai de rendu dépassé")), PDF_RENDER_TIMEOUT_MS);
    });
    await Promise.race([win.loadURL(PDF_DOC_URL), budget]);
    const pdf = await Promise.race([
      win.webContents.printToPDF({
        pageSize: "A4",
        printBackground: true,
        // The document's own `@page` (size + margins) wins — the charter lives in the CSS.
        preferCSSPageSize: true,
        displayHeaderFooter: true,
        headerTemplate: "<div></div>",
        footerTemplate: pdfFooterTemplate(req.title),
        generateTaggedPDF: true,
      }),
      budget,
    ]);
    if (!pdf?.length) throw new Error("PDF vide");
    return new Uint8Array(pdf);
  } finally {
    if (timer.id) clearTimeout(timer.id);
    current = null;
    if (!win.isDestroyed()) win.destroy();
  }
}

/** Serialised entry point. One render at a time, a BOUNDED queue behind it (a renderer
 *  XSS must not be able to pile up main-side payloads), and a failure never poisons it. */
export function renderHtmlToPdf(req: PdfRenderRequest): Promise<Uint8Array> {
  if (!canAdmitRender(pending)) return Promise.reject(new Error("trop de rendus en attente"));
  pending++;
  const run = queue.then(
    () => renderOne(req),
    () => renderOne(req),
  );
  queue = run.catch(() => undefined);
  return run.finally(() => {
    pending--;
  });
}
