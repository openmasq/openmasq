import { describe, it, expect } from "vitest";
import { retryResendWire, retryTagPrompt } from "./retryResend";

describe("retryResendWire", () => {
  const TEXT = "fais un graphe de ce bilan";
  const FOLDED = `${TEXT}\n\n=== Attached file: document-1.pdf ===\nRecettes 120000 Dépenses 90000`;

  it("uses the file fold when the library rebuild recovered the document text", () => {
    // Happy path: at least one rebuilt file carries text → no resend override.
    expect(retryResendWire(TEXT, FOLDED, [{ text: FOLDED }])).toBeUndefined();
    expect(retryResendWire(TEXT, FOLDED, [{ text: "some doc text" }])).toBeUndefined();
  });

  it("falls back to modelContent when the library rebuild yielded NO files (redaction off / no DB / name mismatch)", () => {
    expect(retryResendWire(TEXT, FOLDED, undefined)).toBe(FOLDED);
    expect(retryResendWire(TEXT, FOLDED, [])).toBe(FOLDED);
  });

  it("falls back to modelContent when the rebuilt files have EMPTY text (extraction failed)", () => {
    expect(retryResendWire(TEXT, FOLDED, [{ text: "" }])).toBe(FOLDED);
    expect(retryResendWire(TEXT, FOLDED, [{ text: "   " }])).toBe(FOLDED);
  });

  it("does not resend when there is no persisted modelContent (a plain text turn)", () => {
    expect(retryResendWire(TEXT, undefined, undefined)).toBeUndefined();
    expect(retryResendWire(TEXT, undefined, [])).toBeUndefined();
  });

  it("does not resend when modelContent is just the clean text (no document was folded)", () => {
    expect(retryResendWire(TEXT, TEXT, undefined)).toBeUndefined();
    expect(retryResendWire(TEXT, `  ${TEXT}  `, [])).toBeUndefined();
  });

  it("prefers the real document text over an empty-text rebuild (the reported bug)", () => {
    // The exact failure: a plot request over a PDF, retried, whose library file was
    // not recoverable — the document must still reach the model via modelContent.
    const resend = retryResendWire(TEXT, FOLDED, [{ text: "" }]);
    expect(resend).toContain("Recettes 120000");
    expect(resend).toContain("Dépenses 90000");
  });
});

describe("retryTagPrompt (compétence/workflow instruction on a retry)", () => {
  it("drops the prompt when a resendWire carries it already (never send it twice)", () => {
    expect(retryTagPrompt("<wire with prefix>", "snapshot", "current")).toBeUndefined();
  });

  it("REGRESSION: without a resendWire the prompt is RE-SUPPLIED — snapshot first", () => {
    // The reported failure: retry right after a reload (modelContent stripped from
    // the plaintext copy, DB merge not landed) sent the BARE text — the model
    // greeted back instead of running the workflow.
    expect(retryTagPrompt(undefined, "snapshot", "current")).toBe("snapshot");
  });

  it("falls back to today's version by id when the snapshot prompt is gone too", () => {
    expect(retryTagPrompt(undefined, undefined, "current")).toBe("current");
  });

  it("returns undefined when neither source exists (deleted workflow, no snapshot)", () => {
    expect(retryTagPrompt(undefined, undefined, undefined)).toBeUndefined();
  });
});
