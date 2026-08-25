import { ipcMain } from "electron";
import { renderHtmlToPdf } from "./htmlPdf";
import { validatePdfRequest } from "./pdfSkeleton";

/**
 * `pdf:render-html` — the renderer hands over a document's HTML + print CSS and gets PDF
 * bytes back. The payload is validated main-side (`validatePdfRequest`) and rendered in an
 * isolated, script-less, network-less window (`htmlPdf.ts`). Nothing is written to disk and
 * nothing is logged: both the markup and the title are the user's real data.
 *
 * There is no capability to gate here beyond the caps — the handler grants the renderer
 * strictly less than it already has (it starts from bytes the renderer supplied and returns
 * bytes; it reads no file, reaches no host, touches no store). A failure REJECTS so the
 * caller falls back to the on-device pdf-lib exporter.
 */

let registered = false;

export function registerPdfIpc(): void {
  if (registered) return;
  registered = true;
  ipcMain.handle("pdf:render-html", async (_e, payload: unknown): Promise<Uint8Array> =>
    renderHtmlToPdf(validatePdfRequest(payload)),
  );
}
