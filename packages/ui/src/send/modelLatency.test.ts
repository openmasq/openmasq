import { describe, it, expect } from "vitest";
import { buildModelLatencyEvent } from "./modelLatency";

const base = {
  provider: "openrouter",
  model: "nemotron",
  tools: false,
  toolCount: 0,
  inputTokens: 100,
};

describe("buildModelLatencyEvent", () => {
  it("returns null when there was no dispatch (t0=0) or no first token (tFirst=0)", () => {
    expect(buildModelLatencyEvent({ ...base, t0: 0, tFirst: 500, output: 10, nowMs: 1000 })).toBeNull();
    expect(buildModelLatencyEvent({ ...base, t0: 500, tFirst: 0, output: 10, nowMs: 1000 })).toBeNull();
  });

  it("computes ttftMs = tFirst - t0 and throughput = output / gen-seconds", () => {
    const e = buildModelLatencyEvent({ ...base, t0: 1000, tFirst: 1200, output: 40, nowMs: 3200 });
    expect(e).not.toBeNull();
    expect(e).toMatchObject({
      name: "model_latency",
      ttftMs: 200, // 1200 - 1000
      // genMs = 3200 - 1200 = 2000ms → 2s; 40 / 2 = 20 tok/s
      tokensPerSec: 20,
      output: 40,
      inputTokens: 100,
    });
  });

  it("still emits a TOOL-FIRST turn (output 0) — throughput 0, not dropped", () => {
    const e = buildModelLatencyEvent({
      ...base,
      tools: true,
      toolCount: 298,
      t0: 1000,
      tFirst: 5000,
      output: 0,
      nowMs: 5000,
    });
    expect(e).not.toBeNull();
    expect(e).toMatchObject({ ttftMs: 4000, tokensPerSec: 0, output: 0, tools: true, toolCount: 298 });
  });

  it("floors gen time to ≥1ms so throughput never divides by zero", () => {
    const e = buildModelLatencyEvent({ ...base, t0: 100, tFirst: 200, output: 5, nowMs: 200 });
    // genMs = max(1, 200-200) = 1ms → 5 / 0.001 = 5000 tok/s
    expect(e).toMatchObject({ tokensPerSec: 5000 });
  });
});
