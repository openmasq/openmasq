// OCR of a SCANNED PDF: rasterise each page (pdfjs + @napi-rs/canvas) and route the
// raster through the docTR/Tesseract router (`./ocr` `ocrImageLayout`). Split from
// ocr.ts (LOC cap): this file owns the pdf→raster plumbing; the engines, the router
// and the traineddata pin logic stay in ocr.ts.
import { OCR_LANGS, PAGE_BREAK, type OcrMeta } from "../documents/core";
import type { OcrLayerPage } from "../documents/geometry";
import { ocrImageLayout } from "./ocr";

const DEFAULT_LANG = OCR_LANGS.join("+");

/**
 * Load `@napi-rs/canvas` and assert its native binding is USABLE. A version-
 * mismatched prebuilt binary (an older skia `.node` loaded by a newer wrapper, or a
 * platform binary electron-builder packaged inconsistently) loads WITHOUT throwing
 * but omits `GlobalFonts` — so the wrapper's own `if (!('families' in GlobalFonts))`
 * crashes with the cryptic "Cannot use 'in' operator to search for 'families' in
 * undefined". Turn that (and a missing package) into a CLEAR, actionable error so
 * the caller degrades gracefully (the document still attaches, just without OCR).
 */
async function loadCanvas(): Promise<any> {
  let mod: any;
  try {
    // The crash happens HERE, at module eval: a version-mismatched binary loads
    // without `GlobalFonts`, so the wrapper's `if (!('families' in GlobalFonts))`
    // throws "Cannot use 'in' operator … 'families' in undefined". Catch it.
    mod = await import("@napi-rs/canvas");
  } catch {
    throw new Error(
      "moteur de rendu PDF indisponible sur cet appareil (composant natif manquant) — réinstallez l'application",
    );
  }
  // CJS→ESM interop can put the exports on `.default`; accept either.
  const resolved = typeof mod?.createCanvas === "function" ? mod : (mod?.default ?? mod);
  if (typeof resolved?.createCanvas !== "function") {
    throw new Error(
      "moteur de rendu PDF incompatible sur cet appareil — réinstallez l'application",
    );
  }
  return resolved;
}

/** pdfjs v4 uses Promise.withResolvers (Node 22+); polyfill for Node 20. */
function ensureWithResolvers(): void {
  const P = Promise as unknown as { withResolvers?: unknown };
  if (typeof P.withResolvers === "function") return;
  P.withResolvers = function <T>() {
    let resolve!: (v: T | PromiseLike<T>) => void;
    let reject!: (e?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

/**
 * OCR a scanned PDF: rasterize the first `maxPages` pages to PNG (via pdfjs +
 * @napi-rs/canvas) and OCR each. Returns the joined text. Throws on failure.
 * `onProgress(done, pages)` fires once the page count is known (0/N) and after each
 * page — the per-page loop is the ONLY measurable phase of an extraction, and it's
 * also the long one (seconds per page on a scan). A progress callback that throws
 * must never break the OCR: it is advisory display, swallowed on error.
 */
export async function ocrPdf(
  buf: Uint8Array,
  lang: string = DEFAULT_LANG,
  maxPages = 10,
  onProgress?: (done: number, pages: number) => void,
): Promise<{ text: string; meta: OcrMeta; layout: OcrLayerPage[] }> {
  const t0 = Date.now();
  ensureWithResolvers();
  const canvasMod: any = await loadCanvas();
  // pdfjs touches a few DOM globals in Node — borrow them from @napi-rs/canvas.
  for (const k of ["DOMMatrix", "Path2D", "ImageData"]) {
    if (!(k in globalThis) && canvasMod[k]) (globalThis as any)[k] = canvasMod[k];
  }
  // @ts-ignore — legacy build subpath ships no bundled types
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const getDocument = pdfjs.getDocument ?? pdfjs.default?.getDocument;

  const doc = await getDocument({
    // pdf.js takes ownership of `data` and detaches its ArrayBuffer; pass a COPY so
    // the caller's `buf` isn't neutered (it may have already been through pdf.js for
    // text extraction). Without this the 2nd getDocument throws "Cannot transfer
    // object of unsupported type" — the exact scanned-PDF OCR failure.
    data: buf.slice(),
    useSystemFonts: true,
    isEvalSupported: false,
  }).promise;

  const pages = Math.min(doc.numPages, maxPages);
  const tick = (done: number) => {
    try {
      onProgress?.(done, pages);
    } catch {
      /* le progrès est de l'affichage — il n'interrompt jamais l'OCR */
    }
  };
  tick(0);
  const out: string[] = [];
  const engines = new Set<string>();
  // Per-page word boxes + raster dims — the OCR half of the cross-layer alignment
  // (`../documents/geometry`). Boxes are relative to THIS raster (scale-2 canvas).
  const layout: OcrLayerPage[] = [];
  for (let i = 1; i <= pages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = canvasMod.createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;
    const png: Uint8Array = await canvas.encode("png");
    // Route each page through the same docTR/Tesseract router; collect the engine(s) used.
    const { text, words, meta } = await ocrImageLayout(png, lang);
    engines.add(meta.engine);
    out.push(text);
    layout.push({ text, words, width: canvas.width, height: canvas.height });
    tick(i);
    page.cleanup?.();
  }
  await doc.destroy?.();
  if (doc.numPages > maxPages) {
    out.push(`[… ${doc.numPages - maxPages} page(s) supplémentaire(s) non océrisée(s)]`);
  }
  // Engine label: the single engine, or "docTR+Tesseract" when pages routed differently.
  const engine = engines.size === 1 ? [...engines][0] : [...engines].sort().join("+");
  // `pagesTotal` : le vrai nombre de pages du document, pour que l'AVAL puisse DIRE
  // qu'une lecture a été partielle (le chip « N/M pages lues ») au lieu de l'enterrer
  // dans un marqueur de texte que personne ne relit.
  return {
    text: out.join(PAGE_BREAK).trim(),
    meta: { engine, ms: Date.now() - t0, pages, pagesTotal: doc.numPages },
    layout,
  };
}
