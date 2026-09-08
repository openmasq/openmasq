// Server-sent events, frame by frame: a Transform that re-assembles frames from the byte
// stream, hands each one to a rewriter, and serialises what comes back. Lines the rewriter
// does not understand pass through untouched; the byte stream is never held longer than one
// frame.
import { Transform, type TransformCallback } from "node:stream";

export interface SseFrame {
  event?: string;
  data: string;
}

/** A frame → zero or more frames (a text delta may be held back, a flush may add one). */
export type FrameRewriter = (frame: SseFrame) => SseFrame[];

export function parseFrame(raw: string): SseFrame | null {
  let event: string | undefined;
  const data: string[] = [];
  for (const line of raw.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
    // `id:`/`retry:`/comments are not carried by either provider; dropped on rewrite.
  }
  if (data.length === 0) return null;
  return event ? { event, data: data.join("\n") } : { data: data.join("\n") };
}

export function serializeFrame(f: SseFrame): string {
  return (f.event ? `event: ${f.event}\n` : "") + `data: ${f.data}\n\n`;
}

export class SseTransform extends Transform {
  private carry = "";

  constructor(
    private readonly rewrite: FrameRewriter,
    private readonly onEnd: () => SseFrame[] = () => [],
  ) {
    super();
  }

  override _transform(chunk: Buffer, _enc: BufferEncoding, cb: TransformCallback): void {
    this.carry += chunk.toString("utf8");
    let at: number;
    // A frame ends on a blank line; both CRLF and LF are seen in the wild.
    while ((at = this.carry.search(/\r?\n\r?\n/)) !== -1) {
      const sep = this.carry.slice(at).match(/^\r?\n\r?\n/)![0];
      const raw = this.carry.slice(0, at).replace(/\r/g, "");
      this.carry = this.carry.slice(at + sep.length);
      this.emitFrames(raw);
    }
    cb();
  }

  override _flush(cb: TransformCallback): void {
    const raw = this.carry.replace(/\r/g, "").trim();
    this.carry = "";
    if (raw) this.emitFrames(raw);
    for (const f of this.onEnd()) this.push(serializeFrame(f));
    cb();
  }

  private emitFrames(raw: string): void {
    const frame = parseFrame(raw);
    if (!frame) {
      this.push(`${raw}\n\n`);
      return;
    }
    for (const f of this.rewrite(frame)) this.push(serializeFrame(f));
  }
}
