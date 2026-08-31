// utilityProcess child: document EXTRACTION (pdf.js + docTR/Tesseract OCR + the
// office parsers) runs out of the main process. Measured (13/08): a scan's per-page loop
// blocked main's event loop in bursts of ~1 s (pdf.js rasterization,
// DBNet/CTC post-processing, PNG encoding) — during an 8-page scan, ALL of IPC
// (send, settings, menus) crawled at a ~1,100 ms ping. Here, main goes back to being a relay.
// Same mechanism as `../ner/worker.ts`: fork via `utilityProcess` (no RunAsNode
// fuse), MINIMAL env (only the OCR asset paths — never a secret), and
// **never a log of the extracted text** (that's REAL PII) — the only outgoing messages
// are progress (numbers) and the structured result handed back to the parent.
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { extractText, extractBytes, type ExtractedFile } from "@openmasq/redact/documents";

// ⚠️ pdf.js (legacy) under utilityProcess: since `process.versions.electron` is set, it does
// NOT believe it's in Node and REQUIRES `GlobalWorkerOptions.workerSrc` instead of auto-loading
// its fake worker (observed: "No 'GlobalWorkerOptions.workerSrc' specified" on every
// getDocument — text AND OCR, so every PDF came back "without a text layer"). We point
// the worker at its own file, resolved from node_modules, as a `file://` URL (a
// bare path is refused by the utility process's import() — same lesson as
// `@openmasq/ort`). Set BEFORE the first message; harmless where the fake worker
// would have loaded on its own.
const requireHere = createRequire(__filename);
/** Why the pinning failed, if it failed — see `pdfjsReady`. */
let pinFailure = "";
async function pinPdfjsWorkerSrc(): Promise<void> {
  try {
    // @ts-ignore — legacy build subpath ships no bundled types
    const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const opts = pdfjs.GlobalWorkerOptions ?? pdfjs.default?.GlobalWorkerOptions;
    if (!opts) {
      pinFailure = "pdf.js n'expose pas GlobalWorkerOptions";
      return;
    }
    if (!opts.workerSrc) {
      opts.workerSrc = pathToFileURL(requireHere.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs")).href;
    }
  } catch (e) {
    // ⚠️ DO NOT SWALLOW. This pinning is the condition of existence for any PDF read
    // in this process: without it, pdf.js takes its BROWSER path and every
    // document comes back "without a text layer" — a total failure that presents as an
    // unreadable file. Measured on 15/08/2026: the silent catch cost a whole
    // investigation for a cause that fit in one log line.
    pinFailure = e instanceof Error ? e.message : String(e);
  }
  // eslint-disable-next-line no-console
  if (pinFailure) console.warn("[ocr] pdf.js workerSrc NON épinglé —", pinFailure);
}
const pdfjsReady = pinPdfjsWorkerSrc();

interface ParentPort {
  on(ev: "message", cb: (e: { data: Req }) => void): void;
  postMessage(msg: Res): void;
}
type Req =
  | { id: number; kind: "path"; path: string; ocrAllPages?: boolean }
  | { id: number; kind: "bytes"; data: string; name: string; mime?: string; ocrAllPages?: boolean };
type Res =
  | { id: number; progress: { done: number; pages: number } }
  | { id: number; ok: true; file: ExtractedFile }
  | { id: number; ok: false; error: string };
const parentPort = (process as unknown as { parentPort: ParentPort }).parentPort;

parentPort.on("message", (e) => {
  const req = e.data;
  void (async () => {
    const onProgress = (done: number, pages: number) => {
      try {
        parentPort.postMessage({ id: req.id, progress: { done, pages } });
      } catch {
        /* progress is display only — never a reason to fail */
      }
    };
    try {
      await pdfjsReady; // pdf.js's workerSrc is pinned before any getDocument
      // Both entry points are BEST-EFFORT on the redact side (an unreadable file returns
      // `{error}` without throwing); the catch only covers the unexpected (a parser OOM…).
      const file =
        req.kind === "path"
          ? await extractText(req.path, onProgress, req.ocrAllPages)
          : await extractBytes(Buffer.from(req.data, "base64"), req.name, req.mime, onProgress, req.ocrAllPages);
      parentPort.postMessage({ id: req.id, ok: true, file });
    } catch (err) {
      // A pinning failure makes EVERY PDF unreadable: say so HERE, with the error, rather
      // than leaving the user and the log to guess at a file-related cause.
      const base = err instanceof Error ? err.message : String(err);
      parentPort.postMessage({
        id: req.id,
        ok: false,
        error: pinFailure ? `${base} (pdf.js workerSrc non épinglé : ${pinFailure})` : base,
      });
    }
  })();
});
