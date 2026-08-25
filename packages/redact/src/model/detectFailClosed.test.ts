import { describe, it, expect, vi } from "vitest";
import { detectWithModel, discoverSecrets } from "./detect";
import type { CompleteFn } from "../types";

/**
 * Audit H1 — the redaction model must FAIL CLOSED when it replies but produces no parseable
 * JSON array (truncated mid-reasoning, a safety refusal, or prose). Such a reply is
 * indistinguishable from a literal `[]` ("found nothing") at the value level, so
 * `detectWithModel` MUST signal `onError` — the sole channel every consumer's fail-closed
 * guard keys off (`modelError`) — instead of returning a clean `[]` that ships regex-only
 * coverage under the "model-grade" label. A genuine empty result must NOT trip the signal.
 */
describe("detectWithModel — fail-closed on an unparseable reply (audit H1)", () => {
  const cases: Array<{ name: string; reply: string }> = [
    { name: "reasoning prose with no array (gpt-oss burns its budget)", reply: "Let me think about which spans are sensitive here. The name could be…" },
    { name: "a safety refusal", reply: "I can't help with that request." },
    { name: "truncated JSON (no closing bracket) — max_tokens hit", reply: '[{"value":"Jean Morvan","category":"NAME"},{"value":"pa' },
    { name: "a non-array JSON object", reply: '{"error":"rate limited"}' },
    { name: "an empty string", reply: "" },
  ];

  for (const { name, reply } of cases) {
    it(`signals onError for: ${name}`, async () => {
      const complete = vi.fn(async () => reply) as unknown as CompleteFn;
      const onError = vi.fn();
      const dets = await detectWithModel("Contactez Jean Morvan à Paris.", complete, onError);
      expect(dets).toEqual([]); // no verbatim spans recovered
      expect(onError).toHaveBeenCalledTimes(1); // → modelError set → consumers BLOCK the send
    });
  }

  it("does NOT signal onError for a genuine empty result ([])", async () => {
    const complete = vi.fn(async () => "[]") as unknown as CompleteFn;
    const onError = vi.fn();
    const dets = await detectWithModel("Rien de sensible ici.", complete, onError);
    expect(dets).toEqual([]);
    expect(onError).not.toHaveBeenCalled(); // clean "found nothing" → send proceeds
  });

  it("does NOT signal onError for a valid non-empty result", async () => {
    const complete = vi.fn(async () => JSON.stringify([{ value: "Jean Morvan", category: "NAME" }])) as unknown as CompleteFn;
    const onError = vi.fn();
    const dets = await detectWithModel("Contactez Jean Morvan.", complete, onError);
    expect(dets).toContainEqual({ value: "Jean Morvan", category: "NAME" });
    expect(onError).not.toHaveBeenCalled();
  });

  it("still signals onError when the model is unreachable (unchanged)", async () => {
    const complete = vi.fn(async () => { throw new Error("ECONNREFUSED"); }) as unknown as CompleteFn;
    const onError = vi.fn();
    const dets = await detectWithModel("Contactez Jean Morvan.", complete, onError);
    expect(dets).toEqual([]);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("signals onError for prose containing an UNRELATED JSON array (audit: stray-array fail-open)", async () => {
    // The first-`[`/last-`]` slice of a reasoning reply can grab a list that is not
    // findings at all — it parsed as a valid array of numbers, produced zero
    // detections AND never raised onError: a silent fail-open.
    const complete = vi.fn(async () => "Considering the text, the top items are [1, 2, 3] as noted.") as unknown as CompleteFn;
    const onError = vi.fn();
    const dets = await detectWithModel("Contactez Jean Morvan.", complete, onError);
    expect(dets).toEqual([]);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe("discoverSecrets — fail-closed parity (the marker-mode semantic path)", () => {
  it("surfaces an unparseable model reply through options.onError", async () => {
    // discoverSecrets used to call detectWithModel WITHOUT an error channel, so the
    // exact H1 failure pinned above was silently swallowed on this public path.
    const complete = vi.fn(async () => "I can't help with that request.") as unknown as CompleteFn;
    const onError = vi.fn();
    const matches = await discoverSecrets("Contactez Jean Morvan à Paris.", { complete, onError });
    expect(matches).toEqual([]);
    expect(onError).toHaveBeenCalledTimes(1); // callers can now block instead of degrading
  });

  it("surfaces a THROWN local detector too", async () => {
    const onError = vi.fn();
    const matches = await discoverSecrets("Contactez Jean Morvan.", {
      detectLocal: async () => { throw new Error("weights not loaded"); },
      onError,
    });
    expect(matches).toEqual([]);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
