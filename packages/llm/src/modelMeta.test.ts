import { describe, it, expect } from "vitest";
import { MODELS } from "./models";
import { MODEL_META, modelMeta } from "./modelMeta";

describe("MODEL_META", () => {
  it("covers every model in MODELS (no missing metadata)", () => {
    const missing = MODELS.filter((mdl) => !MODEL_META[mdl.id]).map((mdl) => mdl.id);
    expect(missing).toEqual([]);
  });

  it("profile values are all integers in 1..5", () => {
    for (const [id, meta] of Object.entries(MODEL_META)) {
      for (const [k, v] of Object.entries(meta.profile)) {
        expect(Number.isInteger(v), `${id}.${k}=${v} not an int`).toBe(true);
        expect(v >= 1 && v <= 5, `${id}.${k}=${v} out of 1..5`).toBe(true);
      }
    }
  });

  it("carries NO fabricated benchmark numbers (honesty invariant)", () => {
    for (const meta of Object.values(MODEL_META)) {
      expect(meta.benchmarks).toBeUndefined();
    }
  });

  it("modelMeta() falls back gracefully for an unknown id", () => {
    const meta = modelMeta("some-legacy-alias-xyz");
    expect(meta.profile.reasoning).toBeGreaterThanOrEqual(1);
    expect(meta.profile.reasoning).toBeLessThanOrEqual(5);
  });
});
