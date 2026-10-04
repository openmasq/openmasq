import { afterEach, describe, expect, it, vi } from "vitest";
import { getMessages } from "@openmasq/i18n";
import { MAX_MASK_CHARS, maskTimeoutMs, pseudonymize, type Detection } from "@openmasq/redact";
import type { RedactFn } from "../../send/redactionEngine";
import { createJobQueue } from "../../state/files/maskQueue";
import type { Attachment } from "./Composer";
import { redactAttachment } from "./redactAttachment";
import type { StagedStore } from "./stagedStore";
import { checkSubmit } from "./submitGuard";

const t = getMessages("fr");
const NAME = "Ninon Verdolini";
const EMAIL = "ninon.verdolini@cabinet-exemple.fr";

/** Past the former 50,000-character wire cut: a value seen only here must still be masked. */
const LATE = 50_000;

/** A document whose sensitive values FIRST appear past {@link LATE} characters. */
function lateValueDoc(): string {
  const filler = "Clause sans donnée personnelle, reprise pour le volume du document.\n".repeat(
    Math.ceil((LATE + 10_000) / 69),
  );
  return `${filler}Signé par ${NAME}, joignable à ${EMAIL}.\n`;
}

/** The real engine, with a stand-in for the offline NER that finds the name where it is. */
const engineWithNer: RedactFn = (text, _signal, vault) =>
  pseudonymize(text, {
    vault,
    numbers: false,
    detectLocal: async (): Promise<Detection[]> => (text.includes(NAME) ? [{ value: NAME, category: "name" }] : []),
  });

/** A one-chip staging under key "k", and a fresh queue. `state` reads the chip live. */
function harness(a: Attachment, redactAsync: RedactFn) {
  const byKey: Record<string, readonly Attachment[]> = { k: [a] };
  const store: StagedStore = { get: (k) => byKey[k] ?? [], set: (k, v) => void (byKey[k] = v) };
  const queue = createJobQueue();
  redactAttachment(a, { settings: undefined, redactAsync, store, stagedKey: "k", queue, t });
  const state = new Proxy({} as Partial<Attachment>, { get: (_o, p) => (byKey.k[0] as unknown as Record<string | symbol, unknown>)?.[p] });
  return { state, queue, store, byKey, chip: () => byKey.k[0] };
}

const file = (text: string): Attachment => ({ name: "contrat.docx", kind: "docx", text, chars: text.length, redactPreview: 0, cid: "c1" });
const settle = () => new Promise((r) => setTimeout(r, 0));
const until = async (cond: () => boolean) => {
  for (let i = 0; i < 400 && !cond(); i++) await settle();
};

afterEach(() => vi.useRealTimers());

describe("drop-time masking covers the WHOLE document", () => {
  it("a value that first appears past the wire cut IS in the map the send and the library reuse", async () => {
    const text = lateValueDoc();
    expect(text.indexOf(NAME)).toBeGreaterThan(LATE);
    const { state } = harness(file(text), engineWithNer);
    await until(() => state.redacting === false);
    expect(state.redactError).toBeUndefined();
    const reals = (state.replacements ?? []).map((r) => r.real);
    expect(reals).toContain(NAME);
    expect(reals).toContain(EMAIL);
    expect(state.redactPreview).toBe(state.replacements!.length);
  });
});

describe("a document too long to mask in full is REFUSED, never masked in part", () => {
  it("no engine run, no map, a stated reason — and the send refuses it", () => {
    const redactAsync = vi.fn(engineWithNer);
    const text = "x".repeat(MAX_MASK_CHARS + 1);
    const { state, chip } = harness({ ...file(text), replacements: [{ real: "a", fake: "b", tone: "x" }] }, redactAsync);
    expect(redactAsync).not.toHaveBeenCalled();
    expect(state.redacting).toBe(false);
    expect(state.replacements).toBeUndefined();
    expect(state.redactError).toBe(t.composer.attachments.tooLongToMask(Math.round((MAX_MASK_CHARS + 1) / 3000)));
    expect(state.redactError).toContain("Découpez-le");
    expect(checkSubmit({ text: "résume", attachments: [chip()], t }).kind).toBe("refuse");
  });
});

describe("drop-time masking has a deadline", () => {
  it("a run past it FAILS the chip (never sendable unmasked) and frees the slot", async () => {
    vi.useFakeTimers();
    const stuck: RedactFn = () => new Promise(() => {}); // a wedged detector
    const text = "Clause.\n".repeat(100);
    const { state, queue, chip } = harness(file(text), stuck);
    expect(state.redacting).toBe(true);
    await vi.advanceTimersByTimeAsync(maskTimeoutMs(text.length) - 1);
    expect(state.redacting).toBe(true);
    await vi.advanceTimersByTimeAsync(2);
    expect(state.redacting).toBe(false);
    expect(state.replacements).toBeUndefined();
    expect(state.redactError).toBe(t.runtime.send.maskFail.timeout);
    expect(queue.has("c1")).toBe(false);
    expect(checkSubmit({ text: "résume", attachments: [chip()], t }).kind).toBe("refuse");
  });

  it("removing the chip cancels quietly — no error, no late timeout", async () => {
    vi.useFakeTimers();
    const text = "Clause.\n".repeat(100);
    const { state, queue } = harness(file(text), () => new Promise(() => {}));
    queue.cancel("c1");
    await vi.advanceTimersByTimeAsync(maskTimeoutMs(text.length) + 1);
    expect(state.redactError).toBeUndefined();
  });
});

