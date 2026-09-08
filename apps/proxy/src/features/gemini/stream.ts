// `:streamGenerateContent?alt=sse`: each frame is a whole response object whose text parts
// are DELTAS. One restorer per candidate index; a function call arrives as a whole part and
// is restored in place. A frame with `finishReason` closes the candidate: what its restorer
// still holds is appended to that frame's text.
import type { Vault } from "@openmasq/redact";
import { isRecord } from "../../lib/json.js";
import { StreamRestorer } from "../../lib/restorer.js";
import type { SseFrame } from "../../lib/sse.js";
import type { RestoreFns } from "../openai/wire.js";
import { restoreParts } from "./wire.js";

export class GeminiStreamRewriter {
  private readonly text = new Map<number, StreamRestorer>();

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
    if (!isRecord(json) || !Array.isArray(json.candidates)) return [frame];
    const candidates = json.candidates.map((c) => {
      if (!isRecord(c) || !isRecord(c.content)) return c;
      const index = typeof c.index === "number" ? c.index : 0;
      const parts = Array.isArray(c.content.parts) ? c.content.parts : [];
      const rewritten = parts.map((p) =>
        isRecord(p) && typeof p.text === "string"
          ? { ...p, text: this.restorer(index).push(p.text) }
          : p,
      );
      const restored = restoreParts(
        rewritten.filter((p) => !(isRecord(p) && typeof p.text === "string")),
        this.fns,
      );
      // Text parts already went through the restorer; the other parts (function calls) are restored whole.
      const merged = rewritten.map((p) =>
        isRecord(p) && typeof p.text === "string" ? p : (restored as unknown[]).shift(),
      );
      if (c.finishReason) {
        const tail = this.text.get(index)?.flush() ?? "";
        this.text.delete(index);
        if (tail) merged.push({ text: tail });
      }
      return { ...c, content: { ...c.content, parts: merged } };
    });
    return [{ ...frame, data: JSON.stringify({ ...json, candidates }) }];
  };

  /** A cut connection: release what every open candidate still holds. */
  end = (): SseFrame[] => {
    const out: SseFrame[] = [];
    for (const [index, r] of this.text) {
      const tail = r.flush();
      if (tail)
        out.push({
          data: JSON.stringify({
            candidates: [{ index, content: { role: "model", parts: [{ text: tail }] } }],
          }),
        });
    }
    this.text.clear();
    return out;
  };

  private restorer(index: number): StreamRestorer {
    let r = this.text.get(index);
    if (!r) this.text.set(index, (r = new StreamRestorer(this.vault, this.fns.reply)));
    return r;
  }
}
