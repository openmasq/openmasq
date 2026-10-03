// The provisional preview of a PDF while it is READ (`readingPreview.ts`): pages masked as
// they come, PREVIEW ONLY. What it must never do: draw a value it detected, write the map the
// send uses, keep running for a chip that left, or run beside a real masking.
import { describe, expect, it, vi } from "vitest";
import { pseudonymize, type Detection } from "@openmasq/redact";
import type { ExtractStream } from "../../host";
import type { RedactFn } from "../../send/redactionEngine";
import { createJobQueue } from "../../state/files/maskQueue";
import type { Settings } from "../../types";
import type { Attachment } from "./Composer";
import { startReadingPreview } from "./readingPreview";
import type { StagedStore } from "./stagedStore";

const NAME = "Ninon Verdolini";
const EMAIL = "ninon.verdolini@cabinet-exemple.fr";
const filler = (i: number) => `Clause ${i} sans donnée personnelle, reprise pour le volume. `.repeat(10);
const PAGES = [`Emprunteur : ${NAME}.\n${filler(1)}`, `${filler(2)}\nContact : ${EMAIL}\n${filler(3)}`, filler(4)];

const engine: RedactFn = (text, _signal, vault) =>
  pseudonymize(text, {
    vault,
    numbers: false,
    detectLocal: async (): Promise<Detection[]> => (text.includes(NAME) ? [{ value: NAME, category: "name" }] : []),
  });
const local = { redactEngine: "local" } as Settings;

function harness(redactAsync: RedactFn, settings: Settings | undefined = local) {
  const chip: Attachment = { name: "scan.pdf", kind: "", text: "", chars: 0, redactPreview: 0, cid: "c1", extracting: true };
  const byKey: Record<string, readonly Attachment[]> = { k: [chip] };
  const store: StagedStore = { get: (k) => byKey[k] ?? [], set: (k, v) => void (byKey[k] = v) };
  const queue = createJobQueue();
  const session = startReadingPreview({ cid: "c1", store, stagedKey: "k", settings, redactAsync, queue });
  return { session, queue, byKey, chip: () => byKey.k[0] };
}
const page = (n: number, text?: string, read = true): ExtractStream => ({
  name: "scan.pdf",
  page: { n, total: PAGES.length, read, ...(text !== undefined ? { text } : {}) },
});
const settle = () => new Promise((r) => setTimeout(r, 0));
const until = async (cond: () => boolean) => {
  for (let i = 0; i < 400 && !cond(); i++) await settle();
};
const shown = (a: Attachment | undefined) => (a?.reading?.masked?.chunks ?? []).map((c) => c.text).join("");

describe("readingPreview — pages masked as they are read", () => {
  it("grows page by page, MASKED: a detected value never shows, only its fake", async () => {
    const h = harness(engine);
    h.session.push(page(1, PAGES[0]));
    h.session.push(page(2, PAGES[1]));
    await until(() => (h.chip()?.reading?.masked?.pages ?? 0) >= 2);
    const text = shown(h.chip());
    expect(text).toContain("Emprunteur");
    expect(text).not.toContain(NAME);
    expect(text).not.toContain(EMAIL);
    expect(h.chip()?.reading?.masked?.chunks.some((c) => c.mark)).toBe(true);
    // The last CHUNK_OVERLAP characters wait for the next page (a value may continue there).
    expect(text.endsWith(PAGES[1].trimEnd().slice(-60))).toBe(false);
    h.session.push(page(3, PAGES[2]));
    await until(() => shown(h.chip()).includes("Clause 4"));
    expect(shown(h.chip()).endsWith(PAGES[1].trimEnd().slice(-60))).toBe(false); // page 2 is whole now…
    expect(shown(h.chip())).toContain(PAGES[1].trimEnd().slice(-60)); // …and shown
    expect(shown(h.chip())).not.toContain(NAME);
  });

  it("NEVER writes the send's map: `replacements` and `maskedSoFar` stay untouched", async () => {
    const h = harness(engine);
    for (const [i, p] of PAGES.entries()) h.session.push(page(i + 1, p));
    await until(() => (h.chip()?.reading?.masked?.pages ?? 0) === 3);
    h.session.end(true);
    expect(h.chip()?.replacements).toBeUndefined();
    expect(h.chip()?.maskedSoFar).toBeUndefined();
    expect(h.chip()?.reading?.masked).toBeDefined(); // kept until the real run takes over
  });

  it("a failed or empty read drops everything it streamed", async () => {
    const h = harness(engine);
    h.session.push({ name: "scan.pdf", thumb: { n: 1, total: 3, src: "data:image/png;base64,AAAA" } });
    h.session.push(page(1, PAGES[0]));
    h.session.end(false);
    expect(h.chip()?.reading).toBeUndefined();
  });

  it("the chip removed: the run is cancelled and later pages are ignored", async () => {
    const calls = vi.fn(engine);
    const h = harness(calls);
    h.session.push(page(1, PAGES[0]));
    h.byKey.k = []; // removed
    h.session.push(page(2, PAGES[1])); // the patch misses → the session stops
    await settle();
    const n = calls.mock.calls.length;
    h.session.push(page(3, PAGES[2]));
    await settle();
    await settle();
    expect(calls.mock.calls.length).toBe(n);
    expect(h.queue.has("reading:c1")).toBe(false);
  });

  it("a detector error shows NO masked text at all (fail closed)", async () => {
    const failing: RedactFn = async (text) => ({ text, matches: [], modelError: "ner down" });
    const h = harness(failing);
    h.session.push(page(1, PAGES[0]));
    h.session.push(page(2, PAGES[1]));
    await until(() => h.chip()?.reading !== undefined && !h.queue.has("reading:c1"));
    await settle();
    expect(h.chip()?.reading?.masked).toBeUndefined();
  });

  it("an engine that is not on-device masks nothing in the preview (blurred pages only)", async () => {
    const calls = vi.fn(engine);
    const h = harness(calls, { redactEngine: "remote" } as Settings);
    h.session.push(page(1, PAGES[0]));
    await settle();
    expect(calls).not.toHaveBeenCalled();
    expect(h.chip()?.reading?.read[0]).toBe(true);
  });

  it("a real masking run preempts the preview (one detector, the real run first)", async () => {
    let aborted = false;
    const slow: RedactFn = (_t, signal) =>
      new Promise((_r, reject) =>
        signal?.addEventListener("abort", () => {
          aborted = true;
          reject(new DOMException("aborted", "AbortError"));
        }),
      );
    const h = harness(slow);
    h.session.push(page(1, PAGES[0]));
    await settle();
    let realStarted = false;
    h.queue.enqueue({ key: "c2", group: "k", run: () => new Promise<void>(() => void (realStarted = true)) });
    expect(aborted).toBe(true);
    expect(realStarted).toBe(true);
  });
});
