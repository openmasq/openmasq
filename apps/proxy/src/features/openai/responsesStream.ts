// Responses API streaming: text deltas restored for the reader, function-call argument
// deltas for the executor, each per output item. A `*.done` event carries the FULL text (or
// arguments): what the item's restorer still holds goes out in a synthetic delta right
// before it, and the done payload itself is restored whole. The terminal `response.*`
// events embed the whole response: restored like the non-streaming reply.
import type { Vault } from "@openmasq/redact";
import { isRecord } from "../../lib/json.js";
import { StreamRestorer } from "../../lib/restorer.js";
import type { SseFrame } from "../../lib/sse.js";
import { restoreResponsesResponse, type RestoreFns } from "./wire.js";

export class ResponsesStreamRewriter {
  private readonly text = new Map<string, StreamRestorer>();
  private readonly args = new Map<string, StreamRestorer>();
  /** What each item has released so far — a `*.done` event carries the FULL text, so the
   *  last delta is whatever the restored whole still lacks, even if the upstream's deltas
   *  stopped short of it. */
  private readonly released = new Map<string, string>();

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
    if (!isRecord(json) || typeof json.type !== "string") return [frame];
    const key = `${json.item_id ?? json.output_index ?? 0}:${json.content_index ?? 0}`;
    const emit = (data: Record<string, unknown>): SseFrame => ({
      ...frame,
      data: JSON.stringify(data),
    });
    switch (json.type) {
      case "response.output_text.delta":
        return [
          emit({
            ...json,
            delta: this.release(this.text, "t:" + key, this.fns.reply, String(json.delta ?? "")),
          }),
        ];
      case "response.output_text.done": {
        const full = typeof json.text === "string" ? this.fns.reply(json.text) : undefined;
        const tail = this.finish(this.text, "t:" + key, full);
        const done = emit({ ...json, text: full ?? json.text });
        return tail
          ? [
              {
                event: "response.output_text.delta",
                data: JSON.stringify({
                  ...json,
                  type: "response.output_text.delta",
                  delta: tail,
                  text: undefined,
                }),
              },
              done,
            ]
          : [done];
      }
      case "response.function_call_arguments.delta":
        return [
          emit({
            ...json,
            delta: this.release(this.args, "a:" + key, this.fns.args, String(json.delta ?? "")),
          }),
        ];
      case "response.function_call_arguments.done": {
        const full = typeof json.arguments === "string" ? this.fns.args(json.arguments) : undefined;
        const tail = this.finish(this.args, "a:" + key, full);
        const done = emit({ ...json, arguments: full ?? json.arguments });
        return tail
          ? [
              {
                event: "response.function_call_arguments.delta",
                data: JSON.stringify({
                  ...json,
                  type: "response.function_call_arguments.delta",
                  delta: tail,
                  arguments: undefined,
                }),
              },
              done,
            ]
          : [done];
      }
      case "response.content_part.done":
        return [
          emit({
            ...json,
            part:
              isRecord(json.part) && typeof json.part.text === "string"
                ? { ...json.part, text: this.fns.reply(json.part.text) }
                : json.part,
          }),
        ];
      case "response.output_item.done":
        return [
          emit({
            ...json,
            item: isRecord(json.item)
              ? restoreResponsesResponse({ output: [json.item] }, this.fns).output
              : json.item,
          }),
        ].map((f) => {
          // `restoreResponsesResponse` wraps the item in an output list; unwrap it again.
          const d = JSON.parse(f.data) as Record<string, unknown>;
          return {
            ...f,
            data: JSON.stringify({ ...d, item: Array.isArray(d.item) ? d.item[0] : d.item }),
          };
        });
      case "response.completed":
      case "response.incomplete":
      case "response.failed":
        return [
          emit({
            ...json,
            response: isRecord(json.response)
              ? restoreResponsesResponse(json.response, this.fns)
              : json.response,
          }),
        ];
      default:
        return [frame];
    }
  };

  /** A cut connection: release what every open item still holds, as deltas. */
  end = (): SseFrame[] => {
    const out: SseFrame[] = [];
    for (const [key, r] of this.text) {
      const tail = r.flush();
      if (tail)
        out.push({
          event: "response.output_text.delta",
          data: JSON.stringify({
            type: "response.output_text.delta",
            item_id: key.split(":")[0],
            delta: tail,
          }),
        });
    }
    for (const [key, r] of this.args) {
      const tail = r.flush();
      if (tail)
        out.push({
          event: "response.function_call_arguments.delta",
          data: JSON.stringify({
            type: "response.function_call_arguments.delta",
            item_id: key.split(":")[0],
            delta: tail,
          }),
        });
    }
    this.text.clear();
    this.args.clear();
    this.released.clear();
    return out;
  };

  private restorer(
    map: Map<string, StreamRestorer>,
    key: string,
    fn: (t: string) => string,
  ): StreamRestorer {
    let r = map.get(key);
    if (!r) map.set(key, (r = new StreamRestorer(this.vault, fn)));
    return r;
  }

  private release(
    map: Map<string, StreamRestorer>,
    key: string,
    fn: (t: string) => string,
    delta: string,
  ): string {
    const out = this.restorer(map, key, fn).push(delta);
    this.released.set(key, (this.released.get(key) ?? "") + out);
    return out;
  }

  /** The item's last delta: what the restored whole still lacks after what was released;
   *  without a whole (no text in the done event), whatever the restorer still holds. */
  private finish(map: Map<string, StreamRestorer>, key: string, full: string | undefined): string {
    const held = map.get(key)?.flush() ?? "";
    map.delete(key);
    const done = this.released.get(key) ?? "";
    this.released.delete(key);
    if (full !== undefined && full.startsWith(done)) return full.slice(done.length);
    return held;
  }
}
