// ocrPdf inside an Electron utilityProcess (the extraction worker): pdf.js decides it is NOT
// Node there and, left to its defaults, renders an image page through `document`, which does
// not exist — the OCR of every page painting an image failed. `pdfFactories.ts`.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { PDFDocument } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("./ocr", () => ({
  ocrImageLayout: vi.fn(async () => ({ text: "lu", words: [], meta: { engine: "stub", ms: 0 }, width: 1, height: 1 })),
}));

const proc = process as unknown as { type?: string };
const hadElectron = "electron" in process.versions;

beforeAll(() => {
  // What pdf.js's `isNodeJS` sees in a utilityProcess, set BEFORE it is first imported.
  proc.type = "utility";
  if (!hadElectron) Object.defineProperty(process.versions, "electron", { value: "38.0.0", configurable: true });
  vi.resetModules();
});
afterAll(() => {
  delete proc.type;
  if (!hadElectron) Reflect.deleteProperty(process.versions, "electron");
});

async function pdfWithImagePage(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const png = await doc.embedPng(readFileSync(join(__dirname, "../__fixtures__/business-card.png")));
  const page = doc.addPage([400, 300]);
  page.drawImage(png, { x: 20, y: 20, width: 360, height: 260 });
  return doc.save();
}

describe("ocrPdf in a utilityProcess", () => {
  it("renders an image page without a DOM", async () => {
    expect(typeof (globalThis as { document?: unknown }).document).toBe("undefined");
    // As the extraction worker does (`apps/desktop/src/main/ocr/extractWorker.ts`): off "Node",
    // pdf.js needs its worker script named.
    // @ts-ignore — legacy build subpath ships no bundled types
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs")).href;
    const { ocrPdf } = await import("./pdf");
    const res = await ocrPdf(await pdfWithImagePage());
    expect(res.text).toBe("lu");
    expect(res.meta.pages).toBe(1);
  }, 30_000);
});
