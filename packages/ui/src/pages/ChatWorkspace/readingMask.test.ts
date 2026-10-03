// The masking of a PDF started while it is READ (`readingMask.ts`), continued by the file's
// run (`redactAttachment.ts`). What it must hold: the final map is the whole-text map, no page
// is masked twice, nothing provisional reaches `replacements`, the send waits for the WHOLE
// document, and a failure falls back to a whole run (never less).
import { describe, expect, it, vi } from "vitest";
import { getMessages } from "@openmasq/i18n";
import { pseudonymize, type Detection } from "@openmasq/redact";
import { pdfReplacements } from "@openmasq/redact/pdf-redact";
import { redactedFromReplacements } from "../../containers/modals/viewers/doc/redactedPreview";
import type { ExtractStream } from "../../host";
import type { RedactFn } from "../../send/redactionEngine";
import { createJobQueue } from "../../state/files/maskQueue";
import type { Settings } from "../../types";
import type { Attachment } from "./Composer";
import { isPreviewPending } from "./attachmentPending";
import { startReadingMask } from "./readingMask";
import { redactAttachment } from "./redactAttachment";
import type { StagedStore } from "./stagedStore";

const t = getMessages("fr");
const NAME = "Ninon Verdolini";
const filler = (i: number) => `Clause ${i} sans donnée personnelle, reprise pour le volume du relevé. `.repeat(40);
// The NAME is on page 3 in a context the detector misses, and on page 20 where it finds it.
const PAGES = Array.from({ length: 22 }, (_, i) =>
  i === 2 ? `${filler(i)} ${NAME} ${filler(i)}` : i === 19 ? `Emprunteur : ${NAME}.\n${filler(i)}` : filler(i),
);
const WHOLE = PAGES.join("\n\f\n").trim();

/** The real engine, with a NER stand-in that only recognises the name in its labelled context. */
const engine: RedactFn = (text, _signal, vault) =>
  pseudonymize(text, {
    vault,
    numbers: false,
    detectLocal: async (): Promise<Detection[]> =>
      text.includes(`Emprunteur : ${NAME}`) ? [{ value: NAME, category: "name" }] : [],
  });
const local = { redactEngine: "local" } as Settings;

function harness(redactAsync: RedactFn, settings: Settings | undefined = local) {
  const chip: Attachment = { name: "releve.pdf", kind: "", text: "", chars: 0, redactPreview: 0, cid: "c1", extracting: true };
  const byKey: Record<string, readonly Attachment[]> = { k: [chip] };
  const store: StagedStore = { get: (k) => byKey[k] ?? [], set: (k, v) => void (byKey[k] = v) };
  const queue = createJobQueue();
  const session = startReadingMask({ cid: "c1", store, stagedKey: "k", settings, redactAsync, queue });
  const chipNow = () => byKey.k[0];
  /** The read ends: the chip gets its text and its run starts (as `deferredAttach` does). */
  const readEnds = (deps: Partial<Parameters<typeof redactAttachment>[1]> = {}) => {
    session.end(true);
    const a = { ...chipNow(), text: WHOLE, chars: WHOLE.length, extracting: false, redacting: true };
    byKey.k = [a];
    redactAttachment(a, { settings, redactAsync, store, stagedKey: "k", queue, t, ...deps });
  };
  return { session, queue, byKey, chip: chipNow, readEnds };
}
const page = (n: number, text?: string, read = true): ExtractStream => ({
  name: "releve.pdf",
  page: { n, total: PAGES.length, read, ...(text !== undefined ? { text } : {}) },
});
const settle = () => new Promise((r) => setTimeout(r, 0));
const until = async (cond: () => boolean) => {
  for (let i = 0; i < 2000 && !cond(); i++) await settle();
};
/** The early run has nothing left to do (a finished job re-queues on the next tick). */
const drained = async (queue: { has(k: string): boolean }) => {
  for (let i = 0; i < 50; i++) {
    await until(() => !queue.has("reading:c1"));
    await settle();
    await settle();
    if (!queue.has("reading:c1")) return;
  }
};

