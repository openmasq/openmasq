import type { TrackEvent } from "../analytics/events";

export interface ModelLatencyInput {
  provider: string;
  model: string;
  /** Model-dispatch instant (reset just before each dispatch, so the redaction pre-pass
   *  isn't counted); `tFirst` = the first streamed token instant → TTFT. */
  t0: number;
  tFirst: number;
  output: number;
  tools: boolean;
  toolCount: number;
  inputTokens: number;
  /** `Date.now()` at emit — injected so the builder is pure + unit-testable. */
  nowMs: number;
}

/**
 * Build the anonymised `model_latency` telemetry event, or `null` when there's nothing
 * to report (pure). Emits as soon as there's a first token — even with ZERO output
 * tokens: a TOOL-FIRST agentic turn (a tool call, no prose) has `output === 0`, and the
 * old `output <= 0` guard DROPPED exactly those turns, hiding the slowest (298-tool)
 * cases from the TTFT distribution. Throughput is 0 when there's no prose. Numeric only,
 * never content (the sanitize allow-list drops anything else).
 */
export function buildModelLatencyEvent(i: ModelLatencyInput): TrackEvent | null {
  if (!i.t0 || !i.tFirst) return null;
  const genMs = Math.max(1, i.nowMs - i.tFirst);
  return {
    name: "model_latency",
    provider: i.provider,
    model: i.model,
    ttftMs: i.tFirst - i.t0,
    tokensPerSec: i.output > 0 ? Math.round(i.output / (genMs / 1000)) : 0,
    output: i.output,
    tools: i.tools,
    toolCount: i.toolCount,
    inputTokens: i.inputTokens,
  };
}
