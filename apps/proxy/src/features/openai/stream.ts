// Chat Completions streaming: one restorer per choice for the text, one per (choice, tool
// call) for the arguments. What a restorer holds back is released on the choice's
// `finish_reason` frame, or in a synthetic frame before `[DONE]`.
import type { Vault } from "@openmasq/redact";
import { StreamRestorer } from "../../lib/restorer.js";
import type { SseFrame } from "../../lib/sse.js";
import type { RestoreFns } from "./wire.js";
import { isRecord } from "../../lib/json.js";

export class OpenAiStreamRewriter {
  private readonly text = new Map<number, StreamRestorer>();
  private readonly args = new Map<string, StreamRestorer>();
  private skeleton: Record<string, unknown> | null = null;

  constructor(
    private readonly vault: Vault,
    private readonly fns: RestoreFns,
  ) {}

  rewrite = (frame: SseFrame): SseFrame[] => {
    if (frame.data.trim() === "[DONE]") return [...this.drain(), frame];
    let json: unknown;
    try {
      json = JSON.parse(frame.data);
    } catch {
      return [frame];
    }
    if (!isRecord(json) || !Array.isArray(json.choices)) return [frame];
    this.skeleton ??= {
      id: json.id,
      object: json.object,
      created: json.created,
      model: json.model,
    };
    const choices = json.choices.map((ch) => (isRecord(ch) ? this.rewriteChoice(ch) : ch));
    return [{ ...frame, data: JSON.stringify({ ...json, choices }) }];
  };

  /** End of stream without a `[DONE]`: still release what is held. */
  end = (): SseFrame[] => this.drain();

  private rewriteChoice(ch: Record<string, unknown>): Record<string, unknown> {
    const index = typeof ch.index === "number" ? ch.index : 0;
    if (!isRecord(ch.delta)) return ch;
    const delta: Record<string, unknown> = { ...ch.delta };
    if (typeof delta.content === "string") delta.content = this.restorer(index).push(delta.content);
    if (Array.isArray(delta.tool_calls)) {
      delta.tool_calls = delta.tool_calls.map((c) => {
        if (!isRecord(c) || !isRecord(c.function) || typeof c.function.arguments !== "string")
          return c;
        const key = `${index}:${typeof c.index === "number" ? c.index : 0}`;
        return {
          ...c,
          function: { ...c.function, arguments: this.argRestorer(key).push(c.function.arguments) },
        };
      });
    }
    if (ch.finish_reason) {
      // The choice is over: everything held back for it goes out in this very frame.
      const tail = this.restorer(index).flush();
      if (tail) delta.content = (typeof delta.content === "string" ? delta.content : "") + tail;
      for (const [key, r] of this.args) {
        if (!key.startsWith(`${index}:`)) continue;
        const rest = r.flush();
        if (!rest) continue;
        const callIndex = Number(key.slice(key.indexOf(":") + 1));
        const calls = Array.isArray(delta.tool_calls) ? [...delta.tool_calls] : [];
        calls.push({ index: callIndex, function: { arguments: rest } });
        delta.tool_calls = calls;
      }
    }
    return { ...ch, delta };
  }

  /** Synthetic frames for anything still held (a stream that ended without finish_reason). */
  private drain(): SseFrame[] {
    const out: SseFrame[] = [];
    for (const [index, r] of this.text) {
      const tail = r.flush();
      if (tail) out.push(this.frame({ index, delta: { content: tail }, finish_reason: null }));
    }
    for (const [key, r] of this.args) {
      const rest = r.flush();
      if (!rest) continue;
      const [ci, ti] = key.split(":").map(Number);
      out.push(
        this.frame({
          index: ci,
          delta: { tool_calls: [{ index: ti, function: { arguments: rest } }] },
          finish_reason: null,
        }),
      );
    }
    return out;
  }

  private frame(choice: Record<string, unknown>): SseFrame {
    return { data: JSON.stringify({ ...(this.skeleton ?? {}), choices: [choice] }) };
  }

  private restorer(index: number): StreamRestorer {
    let r = this.text.get(index);
    if (!r) this.text.set(index, (r = new StreamRestorer(this.vault, this.fns.reply)));
    return r;
  }

  private argRestorer(key: string): StreamRestorer {
    let r = this.args.get(key);
    if (!r) this.args.set(key, (r = new StreamRestorer(this.vault, this.fns.args)));
    return r;
  }
}
