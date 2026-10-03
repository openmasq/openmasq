import { describe, it, expect } from "vitest";
import { planRetryResend, retryTagPrompt } from "./retryResend";

describe("planRetryResend — a retry never leaves with PART of its documents", () => {
  const TEXT = "compare ces deux contrats";
  const FOLDED = `${TEXT}\n\n=== Attached file: document-1.pdf ===\nBail A\n\n=== Attached file: document-2.pdf ===\nBail B`;
  const A = { name: "a.pdf", text: "Bail A" };
  const B = { name: "b.pdf", text: "Bail B" };

  it("folds the rebuilt files when EVERY attached document came back with text", () => {
    expect(planRetryResend(TEXT, FOLDED, ["a.pdf", "b.pdf"], [B, A])).toEqual({ kind: "files", files: [A, B] });
  });

  it("one of two files fails to reload → the FULL persisted payload, never the partial set", () => {
    const plan = planRetryResend(TEXT, FOLDED, ["a.pdf", "b.pdf"], [A]);
    expect(plan).toEqual({ kind: "wire", resendWire: FOLDED });
    expect(plan.kind === "wire" && plan.resendWire).toContain("Bail B");
  });

  it("one of two files fails and no payload survives → BLOCKED, naming the missing file", () => {
    expect(planRetryResend(TEXT, undefined, ["a.pdf", "b.pdf"], [A])).toEqual({ kind: "blocked", missing: ["b.pdf"] });
    expect(planRetryResend(TEXT, TEXT, ["a.pdf", "b.pdf"], [A])).toEqual({ kind: "blocked", missing: ["b.pdf"] });
  });

  it("a rebuilt file with EMPTY text counts as missing (extraction failed)", () => {
    expect(planRetryResend(TEXT, FOLDED, ["a.pdf", "b.pdf"], [A, { name: "b.pdf", text: "  " }])).toEqual({
      kind: "wire",
      resendWire: FOLDED,
    });
  });

  it("no library at all (no DB, redaction off) → the persisted payload, else blocked", () => {
    expect(planRetryResend(TEXT, FOLDED, ["a.pdf"], undefined)).toEqual({ kind: "wire", resendWire: FOLDED });
    expect(planRetryResend(TEXT, undefined, ["a.pdf"], undefined)).toEqual({ kind: "blocked", missing: ["a.pdf"] });
  });

  it("matches ONE file per attached name: a library duplicate never rides twice, two same-name attachments need two", () => {
    const old = { name: "a.pdf", text: "Bail A, ancienne version" };
    expect(planRetryResend(TEXT, FOLDED, ["a.pdf"], [A, old])).toEqual({ kind: "files", files: [A] });
    expect(planRetryResend(TEXT, undefined, ["a.pdf", "a.pdf"], [A])).toEqual({ kind: "blocked", missing: ["a.pdf"] });
  });

  it("a turn with no document: the typed text, or its persisted payload when one differs (compétence prefix)", () => {
    expect(planRetryResend(TEXT, undefined, [], undefined)).toEqual({ kind: "text" });
    expect(planRetryResend(TEXT, `  ${TEXT}  `, [], undefined)).toEqual({ kind: "text" });
    expect(planRetryResend(TEXT, `Consigne\n${TEXT}`, [], undefined)).toEqual({ kind: "wire", resendWire: `Consigne\n${TEXT}` });
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