describe("readingMask — the file's masking, started while it is read", () => {
  it("masks pages as they arrive, and the file's run only does the tail: no page masked twice", async () => {
    const whole = vi.fn(engine);
    await pdfReplacements(WHOLE, whole, {});
    const calls = vi.fn(engine);
    const h = harness(calls);
    for (const [i, p] of PAGES.entries()) h.session.push(page(i + 1, p));
    await drained(h.queue);
    const early = calls.mock.calls.length;
    expect(early).toBeGreaterThan(0); // work happened DURING the read
    expect(h.chip()?.replacements).toBeUndefined(); // …but nothing the send may use
    h.readEnds();
    await until(() => h.chip()?.redacting === false);
    // Exactly the chunks a whole-text run masks: none twice, none skipped.
    expect(calls.mock.calls.map((c) => c[0])).toEqual(whole.mock.calls.map((c) => c[0]));
    expect(calls.mock.calls.length).toBeGreaterThan(early);
  });

  it("the final map is the whole-text map: a value found on page 20 masks page 3 too", async () => {
    const expected = await pdfReplacements(WHOLE, engine, {});
    const h = harness(engine);
    for (const [i, p] of PAGES.entries()) h.session.push(page(i + 1, p));
    h.readEnds();
    await until(() => h.chip()?.redacting === false);
    const reps = h.chip()?.replacements ?? [];
    expect(reps.map((r) => r.real).sort()).toEqual(expected.replacements.map((r) => r.real).sort());
    expect(reps.map((r) => r.real)).toContain(NAME);
    // Page 3 — before the detector ever saw the name — is masked in the final text.
    expect(redactedFromReplacements(PAGES[2], reps)).not.toContain(NAME);
  });

  it("the send waits for the WHOLE document: pending until the run ends, even with every page shown", async () => {
    const h = harness(engine);
    for (const [i, p] of PAGES.entries()) h.session.push(page(i + 1, p));
    await drained(h.queue);
    expect(h.chip()?.reading?.mask?.replacements.length ?? 0).toBeGreaterThan(0);
    expect(isPreviewPending(h.chip()!)).toBe(true);
    h.readEnds();
    expect(isPreviewPending(h.chip()!)).toBe(true);
    await until(() => h.chip()?.redacting === false);
    expect(isPreviewPending(h.chip()!)).toBe(false);
    expect(h.chip()?.reading).toBeUndefined(); // the provisional state ends with the run
  });

  it("a detector error stops the early run and shows nothing masked; the file's run starts over", async () => {
    let fail = true;
    const flaky: RedactFn = async (text, s, v) => (fail ? { text, matches: [], modelError: "ner down" } : engine(text, s, v));
    const calls = vi.fn(flaky);
    const h = harness(calls);
    for (const [i, p] of PAGES.entries()) h.session.push(page(i + 1, p));
    await drained(h.queue);
    expect(h.chip()?.reading?.mask).toBeUndefined();
    fail = false;
    const before = calls.mock.calls.length;
    h.readEnds();
    await until(() => h.chip()?.redacting === false);
    // Whole text from the first chunk: the failed early run handed nothing over.
    expect(calls.mock.calls[before]?.[0]).toBe(WHOLE.slice(0, calls.mock.calls[before]?.[0].length));
    expect(h.chip()?.replacements?.map((r) => r.real)).toContain(NAME);
  });

  it("settings changed between the read and the run: the early map is not reused", async () => {
    const calls = vi.fn(engine);
    const h = harness(calls);
    for (const [i, p] of PAGES.entries()) h.session.push(page(i + 1, p));
    await drained(h.queue);
    const before = calls.mock.calls.length;
    h.readEnds({ settings: { redactEngine: "local", redactWireTokens: true } as Settings });
    await until(() => h.chip()?.redacting === false);
    expect(calls.mock.calls[before]?.[0]).toBe(WHOLE.slice(0, calls.mock.calls[before]?.[0].length));
  });

  it("a failed read drops everything it streamed", async () => {
    const h = harness(engine);
    h.session.push({ name: "releve.pdf", thumb: { n: 1, total: 3, src: "data:image/png;base64,AAAA" } });
    h.session.push(page(1, PAGES[0]));
    h.session.end(false);
    expect(h.chip()?.reading).toBeUndefined();
    expect(h.queue.has("reading:c1")).toBe(false);
  });

  it("the chip removed: the job is cancelled and later pages are ignored", async () => {
    const calls = vi.fn(engine);
    const h = harness(calls);
    h.session.push(page(1, PAGES[0]));
    h.byKey.k = []; // removed
    h.session.push(page(2, PAGES[1])); // the patch misses → the session stops
    await settle();
    const n = calls.mock.calls.length;
    for (let i = 3; i <= 10; i++) h.session.push(page(i, PAGES[i - 1]));
    await settle();
    expect(calls.mock.calls.length).toBe(n);
    expect(h.queue.has("reading:c1")).toBe(false);
  });

  it("a drop's bytes reach the chip only once the extraction streams (it accepted the file)", () => {
    const h = harness(engine);
    h.session.bytes("JVBERi0=");
    expect(h.chip()?.data).toBeUndefined();
    h.session.push(page(1, undefined, false));
    expect(h.chip()?.data).toBe("JVBERi0=");
  });
});
