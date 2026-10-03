import { afterEach, describe, expect, it, vi } from "vitest";
import { getMessages } from "@openmasq/i18n";
import { MAX_MASK_CHARS, maskTimeoutMs, pseudonymize, type Detection } from "@openmasq/redact";
import type { RedactFn } from "../../send/redactionEngine";
import { MAX_FILE_CHARS } from "../../send/foldPayload";
import type { Attachment } from "./Composer";
import { redactAttachment } from "./redactAttachment";
import { checkSubmit } from "./submitGuard";

const t = getMessages("fr");
const NAME = "Ninon Verdolini";
const EMAIL = "ninon.verdolini@cabinet-exemple.fr";

/** A document whose sensitive values FIRST appear past the wire cut (`MAX_FILE_CHARS`). */
function lateValueDoc(): string {
  const filler = "Clause sans donnée personnelle, reprise pour le volume du document.\n".repeat(
    Math.ceil((MAX_FILE_CHARS + 10_000) / 69),
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

function harness(a: Attachment, redactAsync: RedactFn) {
  const state: Partial<Attachment> = { ...a };
  const updateAttachment = vi.fn((_cid: string, patch: Partial<Attachment>) => Object.assign(state, patch));
  const ctrls = new Map<string, AbortController>();
  redactAttachment(a, { settings: undefined, redactAsync, ctrls, updateAttachment, t });
  return { state, ctrls, updateAttachment };
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
    expect(text.indexOf(NAME)).toBeGreaterThan(MAX_FILE_CHARS);
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
    const { state } = harness({ ...file(text), replacements: [{ real: "a", fake: "b", tone: "x" }] }, redactAsync);
    expect(redactAsync).not.toHaveBeenCalled();
    expect(state.redacting).toBe(false);
    expect(state.replacements).toBeUndefined();
    expect(state.redactError).toBe(t.composer.attachments.tooLongToMask(Math.round((MAX_MASK_CHARS + 1) / 3000)));
    expect(state.redactError).toContain("Découpez-le");
    expect(checkSubmit({ text: "résume", attachments: [state as Attachment], t }).kind).toBe("refuse");
  });
});

describe("drop-time masking has a deadline", () => {
  it("a run past it FAILS the chip (never sendable unmasked) and frees the slot", async () => {
    vi.useFakeTimers();
    const stuck: RedactFn = () => new Promise(() => {}); // a wedged detector
    const text = "Clause.\n".repeat(100);
    const { state, ctrls } = harness(file(text), stuck);
    expect(state.redacting).toBe(true);
    await vi.advanceTimersByTimeAsync(maskTimeoutMs(text.length) - 1);
    expect(state.redacting).toBe(true);
    await vi.advanceTimersByTimeAsync(2);
    expect(state.redacting).toBe(false);
    expect(state.replacements).toBeUndefined();
    expect(state.redactError).toBe(t.runtime.send.maskFail.timeout);
    expect(ctrls.has("c1")).toBe(false);
    expect(checkSubmit({ text: "résume", attachments: [state as Attachment], t }).kind).toBe("refuse");
  });

  it("removing the chip cancels quietly — no error, no late timeout", async () => {
    vi.useFakeTimers();
    const text = "Clause.\n".repeat(100);
    const { state, ctrls } = harness(file(text), () => new Promise(() => {}));
    ctrls.get("c1")!.abort();
    await vi.advanceTimersByTimeAsync(maskTimeoutMs(text.length) + 1);
    expect(state.redactError).toBeUndefined();
  });
});
