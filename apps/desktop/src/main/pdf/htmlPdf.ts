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
 * HTML→PDF for a model-authored DOCUMENT: Chromium's layout engine gives real typography,
 * Unicode, page-breaking and tables the client-side exporter (the fallback) cannot.
 *
 * ⚠️ THREAT MODEL (rule 7): the HTML is composed in the untrusted RENDERER and carries the
 * user's REAL un-redacted data. Containment, enumerated and pinned in `pdfSkeleton.test.ts`:
 * its own renderer PROCESS with no preload; `javascript: false`; a dedicated in-memory
 * session that CANCELS every request but the one document (+ inert `data:`) under
 * {@link PDF_CSP}, so egress is impossible; nothing touches the disk (served from MEMORY,
 * bytes back over IPC); navigation refused; fail closed on error or timeout, no partial PDF.
 * Nothing is logged: the HTML and the title are real user data.
 */

/** The document being printed, served by the protocol handler. One render in flight
 *  ({@link queue}), so a single slot is safe. */
let current: Buffer | null = null;
let printSession: Session | null = null;
/** Renders are serialised (each spawns a renderer process); `pending` bounds the queue. */
let queue: Promise<unknown> = Promise.resolve();
let pending = 0;
/** `undefined` = not resolved yet, `null` = no bundled font on this install. */
let fontB64: string | null | undefined;

/** The bundled brand font, the SAME file the Python runtime ships (rule 9). Absent ⇒ a
 *  system sans. */
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

/** The isolated session, created once: in-memory, no cache, one document, every other
 *  request cancelled. */
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

/** Serialised entry point: one render at a time, a BOUNDED queue, a failure never poisons it. */
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