describe("masking runs ONE file at a time, and outlives the screen", () => {
  /** Two chips staged under "k" on one queue, with an engine whose runs we release by hand. */
  function twoFiles() {
    const a = { ...file("Clause A.\n".repeat(50)), cid: "a" };
    const b = { ...file("Clause B.\n".repeat(50)), cid: "b" };
    const byKey: Record<string, readonly Attachment[]> = { k: [a, b] };
    const store: StagedStore = { get: (k) => byKey[k] ?? [], set: (k, v) => void (byKey[k] = v) };
    const queue = createJobQueue();
    const release: (() => void)[] = [];
    const calls: string[] = [];
    const redactAsync: RedactFn = (text) => {
      calls.push(text.includes("Clause A") ? "a" : "b");
      return new Promise((r) => release.push(() => r({ text, matches: [] })));
    };
    const deps = { settings: undefined, redactAsync, store, stagedKey: "k", queue, t };
    const chip = (cid: string) => byKey.k.find((x) => x.cid === cid);
    return { a, b, byKey, store, queue, release, calls, deps, chip };
  }

  it("the second file WAITS (« 1 avant ») while the first is masked, then runs", async () => {
    const h = twoFiles();
    redactAttachment(h.a, h.deps);
    redactAttachment(h.b, h.deps);
    await settle();
    expect(h.calls).toEqual(["a"]); // never two runs on the one detector
    expect(h.chip("b")).toMatchObject({ redacting: true, maskQueued: 1 });
    expect(h.chip("a")?.maskQueued).toBeUndefined();
    h.release.shift()!();
    await until(() => h.calls.length === 2);
    expect(h.chip("a")).toMatchObject({ redacting: false, replacements: [] });
    expect(h.calls).toEqual(["a", "b"]);
    expect(h.chip("b")?.maskQueued).toBeUndefined();
    h.release.shift()!();
    await until(() => h.chip("b")?.redacting === false);
    expect(h.chip("b")?.redactError).toBeUndefined();
  });

  it("removing the RUNNING chip frees the detector for the next one at once", async () => {
    const h = twoFiles();
    redactAttachment(h.a, h.deps);
    redactAttachment(h.b, h.deps);
    await settle();
    h.byKey.k = h.byKey.k.filter((x) => x.cid !== "a");
    h.queue.cancel("a");
    await until(() => h.calls.length === 2);
    expect(h.calls).toEqual(["a", "b"]);
  });

  it("a run lands in ITS conversation's staging, whatever is on screen — no restart", async () => {
    const h = twoFiles();
    redactAttachment(h.a, h.deps);
    await settle();
    // The user went elsewhere: nothing re-queues it; the run keeps going and lands under "k".
    expect(h.queue.has("a")).toBe(true);
    h.release.shift()!();
    await until(() => h.chip("a")?.redacting === false);
    expect(h.calls).toEqual(["a"]); // ran ONCE
    expect(h.chip("a")?.replacements).toEqual([]);
  });

  it("a chip no longer staged (conversation deleted) stops its run and writes nothing", async () => {
    const h = twoFiles();
    redactAttachment(h.a, h.deps);
    await settle();
    h.byKey.k = [];
    h.queue.cancelGroup("k");
    h.release.shift()?.();
    await settle();
    expect(h.byKey.k).toEqual([]);
    expect(h.queue.has("a")).toBe(false);
  });
});

describe("the progressive preview's partial map", () => {
  it("is set while a long document is masked, measured ETA included — and gone once the real map lands", async () => {
    const text = `${NAME} signe.\n${"Clause sans donnée personnelle.\n".repeat(600)}`;
    const snaps: Attachment[] = [];
    const a = file(text);
    const byKey: Record<string, readonly Attachment[]> = { k: [a] };
    const store: StagedStore = {
      get: (k) => byKey[k] ?? [],
      set: (k, v) => {
        byKey[k] = v;
        snaps.push(v[0]);
      },
    };
    redactAttachment(a, { settings: undefined, redactAsync: engineWithNer, store, stagedKey: "k", queue: createJobQueue(), t });
    await until(() => byKey.k[0].redacting === false);
    const mid = snaps.find((s) => s.maskedSoFar);
    expect(mid?.maskedSoFar?.replacements.map((r) => r.real)).toContain(NAME);
    expect(mid?.replacements).toBeUndefined(); // never the map the send reuses
    expect(mid?.redactProgress?.etaMs).toBeTypeOf("number");
    expect(byKey.k[0].maskedSoFar).toBeUndefined();
    expect(byKey.k[0].replacements?.map((r) => r.real)).toContain(NAME);
  });
});
