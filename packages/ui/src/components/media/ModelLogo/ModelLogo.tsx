import type { ProviderId } from "@openmasq/llm";
import { MarkArt, MarkTile, modelMark } from "./marks";

/**
 * ModelLogo — the brand mark for a model. Pass `modelId` to get the model's REAL
 * vendor logo: a platform gateway like OpenRouter / Scaleway hosts DeepSeek,
 * Kimi, Qwen… and an OpenRouter id namespaces its vendor (`anthropic/claude…`) —
 * each shows its own mark (`marks.ts` `modelMark`). Without an id the mark falls
 * back to the provider glyph. `tile` sits it inside a rounded brand tile
 * (conversation gutter + picker).
 */
export function ModelLogo({
  provider,
  modelId,
  size = 22,
  tile = false,
}: {
  provider: ProviderId;
  modelId?: string;
  size?: number;
  tile?: boolean;
}) {
  const mark = modelMark(provider, modelId);
  if (!tile) {
    return (
      <span className="icon-wrap">
        <MarkArt mark={mark} px={size} />
      </span>
    );
  }
  return <MarkTile mark={mark} size={size} />;
}
