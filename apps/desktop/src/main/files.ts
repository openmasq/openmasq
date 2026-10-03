import { dialog, BrowserWindow } from "electron";
import { SUPPORTED_EXTENSIONS, type ExtractedFile, type ExtractStreamEvent } from "@openmasq/redact/documents";
import {
  extractTextInWorker as extractText,
  extractBytesInWorker as extractBytes,
} from "./ocr/extractClient";
import { mainMessages } from "./i18n";

/**
 * File attachments for the desktop app. The text extraction + document
 * redaction lives in @openmasq/redact (shared, unit-tested) — run in the
 * extraction WORKER (`ocr/extractClient.ts`): in main, the per-page loop of a
 * scan blocked IPC in ~1 s bursts (measured 13/08). This module owns the
 * Electron-specific bits — the native file picker and batch extraction over chosen
 * paths — and the worker inherits the best-effort contract (a failure returns `{error}`).
 */

export type { ExtractedFile };
export { extractBytes };

const MIME: Record<string, string> = {
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  json: "application/json",
  txt: "text/plain",
  md: "text/markdown",
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  bmp: "image/bmp",
  tiff: "image/tiff",
  tif: "image/tiff",
  gif: "image/gif",
};
const mimeFor = (name: string): string =>
  MIME[name.slice(name.lastIndexOf(".") + 1).toLowerCase()] ?? "application/octet-stream";

/** Per-file OCR progress: `(name, pagesRead, pagesTotal, meta)` — relayed over IPC
 *  to the renderer (the attachment chip displays « OCR… page x/y »). `meta.queued`: the
 *  file is waiting its turn with that many ahead (`ocr/extractQueue.ts`); `meta.path`:
 *  which file, when two picked files share a name. */
export type OcrProgressFn = (
  name: string,
  page: number,
  pages: number,
  meta?: { queued?: number; path?: string },
) => void;

/** The preview stream of one file being read (pages, thumbnails — `ocr/extractStream.ts`). */
export type ExtractStreamFn = (ev: ExtractStreamEvent, file: { name: string; path?: string }) => void;

/** Extract + tag each result with its source `path` and `mime`, so the renderer
 *  can later store the original file (hidden-mode redaction). */
async function extractTagged(path: string, onProgress?: OcrProgressFn, onStream?: ExtractStreamFn): Promise<ExtractedFile> {
  const name = path.split(/[\\/]/).pop() || path;
  const extracted = await extractText(
    path,
    (done, pages) => onProgress?.(name, done, pages, { path }),
    (ahead) => onProgress?.(name, 0, 0, { queued: ahead, path }),
    onStream ? (ev) => onStream(ev, { name, path }) : undefined,
  );
  return { ...extracted, path, mime: mimeFor(path) };
}

/** The native picker's options: multi-select, documents first, in main's language. */
function pickerOptions(): Electron.OpenDialogOptions {
  const t = mainMessages().desktopMain.filePicker;
  return {
    title: t.title,
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: t.documents, extensions: SUPPORTED_EXTENSIONS },
      { name: t.allFiles, extensions: ["*"] },
    ],
  };
}

export async function pickAndExtract(onProgress?: OcrProgressFn): Promise<ExtractedFile[]> {
  const win = BrowserWindow.getFocusedWindow();
  const opts = pickerOptions();
  const res = win
    ? await dialog.showOpenDialog(win, opts)
    : await dialog.showOpenDialog(opts);
  if (res.canceled) return [];
  return Promise.all(res.filePaths.map((p) => extractTagged(p, onProgress)));
}

export async function extractPaths(
  paths: string[],
  onProgress?: OcrProgressFn,
  onStream?: ExtractStreamFn,
): Promise<ExtractedFile[]> {
  return Promise.all(paths.map((p) => extractTagged(p, onProgress, onStream)));
}

/** Just the native picker — returns the chosen paths (+ basenames) WITHOUT extracting.
 *  Lets the renderer show a chip INSTANTLY, then `extractPaths` fills text async (a big
 *  PDF / scanned-doc OCR can take seconds — the file shouldn't wait to appear). */
export async function pickPaths(): Promise<{ name: string; path: string }[]> {
  const win = BrowserWindow.getFocusedWindow();
  const opts = pickerOptions();
  const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
  if (res.canceled) return [];
  return res.filePaths.map((p) => ({ name: p.split(/[\\/]/).pop() || p, path: p }));
}
