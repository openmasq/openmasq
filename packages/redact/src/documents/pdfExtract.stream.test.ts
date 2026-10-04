// The PREVIEW stream of a PDF being read (`pdfExtract.ts` `startStream`): pages come out in
// order, with text only when it is the page's FINAL text, and the streamed pages assemble into
// the extraction's own `text`. The result itself is unchanged by streaming.
import { describe, expect, it, vi } from "vitest";
import { extractFromBytes, type ExtractDeps } from "./core";
import { PAGE_BREAK } from "./pageBreak";
import { streamedPrefix, type PageEvent } from "./pageStream";

const PDF = new TextEncoder().encode("%PDF-1.4\n% test\n");
const DENSE = (i: number) => `Page ${i} : contrat de bail entre les parties, conclu pour trois ans. `.repeat(3);

function deps(pdfText: ExtractDeps["pdfText"], ocrTexts: string[], pdfThumbnails?: ExtractDeps["pdfThumbnails"]): ExtractDeps {
  return {
    pdfText,
    docxText: async () => "",
    ocrImage: async () => "",
    ocrPdf: async (_b, onProgress, only, _m, onPage) => {
      const read = only ?? ocrTexts.map((_, i) => i + 1);
      read.forEach((n, k) => {
        onPage?.(n, ocrTexts.length, ocrTexts[n - 1]);
        onProgress?.(k + 1, read.length);
      });
      return { text: ocrTexts.join(PAGE_BREAK).trim(), meta: { engine: "stub", ms: 0, pages: read.length } };
    },
    ...(pdfThumbnails ? { pdfThumbnails } : {}),
  };
}

/** The pages' latest text, as the renderer keeps them. */
function collect(events: PageEvent[]): (string | undefined)[] {
  const texts: (string | undefined)[] = [];
  for (const e of events) if (e.text !== undefined) texts[e.n - 1] = e.text;
  return texts;
}

describe("PDF page stream", () => {
  it("a SCAN streams each OCR page with its text, in order, and they assemble into `text`", async () => {
    const ocr = ["\nJean Dupont, né le 12/03/1980", "IBAN FR76 3000 4000 0512 3456 789", "Fait à Lyon  "];
    const events: PageEvent[] = [];
    const scan = async () => ({ text: "", pages: 3, imagePages: 3 });
    const f = await extractFromBytes(PDF, { name: "scan.pdf", stream: { onPage: (e) => events.push(e) } }, deps(scan, ocr));
    expect(events.map((e) => [e.n, e.read])).toEqual([[1, true], [2, true], [3, true]]);
    expect(streamedPrefix(collect(events)).text.trim()).toBe(f.text);
  });

  it("a DIGITAL PDF streams its layer pages at once (final), then marks the OCR'd ones read — without OCR text", async () => {
    const layer = [DENSE(1), DENSE(2), DENSE(3)];
    const events: PageEvent[] = [];
    const digital = async () => ({ text: layer.join(PAGE_BREAK), pages: 3, imagePages: 0, needsOcr: [2] });
    const f = await extractFromBytes(
      PDF,
      { name: "bail.pdf", stream: { onPage: (e) => events.push(e) } },
      deps(digital, ["", "Tampon : Jean Rebour", ""]),
    );
    expect(events.slice(0, 3).map((e) => [e.n, e.read, e.text])).toEqual([
      [1, true, layer[0]],
      [2, false, layer[1]],
      [3, true, layer[2]],
    ]);
    expect(events[3]).toEqual({ n: 2, total: 3, read: true });
    expect(streamedPrefix(collect(events)).text.trim()).toBe(f.text);
    expect(f.ocrText).toBe("Tampon : Jean Rebour"); // the result is what it always was
  });

  it("a DIGITAL PDF's thin page is announced only once OCR read it, by the result's own rule", async () => {
    const SCAN = "Attestation — Ninon Verdolini, IBAN FR76 3000 4000 0512 3456 789, signée à Lyon.";
    const layer = [DENSE(1), "", DENSE(3)];
    const events: PageEvent[] = [];
    const digital = async () => ({ text: layer.join(PAGE_BREAK), pages: 3, imagePages: 0, needsOcr: [2] });
    const f = await extractFromBytes(
      PDF,
      { name: "mixte.pdf", stream: { onPage: (e) => events.push(e) } },
      deps(digital, ["", SCAN, ""]),
    );
    // Its layer is not its final text: the page is announced WITHOUT text, then with OCR's.
    expect(events[1]).toEqual({ n: 2, total: 3, read: false });
    expect(events[3]).toEqual({ n: 2, total: 3, read: true, text: SCAN });
    expect(streamedPrefix(collect(events)).text.trim()).toBe(f.text);
    expect(f.text).toContain(SCAN);
  });

  it("a SPARSE scan (layer or OCR, decided at the end) streams NO text", async () => {
    const events: PageEvent[] = [];
    const sparse = async () => ({ text: "En-tête société".padEnd(40, "."), pages: 2, imagePages: 2 });
    await extractFromBytes(PDF, { name: "form.pdf", stream: { onPage: (e) => events.push(e) } }, deps(sparse, ["a", "b"]));
    expect(events.length).toBe(2);
    expect(events.every((e) => e.text === undefined && e.read)).toBe(true);
  });

  it("thumbnails start only once the PDF passed its refusals, and stop with the read", async () => {
    let signal: AbortSignal | undefined;
    const thumbs = vi.fn(async (_b: Uint8Array, _on: unknown, s: AbortSignal) => {
      signal = s;
    });
    const scan = async () => ({ text: "", pages: 1, imagePages: 1 });
    await extractFromBytes(PDF, { name: "s.pdf", stream: { onThumb: () => {} } }, deps(scan, ["x"], thumbs));
    expect(thumbs).toHaveBeenCalledOnce();
    expect(signal?.aborted).toBe(true);
    // A refused PDF (too long to mask) is never rendered, not even small.
    thumbs.mockClear();
    const huge = async () => ({ text: "", pages: 100_000, imagePages: 100_000 });
    const refused = await extractFromBytes(PDF, { name: "h.pdf", stream: { onThumb: () => {} } }, deps(huge, [], thumbs));
    expect(refused.blocked).toBe(true);
    expect(thumbs).not.toHaveBeenCalled();
  });

  it("an OCR failure stops the stream and returns NO text (fail closed, as before)", async () => {
    let signal: AbortSignal | undefined;
    const d = deps(async () => ({ text: "", pages: 2, imagePages: 2 }), []);
    d.ocrPdf = async () => {
      throw new Error("boom");
    };
    d.pdfThumbnails = async (_b, _on, s) => {
      signal = s;
    };
    const f = await extractFromBytes(PDF, { name: "s.pdf", stream: { onThumb: () => {}, onPage: () => {} } }, d);
    expect(f.text).toBe("");
    expect(f.error).toBeTruthy();
    expect(signal?.aborted).toBe(true);
  });
});
