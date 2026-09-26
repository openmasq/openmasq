// Chat Completions streaming: one restorer per choice for the text, one per choice for
// Mistral's `thinking`, one per (choice, tool call) for the arguments. What a restorer holds
// back is released on the choice's `finish_reason` frame, or in a synthetic frame before
// `[DONE]`. Mistral may stream `delta.content` as an ARRAY of parts, and a tool call's
// `arguments` as a whole OBJECT: both are restored where they stand.
import type { Vault } from "@openmasq/redact";
import { StreamRestorer } from "../../lib/restorer.js";
import type { SseFrame } from "../../lib/sse.js";
import { restoreArgs, type RestoreFns } from "./wire.js";
import { isRecord } from "../../lib/json.js";

/** A held-back tail, put back into `delta.content` in whatever shape the stream uses: a
 *  string stays a string; a thinking tail forces the part list (it has no string form). */
function withTails(content: unknown, text: string, thinking: string): unknown {
  if (!text && !thinking) return content;
  const thinkPart = {
    type: "thinking",
    thinking: [{ type: "text", text: thinking }],
  };
  if (!thinking && !Array.isArray(content))
    return (typeof content === "string" ? content : "") + text;
  const parts: unknown[] = Array.isArray(content)
    ? [...content]
    : typeof content === "string" && content
      ? [{ type: "text", text: content }]
      : [];
  if (thinking) parts.unshift(thinkPart);
  if (text) parts.push({ type: "text", text });
  return parts;
}

export class OpenAiStreamRewriter {
  private readonly text = new Map<number, StreamRestorer>();
  private readonly think = new Map<number, StreamRestorer>();
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
    else if (Array.isArray(delta.content))
      delta.content = delta.content.map((part) => this.rewritePart(index, part));
    if (Array.isArray(delta.tool_calls)) {
      delta.tool_calls = delta.tool_calls.map((c) => {
        if (!isRecord(c) || !isRecord(c.function)) return c;
        // A whole object arrives in one frame: nothing to hold back, restore it now.
        if (isRecord(c.function.arguments))
          return {
            ...c,
            function: {
              ...c.function,
              arguments: restoreArgs(c.function.arguments, this.fns.args),
            },
          };
        if (typeof c.function.arguments !== "string") return c;
        const key = `${index}:${typeof c.index === "number" ? c.index : 0}`;
        return {
          ...c,
          function: { ...c.function, arguments: this.argRestorer(key).push(c.function.arguments) },
        };
      });
    }
    if (ch.finish_reason) {
      // The choice is over: everything held back for it goes out in this very frame.
      delta.content = withTails(
        delta.content,
        this.restorer(index).flush(),
        this.thinker(index).flush(),
      );
      if (delta.content === undefined) delete delta.content;
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
    for (const index of new Set([...this.text.keys(), ...this.think.keys()])) {
      const content = withTails(
        undefined,
        this.restorer(index).flush(),
        this.thinker(index).flush(),
      );
      if (content !== undefined)
        out.push(this.frame({ index, delta: { content }, finish_reason: null }));
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
    return {
      data: JSON.stringify({ ...(this.skeleton ?? {}), choices: [choice] }),
    };
  }

  /** One part of an array `delta.content`: text through the text restorer, a thinking part's
   *  text through the thinking one (they are two streams, each with its own held-back tail). */
  private rewritePart(index: number, part: unknown): unknown {
    if (!isRecord(part)) return part;
    if (part.type === "text" && typeof part.text === "string")
      return { ...part, text: this.restorer(index).push(part.text) };
    if (part.type !== "thinking") return part;
    const r = this.thinker(index);
    if (typeof part.thinking === "string") return { ...part, thinking: r.push(part.thinking) };
    if (!Array.isArray(part.thinking)) return part;
    return {
      ...part,
      thinking: part.thinking.map((t) =>
        isRecord(t) && typeof t.text === "string" ? { ...t, text: r.push(t.text) } : t,
      ),
    };
  }

  private thinker(index: number): StreamRestorer {
    let r = this.think.get(index);
    if (!r) this.think.set(index, (r = new StreamRestorer(this.vault, this.fns.reply)));
    return r;
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
