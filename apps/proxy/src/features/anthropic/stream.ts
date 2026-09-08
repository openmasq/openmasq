// Messages streaming: one restorer per content block — `text_delta` restored for the reader,
// `input_json_delta` (a tool use's input, as JSON fragments) for the executor. What a block's
// restorer holds back goes out in a synthetic delta right before its `content_block_stop`.
import type { Vault } from "@openmasq/redact";
import { StreamRestorer } from "../../lib/restorer.js";
import type { SseFrame } from "../../lib/sse.js";
import type { RestoreFns } from "../openai/wire.js";
import { isRecord } from "../../lib/json.js";

export class AnthropicStreamRewriter {
  private readonly blocks = new Map<number, { kind: "text" | "json"; r: StreamRestorer }>();

  constructor(
    private readonly vault: Vault,
    private readonly fns: RestoreFns,
  ) {}

  rewrite = (frame: SseFrame): SseFrame[] => {
    let json: unknown;
    try {
      json = JSON.parse(frame.data);
    } catch {
      return [frame];
    }
    if (!isRecord(json)) return [frame];
    const index = typeof json.index === "number" ? json.index : 0;
    switch (json.type) {
      case "content_block_start": {
        const kind =
          isRecord(json.content_block) && json.content_block.type === "tool_use" ? "json" : "text";
        this.blocks.set(index, {
          kind,
          r: new StreamRestorer(this.vault, kind === "json" ? this.fns.args : this.fns.reply),
        });
        return [frame];
      }
      case "content_block_delta": {
        const block = this.blocks.get(index);
        if (!block || !isRecord(json.delta)) return [frame];
        const delta = { ...json.delta };
        if (delta.type === "text_delta" && typeof delta.text === "string")
          delta.text = block.r.push(delta.text);
        else if (delta.type === "input_json_delta" && typeof delta.partial_json === "string") {
          delta.partial_json = block.r.push(delta.partial_json);
        }
        return [{ ...frame, data: JSON.stringify({ ...json, delta }) }];
      }
      case "content_block_stop": {
        const block = this.blocks.get(index);
        if (!block) return [frame];
        this.blocks.delete(index);
        const tail = block.r.flush();
        if (!tail) return [frame];
        const delta =
          block.kind === "json"
            ? { type: "input_json_delta", partial_json: tail }
            : { type: "text_delta", text: tail };
        return [
          {
            event: "content_block_delta",
            data: JSON.stringify({ type: "content_block_delta", index, delta }),
          },
          frame,
        ];
      }
      default:
        return [frame];
    }
  };

  /** End of stream with blocks still open (a cut connection): release what is held. */
  end = (): SseFrame[] => {
    const out: SseFrame[] = [];
    for (const [index, block] of this.blocks) {
      const tail = block.r.flush();
      if (!tail) continue;
      const delta =
        block.kind === "json"
          ? { type: "input_json_delta", partial_json: tail }
          : { type: "text_delta", text: tail };
      out.push({
        event: "content_block_delta",
        data: JSON.stringify({ type: "content_block_delta", index, delta }),
      });
    }
    this.blocks.clear();
    return out;
  };
}
