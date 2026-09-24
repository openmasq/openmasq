// Restores a vault's tokens in text that arrives in PIECES. A fake can straddle two deltas
// ("Marc Cha" + "rvet"): the restorer holds back the shortest tail that could still be the
// start of a token, restores the rest, and releases the tail once it can no longer match.
// The client sees the same stream, a few characters late — never a half-restored name.
import type { Vault } from "@openmasq/redact";

export class StreamRestorer {
  private readonly tokens: string[];
  private readonly maxLen: number;
  private buf = "";

  constructor(
    vault: Vault,
    private readonly restore: (text: string) => string,
  ) {
    this.tokens = Object.keys(vault).filter(Boolean);
    this.maxLen = this.tokens.reduce((m, t) => Math.max(m, t.length), 0);
  }

  /** Feed a delta; returns the text that can be released now (possibly ""). */
  push(delta: string): string {
    if (!delta) return "";
    this.buf += delta;
    if (this.maxLen === 0) {
      const out = this.buf;
      this.buf = "";
      return out;
    }
    const cut = this.safeCut();
    const out = this.restore(this.buf.slice(0, cut));
    this.buf = this.buf.slice(cut);
    return out;
  }

  /** End of stream: release everything, restored. */
  flush(): string {
    const out = this.restore(this.buf);
    this.buf = "";
    return out;
  }

  /** Buffered characters not yet released. */
  get pending(): number {
    return this.buf.length;
  }

  /**
   * Where the buffer can be cut. Two steps, in this order:
   *  1. everything up to the end of a COMPLETE token occurrence is releasable — provided no
   *     longer token could still be extending it (`n1` inside a possible `n12`). Without this
   *     floor, the last letters of a complete fake could be mistaken for the start of a shorter
   *     token (the `m` of `…@melvio.com` starting `melvio.com`) and the fake released cut;
   *  2. past that floor, hold the shortest tail that could still begin a token.
   */
  private safeCut(): number {
    const len = this.buf.length;
    let floor = 0;
    for (const t of this.tokens) {
      for (let i = this.buf.indexOf(t); i !== -1; i = this.buf.indexOf(t, i + 1)) {
        const rest = this.buf.slice(i);
        const extendable = this.tokens.some((u) => u.length > rest.length && u.startsWith(rest));
        if (!extendable) floor = Math.max(floor, i + t.length);
      }
    }
    const from = Math.max(floor, len - this.maxLen + 1);
    for (let p = from; p < len; p++) {
      const tail = this.buf.slice(p);
      for (const t of this.tokens) {
        if (t.length > tail.length && t.startsWith(tail)) return p;
      }
    }
    return len;
  }
}
