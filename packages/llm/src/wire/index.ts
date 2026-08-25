/**
 * The provider WIRE layer — how a provider's bytes are read, and nothing else.
 *
 * Two places in this monorepo speak the providers' streaming protocols: the desktop
 * client (`providers/` + `tools/`) and the metering gateway (`apps/gateway`).
 * They ask the same bytes different
 * questions, but there must be ONE answer to each — a meter that reads a frame
 * differently from the journal that displays it is a silent billing divergence, not a
 * style difference (root rule 9).
 *
 * Deliberately SDK-free and side-effect-free, like `../pricing.ts`: the gateway
 * bundles this without pulling in a provider client.
 */
export { readSSE, sseDataPayloads, sseJsonEvents, SSE_IDLE_TIMEOUT_MS } from "./sse.js";
export {
  anthropicUsage,
  openaiUsage,
  googleUsage,
  anthropicUsageFromSse,
  openaiUsageFromSse,
} from "./usage.js";
export {
  openaiStreamedText,
  anthropicStreamedText,
  openaiPromptText,
  anthropicPromptText,
  estimateTokens,
  CHARS_PER_TOKEN,
} from "./streamText.js";
export type { TokenUsage } from "../types.js";
