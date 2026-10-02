import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A fake worker: every posted request is answered by the test through `worker.emit("message")`.
class FakeWorker extends EventEmitter {
  posted: { id: number }[] = [];
  stdout = null;
  stderr = null;
  postMessage(m: { id: number }) {
    this.posted.push(m);
  }
  kill() {}
}
let worker: FakeWorker;
vi.mock("electron", () => ({
  app: { isPackaged: false },
  utilityProcess: { fork: () => (worker = new FakeWorker()) },
}));
vi.mock("@openmasq/redact/documents", () => ({
  extractText: vi.fn(async () => ({ name: "in-process", kind: "pdf", text: "", chars: 0 })),
  extractBytes: vi.fn(),
}));
vi.mock("../runtime/errorReport", () => ({ reportMainError: vi.fn() }));
vi.mock("../runtime/quitState", () => ({ isAppQuitting: () => false }));
vi.mock("@openmasq/branding", () => ({ BRAND: { slug: "test" } }));

import { extractTextInWorker } from "./extractClient";

const MIN = 60_000;
const file = { name: "f.pdf", kind: "pdf", text: "ok", chars: 2 };

/** An attachment is OCR'd whole: the timeout bounds a SILENT worker, not a long document. */
describe("extraction worker timeout", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    // One served request first, so a later failure is not taken for a worker that never booted.
    const first = extractTextInWorker("/a.pdf");
    await vi.advanceTimersByTimeAsync(0);
    worker.emit("message", { id: worker.posted.at(-1)!.id, ok: true, file });
    await first;
  });
  afterEach(() => vi.useRealTimers());

  it("a long OCR that keeps reporting pages is not cut off", async () => {
    const run = extractTextInWorker("/scan.pdf", undefined, true);
    await vi.advanceTimersByTimeAsync(0);
    const id = worker.posted.at(-1)!.id;
    for (let page = 1; page <= 5; page++) {
      await vi.advanceTimersByTimeAsync(5 * MIN); // 25 min in total, a page every 5 min
      worker.emit("message", { id, progress: { done: page, pages: 5 } });
    }
    worker.emit("message", { id, ok: true, file });
    await expect(run).resolves.toEqual(file);
  });

  it("a worker that goes silent is still cut off", async () => {
    const run = extractTextInWorker("/stuck.pdf", undefined, true);
    const settled = run.catch((e: Error) => e);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(6 * MIN + 1);
    expect(String(await settled)).toContain("délai dépassé");
  });
});
