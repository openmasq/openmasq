import { describe, expect, it, vi } from "vitest";
import { batchRedact } from "./batch";
import { pseudonymize } from "../model/pseudonymize";
import type { Vault } from "../types";

describe("batchRedact", () => {
  it("redacts N texts in ONE engine pass and splits them back", async () => {
    const redactOne = vi.fn(async (t: string) => t.replace(/secret/g, "***"));
    const out = await batchRedact(["a secret", "b", "c secret"], redactOne);
    expect(out).toEqual(["a ***", "b", "c ***"]);
    expect(redactOne).toHaveBeenCalledTimes(1); // ONE round-trip / inference for 3 texts
  });

  it("passes 0 and 1 texts straight through", async () => {
    const redactOne = vi.fn(async (t: string) => t.toUpperCase());
    expect(await batchRedact([], redactOne)).toEqual([]);
    expect(redactOne).not.toHaveBeenCalled();
    expect(await batchRedact(["x"], redactOne)).toEqual(["X"]);
    expect(redactOne).toHaveBeenCalledTimes(1);
  });

  it("is vault-atomic: a value in two results gets ONE fake, shared by both", async () => {
    const REAL = "julien.sabourdin@acme.io"; // regex-detected email
    const vault: Vault = {};
    const [r1, r2] = await batchRedact(
      [`from ${REAL} (A)`, `cc ${REAL} (B)`],
      async (t) => (await pseudonymize(t, { vault })).text,
    );
    const fakes = Object.entries(vault)
      .filter(([, real]) => real === REAL)
      .map(([f]) => f);
    expect(fakes).toHaveLength(1); // single pass ⇒ one fake for the value
    expect(r1).toContain(fakes[0]);
    expect(r2).toContain(fakes[0]);
    expect(r1).not.toContain(REAL);
    expect(r2).not.toContain(REAL);
  });

  it("falls back to per-text redaction when the sentinel doesn't survive", async () => {
    // A redactor that mangles the sentinel (e.g. a model paraphrase) → the split count
    // won't match, so we must NOT mis-attribute; batchRedact re-runs per text.
    const redactOne = vi.fn(async (t: string) =>
      t.includes("OPENMASQ_BATCH_SEP") ? t.replace(/␞+ OPENMASQ_BATCH_SEP ␞+/g, "—") : `[${t}]`,
    );
    const out = await batchRedact(["one", "two"], redactOne);
    expect(out).toEqual(["[one]", "[two]"]); // per-text fallback
    // 1 batched attempt (mangled) + 2 per-text = 3 calls.
    expect(redactOne).toHaveBeenCalledTimes(3);
  });

  it("the fallback runs per-text passes SEQUENTIALLY — never two engine passes on the shared vault", async () => {
    // Two concurrent check-then-write allocations can mint TWO fakes for one value; the
    // caller serialises passes for exactly that reason, so the fallback must too.
    let active = 0;
    let maxActive = 0;
    const redactOne = vi.fn(async (t: string) => {
      if (t.includes("OPENMASQ_BATCH_SEP")) return "sentinel perdu"; // force the fallback
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 0));
      active--;
      return `[${t}]`;
    });
    const out = await batchRedact(["one", "two", "three"], redactOne);
    expect(out).toEqual(["[one]", "[two]", "[three]"]);
    expect(maxActive).toBe(1);
  });
});
